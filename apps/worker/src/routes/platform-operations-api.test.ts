import type { AuthContext, PlatformAuditEvent, WorkspaceDataRoute } from '@fieldrep/domain'
import { describe, expect, it } from 'vitest'

import {
  createPlatformOperationsApi,
  type PlatformOperationsDependencies,
  type PlatformOperationsGateway,
} from './platform-operations-api'

function authContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'platform-admin-1',
    membershipId: 'membership-pa1',
    companyId: 'company-1',
    workspaceId: 'workspace-a',
    roleKeys: ['platform_admin'],
    permissions: ['audit.read.all', 'database_routes.read', 'database_routes.manage'],
    scopes: [{ type: 'platform' }],
    ...overrides,
  }
}

const auditEvent: PlatformAuditEvent = {
  id: 'e1',
  actorUserId: 'admin-1',
  actionKey: 'route.update',
  targetType: 'workspace',
  targetId: 'w1',
  companyId: 'company-1',
  workspaceId: 'w1',
  metadata: null,
  occurredAt: 1000,
}

const dataRoute: WorkspaceDataRoute = {
  workspaceId: 'w1',
  storeType: 'd1',
  storeIdentifier: 'db-w1',
  status: 'active',
  schemaVersion: 1,
  metadata: null,
  createdAt: 1000,
  updatedAt: 1000,
}

function gateway(overrides: Partial<PlatformOperationsGateway> = {}): PlatformOperationsGateway {
  return {
    listAuditEvents: async () => [auditEvent],
    listDataRoutes: async () => [dataRoute],
    getDataRoute: async () => dataRoute,
    upsertDataRoute: async (input) => ({ ...dataRoute, ...input }),
    ...overrides,
  }
}

function dependencies(
  gw: PlatformOperationsGateway,
  context: AuthContext | null = authContext(),
): PlatformOperationsDependencies {
  return {
    authContextResolver: { resolve: async () => context },
    platformOperations: () => gw,
  }
}

describe('platform operations API — audit center', () => {
  it('requires authentication before reading platform audit events', async () => {
    const app = createPlatformOperationsApi(dependencies(gateway(), null))
    const response = await app.request('/platform/audit-events')
    expect(response.status).toBe(401)
  })

  it('requires audit.read.all for platform audit reads', async () => {
    const app = createPlatformOperationsApi(
      dependencies(gateway(), authContext({ permissions: ['audit.read.workspace'] })),
    )
    const response = await app.request('/platform/audit-events')
    expect(response.status).toBe(403)
  })

  it('lists platform audit events and forwards narrowing filters', async () => {
    let received: unknown = null
    const gw = gateway({
      listAuditEvents: async (filters) => {
        received = filters
        return []
      },
    })
    const app = createPlatformOperationsApi(dependencies(gw))
    const response = await app.request(
      '/platform/audit-events?companyId=company-1&workspaceId=w1&actionKey=route.update&limit=10',
    )
    expect(response.status).toBe(200)
    const filters = received as { companyId: string; workspaceId: string; actionKey: string; limit: number }
    expect(filters.companyId).toBe('company-1')
    expect(filters.workspaceId).toBe('w1')
    expect(filters.actionKey).toBe('route.update')
    expect(filters.limit).toBe(10)
  })

  it('rejects a limit above the hard cap', async () => {
    const app = createPlatformOperationsApi(dependencies(gateway()))
    const response = await app.request('/platform/audit-events?limit=9999')
    expect(response.status).toBe(400)
  })

  it('returns the aggregated platform audit summary (target_type dimension)', async () => {
    const gw = gateway({
      listAuditEvents: async () => [
        auditEvent,
        { ...auditEvent, id: 'e2', targetId: 'w2', occurredAt: 2000 },
        { ...auditEvent, id: 'e3', actionKey: 'limits.update', targetType: 'company' },
      ],
    })
    const app = createPlatformOperationsApi(dependencies(gw))
    const response = await app.request('/platform/audit-events/report/summary')
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      summary: readonly { actionKey: string; entityType: string; count: number }[]
    }
    expect(body.summary).toHaveLength(2)
    expect(body.summary[0]!.actionKey).toBe('route.update')
    expect(body.summary[0]!.entityType).toBe('workspace')
    expect(body.summary[0]!.count).toBe(2)
  })
})

describe('platform operations API — data-route registry', () => {
  it('requires database_routes.read for route reads', async () => {
    const app = createPlatformOperationsApi(
      dependencies(gateway(), authContext({ permissions: ['audit.read.all'] })),
    )
    const response = await app.request('/platform/data-routes')
    expect(response.status).toBe(403)
  })

  it('returns 404 for an unknown route', async () => {
    const app = createPlatformOperationsApi(
      dependencies(gateway({ getDataRoute: async () => null })),
    )
    const response = await app.request('/platform/data-routes/missing')
    expect(response.status).toBe(404)
  })

  it('creates a route when none exists', async () => {
    const app = createPlatformOperationsApi(
      dependencies(gateway({ getDataRoute: async () => null })),
    )
    const response = await app.request('/platform/data-routes/w2', {
      method: 'PUT',
      body: JSON.stringify({ storeType: 'd1', storeIdentifier: 'db-w2', status: 'active', schemaVersion: 1 }),
    })
    expect(response.status).toBe(201)
  })

  it('rejects an invalid status transition with 409', async () => {
    const app = createPlatformOperationsApi(
      dependencies(gateway({ getDataRoute: async () => ({ ...dataRoute, status: 'disabled' }) })),
    )
    const response = await app.request('/platform/data-routes/w1', {
      method: 'PUT',
      body: JSON.stringify({ storeType: 'd1', storeIdentifier: 'db-w1', status: 'maintenance', schemaVersion: 1 }),
    })
    expect(response.status).toBe(409)
    expect(((await response.json()) as { error: string }).error).toBe('route_transition_invalid')
  })

  it('rejects an invalid payload with 400', async () => {
    const app = createPlatformOperationsApi(dependencies(gateway()))
    const response = await app.request('/platform/data-routes/w1', {
      method: 'PUT',
      body: JSON.stringify({ storeType: 'memory', storeIdentifier: 'x', status: 'active', schemaVersion: 1 }),
    })
    expect(response.status).toBe(400)
  })

  it('requires database_routes.manage for route writes', async () => {
    const app = createPlatformOperationsApi(
      dependencies(gateway(), authContext({ permissions: ['audit.read.all', 'database_routes.read'] })),
    )
    const response = await app.request('/platform/data-routes/w1', {
      method: 'PUT',
      body: JSON.stringify({ storeType: 'd1', storeIdentifier: 'db-w1', status: 'active', schemaVersion: 1 }),
    })
    expect(response.status).toBe(403)
  })
})
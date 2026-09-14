import type { AuthContext } from '@fieldrep/domain'
import { describe, expect, it } from 'vitest'

import {
  createAuditAdminApi,
  type AuditAdminDependencies,
  type AuditAdminGateway,
} from './audit-admin-api'

function authContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'admin-1',
    membershipId: 'membership-a1',
    companyId: 'company-1',
    workspaceId: 'workspace-a',
    roleKeys: ['workspace_admin'],
    permissions: ['audit.read.workspace', 'reports.read.workspace'],
    scopes: [{ type: 'workspace', id: 'workspace-a' }],
    ...overrides,
  }
}

function gateway(overrides: Partial<AuditAdminGateway> = {}): AuditAdminGateway {
  return {
    listAuditEvents: async () => [
      {
        id: 'a1',
        actorUserId: 'user-1',
        actionKey: 'plan.create',
        entityType: 'plan',
        entityId: 'plan-1',
        metadata: null,
        occurredAt: 1000,
      },
    ],
    ...overrides,
  }
}

function dependencies(
  gw: AuditAdminGateway,
  context: AuthContext | null = authContext(),
): AuditAdminDependencies {
  return {
    authContextResolver: { resolve: async () => context },
    auditForWorkspace: async (workspaceId) => {
      expect(workspaceId).toBe('workspace-a')
      return gw
    },
  }
}

describe('audit-admin API', () => {
  it('requires authentication before reading audit events', async () => {
    const app = createAuditAdminApi(dependencies(gateway(), null))
    const response = await app.request('/workspaces/workspace-a/audit-events')
    expect(response.status).toBe(401)
  })

  it('requires audit.read.workspace permission', async () => {
    const app = createAuditAdminApi(
      dependencies(gateway(), authContext({ permissions: ['plans.read.own'] })),
    )
    const response = await app.request('/workspaces/workspace-a/audit-events')
    expect(response.status).toBe(403)
  })

  it('rejects cross-workspace access before gateway resolution', async () => {
    let resolved = false
    const app = createAuditAdminApi({
      authContextResolver: { resolve: async () => authContext() },
      auditForWorkspace: async () => {
        resolved = true
        return gateway()
      },
    })
    const response = await app.request('/workspaces/workspace-b/audit-events')
    expect(response.status).toBe(403)
    expect(resolved).toBe(false)
  })

  it('lists audit events and forwards filters', async () => {
    let received: unknown = null
    const gw = gateway({
      listAuditEvents: async (filters) => {
        received = filters
        return []
      },
    })
    const app = createAuditAdminApi(dependencies(gw))
    const response = await app.request(
      '/workspaces/workspace-a/audit-events?actionKey=plan.create&entityType=plan&limit=10',
    )
    expect(response.status).toBe(200)
    const filters = received as { actionKey: string; entityType: string; limit: number }
    expect(filters.actionKey).toBe('plan.create')
    expect(filters.entityType).toBe('plan')
    expect(filters.limit).toBe(10)
  })

  it('rejects a limit above the hard cap', async () => {
    const app = createAuditAdminApi(dependencies(gateway()))
    const response = await app.request('/workspaces/workspace-a/audit-events?limit=9999')
    expect(response.status).toBe(400)
  })

  it('returns audit events with proper permission', async () => {
    const app = createAuditAdminApi(dependencies(gateway()))
    const response = await app.request('/workspaces/workspace-a/audit-events')
    expect(response.status).toBe(200)
    const body = (await response.json()) as { events: readonly { id: string }[] }
    expect(body.events).toHaveLength(1)
    expect(body.events[0]!.id).toBe('a1')
  })

  it('requires reports.read.workspace for the admin summary', async () => {
    const app = createAuditAdminApi(
      dependencies(gateway(), authContext({ permissions: ['audit.read.workspace'] })),
    )
    const response = await app.request('/workspaces/workspace-a/admin/report/audit-summary')
    expect(response.status).toBe(403)
  })

  it('returns the aggregated audit summary', async () => {
    const gw = gateway({
      listAuditEvents: async () => [
        {
          id: 'a1',
          actorUserId: 'user-1',
          actionKey: 'plan.create',
          entityType: 'plan',
          entityId: 'plan-1',
          metadata: null,
          occurredAt: 1000,
        },
        {
          id: 'a2',
          actorUserId: 'user-1',
          actionKey: 'plan.create',
          entityType: 'plan',
          entityId: 'plan-2',
          metadata: null,
          occurredAt: 2000,
        },
        {
          id: 'a3',
          actorUserId: 'user-1',
          actionKey: 'visit.create',
          entityType: 'visit',
          entityId: 'visit-1',
          metadata: null,
          occurredAt: 1500,
        },
      ],
    })
    const app = createAuditAdminApi(dependencies(gw))
    const response = await app.request('/workspaces/workspace-a/admin/report/audit-summary')
    expect(response.status).toBe(200)
    const body = (await response.json()) as { summary: readonly { actionKey: string; count: number }[] }
    expect(body.summary).toHaveLength(2)
    expect(body.summary[0]!.actionKey).toBe('plan.create')
    expect(body.summary[0]!.count).toBe(2)
  })
})
import type { AuthContext } from '@fieldrep/domain'
import { MAX_PAGE_INDEX, WORKLOAD_BUDGETS } from '@fieldrep/domain'
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

  it('clamps a limit above the surface budget instead of trusting it (P12-A4)', async () => {
    let seen: number | undefined
    const app = createAuditAdminApi(
      dependencies(
        gateway({
          listAuditEvents: async (filters) => {
            seen = filters.limit
            return []
          },
        }),
      ),
    )
    const response = await app.request('/workspaces/workspace-a/audit-events?limit=9999')
    expect(response.status).toBe(200)
    // Bounded work: the gateway never receives more than the audit budget.
    expect(seen).toBe(WORKLOAD_BUDGETS.audit.maxPageSize)
    const body = (await response.json()) as {
      page: { page: number; pageSize: number; offset: number; clamped: boolean }
    }
    expect(body.page).toEqual({ page: 1, pageSize: 200, offset: 0, clamped: true })
  })

  it('derives an offset from page/pageSize and reports the window', async () => {
    const app = createAuditAdminApi(dependencies(gateway()))
    const response = await app.request(
      '/workspaces/workspace-a/audit-events?page=3&pageSize=25',
    )
    const body = (await response.json()) as {
      page: { page: number; pageSize: number; offset: number; clamped: boolean }
    }
    expect(body.page).toEqual({ page: 3, pageSize: 25, offset: 50, clamped: false })
  })

  it('bounds deep paging so an offset cannot run away', async () => {
    let seen: number | undefined
    const app = createAuditAdminApi(
      dependencies(
        gateway({
          listAuditEvents: async (filters) => {
            seen = filters.limit
            return []
          },
        }),
      ),
    )
    const response = await app.request(
      '/workspaces/workspace-a/audit-events?page=99999999&pageSize=10',
    )
    const body = (await response.json()) as { page: { page: number } }
    expect(body.page.page).toBe(MAX_PAGE_INDEX)
    expect(seen).toBe(10)
  })

  it('degrades a garbage page size to the default window instead of everything', async () => {
    let seen: number | undefined
    const app = createAuditAdminApi(
      dependencies(
        gateway({
          listAuditEvents: async (filters) => {
            seen = filters.limit
            return []
          },
        }),
      ),
    )
    const response = await app.request('/workspaces/workspace-a/audit-events?pageSize=-4')
    const body = (await response.json()) as { page: { pageSize: number; clamped: boolean } }
    expect(body.page.pageSize).toBe(50)
    expect(body.page.clamped).toBe(true)
    expect(seen).toBe(50)
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
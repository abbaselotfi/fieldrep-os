import type { AuthContext, PlanEntry } from '@fieldrep/domain'
import { describe, expect, it } from 'vitest'

import {
  createSyncApi,
  type CalendarRepository,
  type PlanEntryRepository,
  type SyncApiDependencies,
  type SyncWorkspaceRepositories,
  type VisitActualRepository,
} from './sync-api'

function authContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    membershipId: 'membership-1',
    companyId: 'company-1',
    workspaceId: 'workspace-a',
    roleKeys: ['user'],
    permissions: [
      'sync.push.own',
      'sync.pull.own',
      'plans.create.own',
      'visits.create.own',
      'activities.create.own',
    ],
    scopes: [{ type: 'self' }],
    ...overrides,
  }
}

const plan: PlanEntry = {
  id: 'plan-1',
  workspaceId: 'workspace-a',
  ownerUserId: 'user-1',
  customerId: 'doctor-1',
  planDate: '2026-09-05',
  routeId: 'route-1',
  status: 'planned',
  source: 'manual',
}

function planRepository(overrides: Partial<PlanEntryRepository> = {}): PlanEntryRepository {
  return {
    listEntries: async () => [],
    createEntry: async () => plan,
    updateEntry: async () => plan,
    cancelEntry: async () => true,
    ...overrides,
  }
}

function visitRepository(overrides: Partial<VisitActualRepository> = {}): VisitActualRepository {
  return {
    listVisits: async () => [],
    listProducts: async () => [],
    createCompletedVisit: async () => ({
      id: 'visit-1',
      workspaceId: 'workspace-a',
      ownerUserId: 'user-1',
      customerId: 'doctor-1',
      planEntryId: 'plan-1',
      visitDate: '2026-09-05',
      occurredAt: 1_700_000_000_000,
      status: 'completed',
      source: 'planned',
      productCalls: [],
    }),
    cancelVisit: async () => true,
    ...overrides,
  }
}

function calendarRepository(overrides: Partial<CalendarRepository> = {}): CalendarRepository {
  return {
    listActivities: async () => [],
    createLeaveRequest: async (input) => ({
      id: input.id,
      workspaceId: 'workspace-a',
      userId: input.userId,
      type: input.type,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      status: 'requested',
      ...('reason' in input && input.reason !== undefined ? { reason: input.reason } : {}),
      createdAt: '2026-09-07T00:00:00.000Z',
      updatedAt: '2026-09-07T00:00:00.000Z',
    }),
    createBusinessTrip: async (input) => ({
      id: input.id,
      workspaceId: 'workspace-a',
      userId: input.userId,
      destination: { label: input.destination.label },
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      status: 'planned',
      ...('purpose' in input && input.purpose !== undefined ? { purpose: input.purpose } : {}),
      ...('transport' in input && input.transport !== undefined ? { transport: input.transport } : {}),
      createdAt: '2026-09-07T00:00:00.000Z',
      updatedAt: '2026-09-07T00:00:00.000Z',
    }),
    ...overrides,
  }
}

interface RecordedRow {
  operation_id: string
  result_json: string
}

class MemorySyncLedger {
  private readonly rows = new Map<string, RecordedRow>()

  async getRecorded(operationId: string): Promise<{
    operationId: string
    workspaceId: string
    userId: string
    entityType: string
    entityId: string
    operationType: string
    result: unknown
    appliedAt: number
  } | null> {
    const row = this.rows.get(operationId)
    if (row === undefined) return null
    return {
      operationId: row.operation_id,
      workspaceId: 'workspace-a',
      userId: 'user-1',
      entityType: 'plan_entry',
      entityId: 'plan-1',
      operationType: 'create',
      result: JSON.parse(row.result_json),
      appliedAt: 1_700_000_000_000,
    }
  }

  async recordApplied(input: { operationId: string; result: unknown; appliedAt: number }): Promise<void> {
    this.rows.set(input.operationId, {
      operation_id: input.operationId,
      result_json: JSON.stringify(input.result),
    })
  }
}

function repositories(overrides: Partial<SyncWorkspaceRepositories> = {}): SyncWorkspaceRepositories {
  return {
    sync: new MemorySyncLedger(),
    plans: planRepository(),
    visits: visitRepository(),
    calendar: calendarRepository(),
    ...overrides,
  }
}

function deps(
  repo: SyncWorkspaceRepositories,
  context: AuthContext | null = authContext(),
  now: () => number = () => 1_700_000_000_000,
): SyncApiDependencies {
  return {
    authContextResolver: { resolve: async () => context },
    repositoryForWorkspace: async (workspaceId) => {
      expect(workspaceId).toBe('workspace-a')
      return repo
    },
    now,
  }
}

async function push(
  app: ReturnType<typeof createSyncApi>,
  operations: unknown[],
): Promise<{ status: number; body: { results?: unknown[]; error?: string } }> {
  const response = await app.request('/workspaces/workspace-a/sync/operations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ operations }),
  })
  return { status: response.status, body: (await response.json()) as { results?: unknown[]; error?: string } }
}

const planOperation = {
  operationId: '0000000000001abc',
  entityType: 'plan_entry' as const,
  entityId: 'plan-1',
  operationType: 'create' as const,
  payload: { planningCycleId: 'cycle-1', customerId: 'doctor-1', planDate: '2026-09-05' },
}

describe('sync API', () => {
  it('requires authentication before sync push', async () => {
    const app = createSyncApi(deps(repositories(), null))
    const { status } = await push(app, [planOperation])
    expect(status).toBe(401)
  })

  it('requires sync.push.own permission', async () => {
    const app = createSyncApi(deps(repositories(), authContext({ permissions: [] })))
    const { status } = await push(app, [planOperation])
    expect(status).toBe(403)
  })

  it('rejects an empty batch', async () => {
    const app = createSyncApi(deps(repositories()))
    const response = await app.request('/workspaces/workspace-a/sync/operations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operations: [] }),
    })
    expect(response.status).toBe(400)
  })

  it('applies a plan_entry create and records it in the idempotency ledger', async () => {
    const app = createSyncApi(deps(repositories()))
    const { status, body } = await push(app, [planOperation])

    expect(status).toBe(200)
    expect(body.results).toHaveLength(1)
    expect(body.results![0]).toMatchObject({ result: 'applied', deduplicated: false })
  })

  it('replays the stored result for a duplicate operationId (idempotent retry)', async () => {
    const app = createSyncApi(deps(repositories()))

    const first = await push(app, [planOperation])
    expect(first.body.results![0]).toMatchObject({ result: 'applied', deduplicated: false })

    const second = await push(app, [planOperation])
    expect(second.body.results![0]).toMatchObject({ result: 'applied', deduplicated: true })
  })

  it('rejects a known operationId claimed by a different tenant', async () => {
    const repo = repositories()
    const app = createSyncApi(deps(repo))
    const first = await push(app, [planOperation])
    expect(first.status).toBe(200)
    expect(first.body.results![0]).toMatchObject({ result: 'applied', deduplicated: false })

    const otherApp = createSyncApi({
      authContextResolver: { resolve: async () => authContext({ workspaceId: 'workspace-b' }) },
      repositoryForWorkspace: async () => repo,
      now: () => 1_700_000_000_000,
    })
    const response = await otherApp.request('/workspaces/workspace-b/sync/operations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operations: [planOperation] }),
    })
    const body = (await response.json()) as { results?: Array<{ result: string; code?: string }> }

    expect(response.status).toBe(200)
    expect(body.results![0]?.result).toBe('rejected')
    expect(body.results![0]?.code).toBe('operation_binding_mismatch')
  })

  it('rejects an invalid plan payload with a stable code', async () => {
    const app = createSyncApi(deps(repositories()))
    const { status, body } = await push(app, [
      { ...planOperation, payload: { customerId: 'doctor-1' } },
    ])

    expect(status).toBe(200)
    expect(body.results![0]).toMatchObject({ result: 'rejected', code: 'invalid_plan_entry_payload' })
  })

  it('pulls authorized datasets', async () => {
    const app = createSyncApi(deps(repositories()))
    const response = await app.request('/workspaces/workspace-a/sync/changes?datasets=plans,products')

    expect(response.status).toBe(200)
    const body = (await response.json()) as { serverTime?: string; datasets?: Record<string, { count: number }> }
    expect(body.serverTime).toBeDefined()
    expect(body.datasets?.plans?.count).toBe(0)
    expect(body.datasets?.products?.count).toBe(0)
  })

    it('returns 403 for pull without sync.pull.own', async () => {
    const app = createSyncApi(deps(repositories(), authContext({ permissions: [] })))
    const response = await app.request('/workspaces/workspace-a/sync/changes')
    expect(response.status).toBe(403)
  })

  it('accepts an optional cursor query param on pull (P4-A4 incremental)', async () => {
    const app = createSyncApi(deps(repositories()))
    const response = await app.request(
      '/workspaces/workspace-a/sync/changes?datasets=plans&cursor=2026-09-07T09:00:00.000Z',
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as { serverTime?: string; datasets?: Record<string, unknown> }
    expect(body.serverTime).toBeDefined()
    expect(body.datasets?.plans).toBeDefined()
  })
})
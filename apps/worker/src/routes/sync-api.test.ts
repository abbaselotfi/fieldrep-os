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

  // P4-A5 scenario 5: server authorization always wins over stale client state.
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

  // P4-A5 scenario 1: a plan created offline reaches the server exactly once.
  it('applies a plan_entry create and records it in the idempotency ledger', async () => {
    const app = createSyncApi(deps(repositories()))
    const { status, body } = await push(app, [planOperation])

    expect(status).toBe(200)
    expect(body.results).toHaveLength(1)
    expect(body.results![0]).toMatchObject({ result: 'applied', deduplicated: false })
  })

  // P4-A5 scenario 1: the retry replays the stored result (never a second plan).
  it('replays the stored result for a duplicate operationId (idempotent retry)', async () => {
    const app = createSyncApi(deps(repositories()))

    const first = await push(app, [planOperation])
    expect(first.body.results![0]).toMatchObject({ result: 'applied', deduplicated: false })

    const second = await push(app, [planOperation])
    expect(second.body.results![0]).toMatchObject({ result: 'applied', deduplicated: true })
  })

  // P4-A5 tenant-binding: another tenant's workspace can never replay user A's operation.
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

  it('passes the cursor as fromDate to incremental repository methods', async () => {
    let receivedFromDate: string | undefined
    const repo = repositories({
      plans: planRepository({
        listEntries: async (_userId, from, _to) => {
          receivedFromDate = from
          return []
        },
      }),
      visits: visitRepository({
        listVisits: async () => [],
      }),
    })

    const app = createSyncApi(deps(repo))
    const response = await app.request(
      '/workspaces/workspace-a/sync/changes?datasets=plans,visits&cursor=2026-09-07T09:00:00.000Z',
    )

    expect(response.status).toBe(200)
    expect(receivedFromDate).toBe('2026-09-07T09:00:00.000Z')
  })

  it('pulls full snapshot when no cursor is provided', async () => {
    let receivedFromDate: string | undefined
    const repo = repositories({
      plans: planRepository({
        listEntries: async (_userId, from, _to) => {
          receivedFromDate = from
          return [plan]
        },
      }),
      visits: visitRepository(),
    })

    const app = createSyncApi(deps(repo))
    const response = await app.request('/workspaces/workspace-a/sync/changes?datasets=plans')

    expect(response.status).toBe(200)
    expect(receivedFromDate).toBe('2000-01-01')
    const body = (await response.json()) as { datasets?: Record<string, { count: number }> }
    expect(body.datasets?.plans?.count).toBe(1)
  })

  // P4-A5 scenario 2: record a visit offline, the response is lost, the client
  // retries the same operationId → exactly one server visit is created.
  it('creates exactly one visit when an offline visit push is retried after a lost response', async () => {
    let createCalls = 0
    const repo = repositories({
      visits: visitRepository({
        createCompletedVisit: async (input) => {
          createCalls += 1
          return {
            id: input.id ?? 'visit-1',
            workspaceId: 'workspace-a',
            ownerUserId: 'user-1',
            customerId: input.customerId,
            ...(input.planEntryId === undefined ? {} : { planEntryId: input.planEntryId }),
            visitDate: input.visitDate,
            occurredAt: input.occurredAt,
            status: 'completed',
            source: 'planned',
            productCalls: [...input.productCalls],
          }
        },
      }),
    })
    const app = createSyncApi(deps(repo))

    const visitOperation = {
      operationId: '0000000000004visit',
      entityType: 'visit' as const,
      entityId: 'visit-1',
      operationType: 'create' as const,
      clientOccurredAt: 1_700_000_000_000,
      payload: {
        id: 'visit-1',
        customerId: 'doctor-1',
        planEntryId: 'plan-1',
        visitDate: '2026-09-05',
        occurredAt: 1_700_000_000_000,
        productCalls: [{ productId: 'product-1', callCount: 2 }],
      },
    }

    const first = await push(app, [visitOperation])
    expect(first.status).toBe(200)
    expect(first.body.results![0]).toMatchObject({ result: 'applied', deduplicated: false })

    // Lost response: the client retries the very same operation.
    const retry = await push(app, [visitOperation])
    expect(retry.body.results![0]).toMatchObject({ result: 'applied', deduplicated: true })
    expect(createCalls).toBe(1)
  })

  // P4-A5 scenario 2 (server view): the recorded idempotency result is the
  // authoritative server visit, so a replayed operation cannot double-count.
  it('records the authoritative server visit in the idempotency ledger', async () => {
    const app = createSyncApi(deps(repositories()))
    await push(app, [
      {
        operationId: '0000000000005visit',
        entityType: 'visit' as const,
        entityId: 'visit-1',
        operationType: 'create' as const,
        payload: {
          id: 'visit-1',
          customerId: 'doctor-1',
          visitDate: '2026-09-05',
          occurredAt: 1_700_000_000_000,
        },
      },
    ])

    const replayed = await push(app, [
      {
        operationId: '0000000000005visit',
        entityType: 'visit' as const,
        entityId: 'visit-1',
        operationType: 'create' as const,
        payload: { customerId: 'doctor-1', visitDate: '2026-09-05', occurredAt: 1 },
      },
    ])

    expect(replayed.body.results![0]).toMatchObject({ result: 'applied', deduplicated: true })
    expect((replayed.body.results![0] as { serverState?: { status?: string } }).serverState?.status).toBe(
      'completed',
    )
  })

  // P4-A5 scenario 8: achievement/visited totals are derived server-side from
  // authoritative visits — a client-supplied total never becomes the truth.
  it('ignores client-supplied derived totals and keeps server-authoritative visits', async () => {
    const serverVisit = {
      id: 'visit-1',
      workspaceId: 'workspace-a',
      ownerUserId: 'user-1',
      customerId: 'doctor-1',
      visitDate: '2026-09-05',
      occurredAt: 1_700_000_000_000,
      status: 'completed' as const,
      source: 'planned' as const,
      productCalls: [],
    }
    const repo = repositories({
      visits: visitRepository({ listVisits: async () => [serverVisit] }),
    })
    const app = createSyncApi(deps(repo))

    const applied = await push(app, [
      {
        operationId: '0000000000006visit',
        entityType: 'visit' as const,
        entityId: 'visit-1',
        operationType: 'create' as const,
        payload: {
          id: 'visit-1',
          customerId: 'doctor-1',
          visitDate: '2026-09-05',
          occurredAt: 1_700_000_000_000,
          // A stale local total must never be accepted as achievement truth.
          visitedCount: 99,
          achievement: 42,
        },
      },
    ])
    expect(applied.body.results![0]).toMatchObject({ result: 'applied' })

    const pulled = await app.request('/workspaces/workspace-a/sync/changes?datasets=visits')
    const body = (await pulled.json()) as {
      datasets?: Record<string, { count: number; records?: Array<{ entityId: string }> }>
    }
    expect(body.datasets?.visits?.count).toBe(1)
    expect(body.datasets?.visits?.records?.[0]?.entityId).toBe('visit-1')
    // No client total is echoed back as server state.
    expect(JSON.stringify(body)).not.toContain('"visitedCount"')
  })
})

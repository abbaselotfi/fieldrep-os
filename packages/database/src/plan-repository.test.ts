import { describe, expect, it } from 'vitest'

import type {
  WorkspaceWritableDataStore,
  WorkspaceWriteResult,
} from './contracts'
import { WorkspacePlanEntryRepository } from './plan-repository'

interface RecordedCall {
  query: string
  values: readonly unknown[]
}

class FakeStore implements WorkspaceWritableDataStore {
  readonly workspaceId = 'workspace-a'
  readonly schemaVersion = 4
  readonly reads: RecordedCall[] = []
  readonly writes: RecordedCall[] = []

  constructor(
    private readonly firstResult: Record<string, unknown> | null = null,
    private readonly allResults: Record<string, unknown>[] = [],
    private readonly writeResult: WorkspaceWriteResult = { success: true, changes: 1 },
  ) {}

  async health(): Promise<boolean> {
    return true
  }

  async queryFirst<T>(query: string, values: readonly unknown[] = []): Promise<T | null> {
    this.reads.push({ query, values })
    return this.firstResult as T | null
  }

  async queryAll<T>(query: string, values: readonly unknown[] = []): Promise<T[]> {
    this.reads.push({ query, values })
    return this.allResults as T[]
  }

  async execute(query: string, values: readonly unknown[] = []): Promise<WorkspaceWriteResult> {
    this.writes.push({ query, values })
    return this.writeResult
  }
}

const row = {
  id: 'plan-1',
  workspace_id: 'workspace-a',
  owner_user_id: 'user-1',
  customer_id: 'doctor-1',
  plan_date: '2026-09-05',
  route_id: 'route-1',
  status: 'planned',
  source: 'manual',
}

describe('WorkspacePlanEntryRepository', () => {
  it('lists only the requested owner/date range and maps persisted rows', async () => {
    const store = new FakeStore(null, [row, { ...row, id: 'plan-2', route_id: null }])
    const repository = new WorkspacePlanEntryRepository(store)

    const entries = await repository.listEntries('user-1', '2026-09-01', '2026-09-30')

    expect(store.reads[0]?.values).toEqual([
      'workspace-a',
      'user-1',
      '2026-09-01',
      '2026-09-30',
    ])
    expect(entries[0]).toMatchObject({ id: 'plan-1', routeId: 'route-1' })
    expect(entries[1]).not.toHaveProperty('routeId')
  })

  it('creates an offline-safe caller supplied id inside the physical workspace', async () => {
    const store = new FakeStore(row)
    const repository = new WorkspacePlanEntryRepository(store, () => 1_780_000_000_000)

    const created = await repository.createEntry({
      id: 'plan-1',
      ownerUserId: 'user-1',
      planningCycleId: 'cycle-1',
      customerId: 'doctor-1',
      planDate: '2026-09-05',
      routeId: 'route-1',
    })

    expect(store.writes).toHaveLength(1)
    expect(store.writes[0]?.values).toEqual([
      'plan-1',
      'workspace-a',
      'user-1',
      'cycle-1',
      'doctor-1',
      '2026-09-05',
      'route-1',
      'manual',
      1_780_000_000_000,
      1_780_000_000_000,
    ])
    expect(created.id).toBe('plan-1')
  })

  it('updates only a planned entry owned by the authenticated user', async () => {
    const store = new FakeStore({ ...row, route_id: null })
    const repository = new WorkspacePlanEntryRepository(store, () => 123)

    const updated = await repository.updateEntry('user-1', 'plan-1', {
      planDate: '2026-09-06',
      routeId: null,
    })

    expect(store.writes[0]?.query).toContain("AND status = 'planned'")
    expect(store.writes[0]?.values).toEqual([
      '2026-09-06',
      null,
      123,
      'workspace-a',
      'user-1',
      'plan-1',
    ])
    expect(updated?.id).toBe('plan-1')
  })

  it('returns null when an update cannot mutate an owned planned entry', async () => {
    const store = new FakeStore(null, [], { success: true, changes: 0 })
    const repository = new WorkspacePlanEntryRepository(store)

    await expect(
      repository.updateEntry('user-1', 'missing-plan', { planDate: '2026-09-06' }),
    ).resolves.toBeNull()
  })

  it('soft-cancels instead of hard deleting plan history', async () => {
    const store = new FakeStore()
    const repository = new WorkspacePlanEntryRepository(store, () => 456)

    await expect(repository.cancelEntry('user-1', 'plan-1')).resolves.toBe(true)
    expect(store.writes[0]?.query).toContain("SET status = 'cancelled'")
    expect(store.writes[0]?.values).toEqual([456, 'workspace-a', 'user-1', 'plan-1'])
  })
})

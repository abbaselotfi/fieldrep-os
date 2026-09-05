import { describe, expect, it } from 'vitest'

import type {
  WorkspaceAtomicDataStore,
  WorkspaceWriteCommand,
  WorkspaceWriteResult,
} from './contracts'
import { WorkspaceLeaveRequestRepository } from './leave-repository'

const persisted = {
  id: 'leave-1',
  workspace_id: 'workspace-a',
  user_id: 'user-1',
  leave_type: 'annual',
  starts_at: Date.UTC(2026, 8, 6),
  ends_at: Date.UTC(2026, 8, 7),
  local_start_date: '2026-09-06',
  local_end_date: '2026-09-07',
  all_day: 1,
  reason: 'استراحت',
  status: 'draft',
  decided_by_user_id: null,
  decided_at: null,
  calendar_event_id: 'calendar-leave-1',
}

class FakeStore implements WorkspaceAtomicDataStore {
  readonly workspaceId = 'workspace-a'
  readonly schemaVersion = 9
  readonly batches: WorkspaceWriteCommand[][] = []
  readonly reads: Array<{ query: string; values: readonly unknown[] }> = []

  constructor(
    private row: Record<string, unknown> | null = persisted,
    private readonly zeroChanges = false,
  ) {}

  async health(): Promise<boolean> { return true }

  async queryFirst<T>(query: string, values: readonly unknown[] = []): Promise<T | null> {
    this.reads.push({ query, values })
    if (this.row === null || !query.includes('FROM leave_requests l')) return null
    if (query.includes('l.user_id = ?')) {
      if (this.row.user_id !== values[1] || this.row.id !== values[2]) return null
    } else if (this.row.id !== values[1]) {
      return null
    }
    return this.row as T
  }

  async queryAll<T>(query: string, values: readonly unknown[] = []): Promise<T[]> {
    this.reads.push({ query, values })
    if (this.row === null || !query.includes('FROM leave_requests l')) return []
    return this.row.user_id === values[1] ? [this.row as T] : []
  }

  async execute(): Promise<WorkspaceWriteResult> {
    return { success: true, changes: 1 }
  }

  async executeBatch(commands: readonly WorkspaceWriteCommand[]): Promise<WorkspaceWriteResult[]> {
    this.batches.push([...commands])
    return commands.map(() => ({ success: true, changes: this.zeroChanges ? 0 : 1 }))
  }
}

function createInput() {
  return {
    id: 'leave-1',
    calendarEventId: 'calendar-leave-1',
    userId: 'user-1',
    type: 'annual' as const,
    startsAt: Date.UTC(2026, 8, 6),
    endsAt: Date.UTC(2026, 8, 7),
    localStartDate: '2026-09-06',
    localEndDate: '2026-09-07',
    allDay: true,
    reason: 'استراحت',
  }
}

describe('WorkspaceLeaveRequestRepository', () => {
  it('atomically creates a draft Leave and non-KPI Calendar projection', async () => {
    const store = new FakeStore(null)
    const repository = new WorkspaceLeaveRequestRepository(store, () => 1_780_000_000_000)

    const leave = await repository.createDraft(createInput())

    expect(leave).toMatchObject({ workspaceId: 'workspace-a', userId: 'user-1', status: 'draft' })
    expect(store.batches).toHaveLength(1)
    expect(store.batches[0]).toHaveLength(3)
    expect(store.batches[0]?.[0]?.query).toContain('INSERT INTO leave_requests')
    expect(store.batches[0]?.[1]?.query).toContain("'leave_request'")
    expect(store.batches[0]?.[1]?.query).toContain('counts_as_visit')
    expect(store.batches[0]?.[2]?.values).toEqual([
      'calendar-leave-1', 'workspace-a', 'user-1', 1_780_000_000_000, 1_780_000_000_000,
    ])
  })

  it('lists only the authenticated owner in the requested range', async () => {
    const store = new FakeStore()
    const repository = new WorkspaceLeaveRequestRepository(store)

    const rows = await repository.listOwn('user-1', '2026-09-01', '2026-09-30')

    expect(store.reads[0]?.values).toEqual(['workspace-a', 'user-1', '2026-09-30', '2026-09-01'])
    expect(rows[0]).toMatchObject({ id: 'leave-1', userId: 'user-1', status: 'draft' })
    await expect(repository.getOwn('user-2', 'leave-1')).resolves.toBeNull()
  })

  it('submits only draft leave and keeps Planner blocking disabled while requested', async () => {
    const store = new FakeStore()
    const repository = new WorkspaceLeaveRequestRepository(store, () => 1_780_000_000_001)

    const submitted = await repository.submitOwn('user-1', 'leave-1')

    expect(submitted?.status).toBe('requested')
    const commands = store.batches[0]!
    expect(commands[0]?.query).toContain("status = 'requested'")
    expect(commands[1]?.query).toContain('blocks_planning = 0')
    expect(commands[1]?.query).toContain('counts_as_visit = 0')
  })

  it('allows owner cancellation only before a decision', async () => {
    const store = new FakeStore({ ...persisted, status: 'requested' })
    const repository = new WorkspaceLeaveRequestRepository(store, () => 1_780_000_000_002)

    await expect(repository.cancelOwn('user-1', 'leave-1')).resolves.toBe(true)
    expect(store.batches[0]?.[0]?.query).toContain("status IN ('draft', 'requested')")
    expect(store.batches[0]?.[1]?.query).toContain("status = 'cancelled'")
  })

  it('approval is a separate decision that enables Planner blocking and never Visit KPI', async () => {
    const store = new FakeStore({ ...persisted, status: 'requested' })
    const repository = new WorkspaceLeaveRequestRepository(store, () => 1_780_000_000_003)

    const approved = await repository.decide('leave-1', 'approved', 'supervisor-1')

    expect(approved).toMatchObject({
      status: 'approved',
      decidedByUserId: 'supervisor-1',
      decidedAt: 1_780_000_000_003,
    })
    const projection = store.batches[0]?.[1]
    expect(projection?.query).toContain('blocks_planning = ?')
    expect(projection?.query).toContain('counts_as_visit = 0')
    expect(projection?.values?.[0]).toBe('active')
    expect(projection?.values?.[1]).toBe(1)
  })
})

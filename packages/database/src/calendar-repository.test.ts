import { describe, expect, it } from 'vitest'

import type {
  WorkspaceWritableDataStore,
  WorkspaceWriteResult,
} from './contracts'
import { WorkspaceCalendarRepository } from './calendar-repository'

class FakeStore implements WorkspaceWritableDataStore {
  readonly workspaceId = 'workspace-a'
  readonly schemaVersion = 7
  readonly reads: { query: string; values: readonly unknown[] }[] = []
  readonly writes: { query: string; values: readonly unknown[] }[] = []

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

const activityRow = {
  id: 'meeting-1',
  workspace_id: 'workspace-a',
  activity_type: 'internal_meeting',
  title: 'Cycle meeting',
  description: null,
  scope_type: 'workspace',
  organization_unit_id: null,
  owner_user_id: null,
  location_id: null,
  starts_at: 1_787_000_000_000,
  ends_at: 1_787_003_600_000,
  all_day: 0,
  blocks_planning: 1,
  counts_as_working_activity: 1,
  appears_in_report: 1,
  status: 'confirmed',
  created_by_user_id: 'supervisor-1',
  created_at: 1_786_000_000_000,
  updated_at: 1_786_000_000_000,
}

const leaveRow = {
  id: 'leave-1',
  workspace_id: 'workspace-a',
  user_id: 'user-1',
  leave_type: 'annual',
  starts_at: 1_787_000_000_000,
  ends_at: 1_787_086_400_000,
  status: 'requested',
  reason: null,
  decided_by_user_id: null,
  decided_at: null,
  created_at: 1_786_000_000_000,
  updated_at: 1_786_000_000_000,
}

describe('WorkspaceCalendarRepository', () => {
  it('returns the default working calendar when no policy row exists', async () => {
    const store = new FakeStore(null)
    const repository = new WorkspaceCalendarRepository(store)

    const config = await repository.getWorkingCalendar()

    expect(config).toMatchObject({
      workspaceId: 'workspace-a',
      timezone: 'Asia/Tehran',
      workingWeekdays: [0, 1, 2, 3, 4, 5],
    })
  })

  it('lists activities inside the requested range and maps persisted rows', async () => {
    const store = new FakeStore(activityRow, [activityRow])
    const repository = new WorkspaceCalendarRepository(store)

    const activities = await repository.listActivities({
      fromMs: 1_786_900_000_000,
      toMs: 1_787_100_000_000,
    })

    expect(store.reads[0]?.values).toEqual(['workspace-a', 1_786_900_000_000, 1_787_100_000_000])
    expect(activities[0]).toMatchObject({
      id: 'meeting-1',
      activityType: 'internal_meeting',
      scope: 'workspace',
      blocksPlanning: true,
      countsAsWorkingActivity: true,
      status: 'confirmed',
    })
    expect(activities[0]?.startsAt).toBe(new Date(1_787_000_000_000).toISOString())
  })

  it('creates activities with caller-supplied ids and registers user-scope owner targets', async () => {
    const store = new FakeStore(activityRow)
    const repository = new WorkspaceCalendarRepository(store, () => 1_788_000_000_000)

    await repository.createActivity({
      id: 'meeting-1',
      activityType: 'internal_meeting',
      title: 'Cycle meeting',
      scope: 'user',
      ownerUserId: 'user-1',
      startsAt: '2026-09-07T08:00:00.000Z',
      endsAt: '2026-09-07T10:00:00.000Z',
      blocksPlanning: true,
      createdByUserId: 'supervisor-1',
    })

    const insert = store.writes[0]
    expect(insert?.query).toContain('INSERT INTO calendar_activities')
    expect(insert?.values[0]).toBe('meeting-1')
    expect(insert?.values[1]).toBe('workspace-a')

    const targetInsert = store.writes.find((write) =>
      write.query.includes('INSERT INTO calendar_activity_targets'),
    )
    expect(targetInsert?.values).toEqual(['meeting-1', 'workspace-a', 'user-1'])
  })

  it('cancels activities only when they are not already cancelled', async () => {
    const store = new FakeStore(activityRow, [], { success: true, changes: 1 })
    const repository = new WorkspaceCalendarRepository(store)

    const cancelled = await repository.cancelActivity('meeting-1')
    expect(cancelled).toBe(true)
    expect(store.writes[0]?.query).toContain("status <> 'cancelled'")
  })

  it('creates leave requests as requested status for the given user', async () => {
    const store = new FakeStore(leaveRow)
    const repository = new WorkspaceCalendarRepository(store, () => 1_788_000_000_000)

    const created = await repository.createLeaveRequest({
      id: 'leave-1',
      userId: 'user-1',
      type: 'annual',
      startsAt: '2026-09-08T00:00:00.000Z',
      endsAt: '2026-09-09T00:00:00.000Z',
    })

    expect(created).toMatchObject({ id: 'leave-1', userId: 'user-1', status: 'requested' })
    expect(store.writes[0]?.values).toContain('requested')
  })

  it('updates leave status with decider audit fields', async () => {
    const store = new FakeStore({ ...leaveRow, status: 'cancelled' })
    const repository = new WorkspaceCalendarRepository(store)

    const updated = await repository.updateLeaveRequestStatus('leave-1', {
      status: 'cancelled',
      decidedByUserId: 'user-1',
      decidedAt: '2026-09-02T00:00:00.000Z',
    })

    expect(updated?.status).toBe('cancelled')
    expect(store.writes[0]?.values[0]).toBe('cancelled')
  })

  it('lists closures between canonical dates', async () => {
    const store = new FakeStore(null, [
      {
        id: 'closure-1',
        workspace_id: 'workspace-a',
        closure_level: 'workspace',
        canonical_date: '2026-09-14',
        label: 'انبار',
        created_at: 1_786_000_000_000,
      },
    ])
    const repository = new WorkspaceCalendarRepository(store)

    const closures = await repository.listClosures('2026-09-01', '2026-09-30')

    expect(store.reads[0]?.values).toEqual(['workspace-a', '2026-09-01', '2026-09-30'])
    expect(closures[0]).toMatchObject({ level: 'workspace', canonicalDate: '2026-09-14' })
  })
})

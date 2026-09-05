import { describe, expect, it } from 'vitest'

import type { Activity } from '@fieldrep/domain'

import type {
  WorkspaceAtomicDataStore,
  WorkspaceWriteCommand,
  WorkspaceWriteResult,
} from './contracts'
import { WorkspaceCalendarActivityRepository } from './calendar-activity-repository'

interface RecordedRead {
  query: string
  values: readonly unknown[]
}

const persistedRow = {
  id: 'activity-1',
  workspace_id: 'workspace-a',
  created_by_user_id: 'user-1',
  owner_user_id: 'user-1',
  activity_type: 'internal_meeting',
  title: 'جلسه تیم',
  description: null,
  starts_at: Date.UTC(2026, 8, 5, 9),
  ends_at: Date.UTC(2026, 8, 5, 10),
  local_start_date: '2026-09-05',
  local_end_date: '2026-09-05',
  all_day: 0,
  scope_type: 'user',
  scope_id: 'user-1',
  blocks_planning: 1,
  counts_as_working_activity: 1,
  appears_in_report: 1,
  status: 'scheduled',
  location_text: 'دفتر منطقه',
  calendar_event_id: 'calendar-1',
}

class FakeStore implements WorkspaceAtomicDataStore {
  readonly workspaceId = 'workspace-a'
  readonly schemaVersion = 7
  readonly reads: RecordedRead[] = []
  readonly batches: readonly WorkspaceWriteCommand[][] = []
  private mutableBatches: WorkspaceWriteCommand[][] = []

  constructor(
    private readonly activityRows: Record<string, unknown>[] = [],
    private readonly attendeeRows: Record<string, unknown>[] = [],
    private readonly failBatch = false,
    private readonly zeroChanges = false,
  ) {
    Object.defineProperty(this, 'batches', { get: () => this.mutableBatches })
  }

  async health(): Promise<boolean> {
    return true
  }

  async queryFirst<T>(query: string, values: readonly unknown[] = []): Promise<T | null> {
    this.reads.push({ query, values })
    if (!query.includes('FROM activities a')) return null
    const candidate = this.activityRows[0]
    if (candidate === undefined) return null
    if (candidate.owner_user_id !== values[1] || candidate.id !== values[2]) return null
    return candidate as T
  }

  async queryAll<T>(query: string, values: readonly unknown[] = []): Promise<T[]> {
    this.reads.push({ query, values })
    if (query.includes('FROM calendar_event_attendees')) return this.attendeeRows as T[]
    if (query.includes('FROM activities a')) {
      const ownerUserId = values[1]
      return this.activityRows.filter((row) => row.owner_user_id === ownerUserId) as T[]
    }
    return []
  }

  async execute(): Promise<WorkspaceWriteResult> {
    return { success: true, changes: 1 }
  }

  async executeBatch(commands: readonly WorkspaceWriteCommand[]): Promise<WorkspaceWriteResult[]> {
    this.mutableBatches.push([...commands])
    return commands.map(() => ({
      success: !this.failBatch,
      changes: this.failBatch || this.zeroChanges ? 0 : 1,
    }))
  }
}

function input(overrides: Partial<Omit<Activity, 'workspaceId'>> = {}) {
  return {
    id: 'activity-1',
    calendarEventId: 'calendar-1',
    createdByUserId: 'user-1',
    ownerUserId: 'user-1',
    type: 'internal_meeting' as const,
    title: ' جلسه تیم ',
    description: null,
    startsAt: Date.UTC(2026, 8, 5, 9),
    endsAt: Date.UTC(2026, 8, 5, 10),
    localStartDate: '2026-09-05',
    localEndDate: '2026-09-05',
    allDay: false,
    scope: { type: 'selected_users' as const, id: null },
    attendeeUserIds: ['user-1', 'user-2'],
    blocksPlanning: true,
    countsAsWorkingActivity: true,
    appearsInReport: true,
    status: 'scheduled' as const,
    locationText: 'دفتر منطقه',
    ...overrides,
  }
}

describe('WorkspaceCalendarActivityRepository', () => {
  it('atomically persists an Activity, non-KPI Calendar projection and attendees', async () => {
    const store = new FakeStore()
    const repository = new WorkspaceCalendarActivityRepository(store, () => 1_780_000_000_000)

    const created = await repository.createActivity(input())

    expect(created.workspaceId).toBe('workspace-a')
    expect(store.batches).toHaveLength(1)
    const commands = store.batches[0]!
    expect(commands).toHaveLength(4)
    expect(commands[0]?.query).toContain('INSERT INTO activities')
    expect(commands[1]?.query).toContain('INSERT INTO calendar_events')
    expect(commands[1]?.query).toContain('counts_as_visit')
    expect(commands[1]?.query).toContain('0')
    expect(commands[2]?.values).toEqual([
      'calendar-1',
      'workspace-a',
      'user-1',
      'owner',
      1_780_000_000_000,
      1_780_000_000_000,
    ])
    expect(commands[3]?.values).toEqual([
      'calendar-1',
      'workspace-a',
      'user-2',
      'attendee',
      1_780_000_000_000,
      1_780_000_000_000,
    ])
  })

  it('lists only the requested owner/date range and hydrates attendees', async () => {
    const store = new FakeStore([persistedRow], [{ user_id: 'user-1' }])
    const repository = new WorkspaceCalendarActivityRepository(store)

    const activities = await repository.listOwnActivities('user-1', '2026-09-01', '2026-09-30')

    expect(store.reads[0]?.values).toEqual([
      'workspace-a',
      'user-1',
      '2026-09-30',
      '2026-09-01',
    ])
    expect(activities).toEqual([
      expect.objectContaining({
        id: 'activity-1',
        workspaceId: 'workspace-a',
        ownerUserId: 'user-1',
        scope: { type: 'user', id: 'user-1' },
        attendeeUserIds: ['user-1'],
        blocksPlanning: true,
      }),
    ])
  })

  it('does not return another user activity through the owner read boundary', async () => {
    const store = new FakeStore([persistedRow])
    const repository = new WorkspaceCalendarActivityRepository(store)

    await expect(repository.getOwnActivity('user-2', 'activity-1')).resolves.toBeNull()
  })

  it('atomically updates both authoritative Activity and Calendar projection', async () => {
    const store = new FakeStore([persistedRow])
    const repository = new WorkspaceCalendarActivityRepository(store, () => 1_780_000_000_001)

    const updated = await repository.updateOwnActivity('user-1', 'activity-1', {
      title: 'جلسه جدید',
      endsAt: Date.UTC(2026, 8, 5, 11),
      blocksPlanning: false,
      locationText: 'دفتر مرکزی',
    })

    expect(updated).toMatchObject({
      title: 'جلسه جدید',
      endsAt: Date.UTC(2026, 8, 5, 11),
      blocksPlanning: false,
      locationText: 'دفتر مرکزی',
    })
    expect(store.batches).toHaveLength(1)
    expect(store.batches[0]?.[0]?.query).toContain('UPDATE activities SET')
    expect(store.batches[0]?.[1]?.query).toContain('UPDATE calendar_events SET')
    expect(store.batches[0]?.[1]?.query).toContain('counts_as_visit = 0')
  })

  it('validates the resulting Activity before an update batch', async () => {
    const store = new FakeStore([persistedRow])
    const repository = new WorkspaceCalendarActivityRepository(store)

    await expect(
      repository.updateOwnActivity('user-1', 'activity-1', {
        endsAt: Date.UTC(2026, 8, 5, 8),
      }),
    ).rejects.toThrow('calendar end must not precede start')
    expect(store.batches).toHaveLength(0)
  })

  it('cancels the authoritative Activity and projection together', async () => {
    const store = new FakeStore()
    const repository = new WorkspaceCalendarActivityRepository(store, () => 1_780_000_000_002)

    await expect(repository.cancelOwnActivity('user-1', 'activity-1')).resolves.toBe(true)
    expect(store.batches[0]?.[0]?.query).toContain("status = 'cancelled'")
    expect(store.batches[0]?.[1]?.query).toContain("status = 'cancelled'")
    expect(store.batches[0]?.[1]?.query).toContain('counts_as_visit = 0')
  })

  it('returns false when cancellation updates no owned activity', async () => {
    const repository = new WorkspaceCalendarActivityRepository(
      new FakeStore([], [], false, true),
    )

    await expect(repository.cancelOwnActivity('user-2', 'activity-1')).resolves.toBe(false)
  })

  it('injects the physical workspace and rejects a mismatched workspace scope', async () => {
    const store = new FakeStore()
    const repository = new WorkspaceCalendarActivityRepository(store)

    await expect(
      repository.createActivity(
        input({ scope: { type: 'workspace', id: 'workspace-other' }, attendeeUserIds: [] }),
      ),
    ).rejects.toThrow('workspace calendar scope must match item workspace')
    expect(store.batches).toHaveLength(0)
  })

  it('rejects selected_users without attendee rows before persistence', async () => {
    const store = new FakeStore()
    const repository = new WorkspaceCalendarActivityRepository(store)

    await expect(repository.createActivity(input({ attendeeUserIds: [] }))).rejects.toThrow(
      'selected_users calendar scope requires at least one attendee',
    )
    expect(store.batches).toHaveLength(0)
  })

  it('surfaces an atomic batch failure instead of returning a partial Activity', async () => {
    const repository = new WorkspaceCalendarActivityRepository(new FakeStore([], [], true))

    await expect(repository.createActivity(input())).rejects.toThrow(
      'calendar_activity_create_batch_failed',
    )
  })
})

import { describe, expect, it } from 'vitest'

import type { Activity } from '@fieldrep/domain'

import type {
  WorkspaceAtomicDataStore,
  WorkspaceWriteCommand,
  WorkspaceWriteResult,
} from './contracts'
import { WorkspaceCalendarActivityRepository } from './calendar-activity-repository'

class FakeStore implements WorkspaceAtomicDataStore {
  readonly workspaceId = 'workspace-a'
  readonly schemaVersion = 7
  readonly batches: readonly WorkspaceWriteCommand[][] = []
  private mutableBatches: WorkspaceWriteCommand[][] = []

  constructor(private readonly failBatch = false) {
    Object.defineProperty(this, 'batches', { get: () => this.mutableBatches })
  }

  async health(): Promise<boolean> {
    return true
  }

  async queryFirst<T>(): Promise<T | null> {
    return null
  }

  async queryAll<T>(): Promise<T[]> {
    return []
  }

  async execute(): Promise<WorkspaceWriteResult> {
    return { success: true, changes: 1 }
  }

  async executeBatch(commands: readonly WorkspaceWriteCommand[]): Promise<WorkspaceWriteResult[]> {
    this.mutableBatches.push([...commands])
    return commands.map(() => ({ success: !this.failBatch, changes: this.failBatch ? 0 : 1 }))
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
    const repository = new WorkspaceCalendarActivityRepository(new FakeStore(true))

    await expect(repository.createActivity(input())).rejects.toThrow(
      'calendar_activity_create_batch_failed',
    )
  })
})

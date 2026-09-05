import { describe, expect, it } from 'vitest'

import type {
  WorkspaceAtomicDataStore,
  WorkspaceWriteCommand,
  WorkspaceWriteResult,
} from './contracts'
import { WorkspaceBusinessTripRepository } from './business-trip-repository'

const tripRow = {
  id: 'trip-1', workspace_id: 'workspace-a', user_id: 'user-1',
  origin_city: 'مشهد', origin_province: 'خراسان رضوی', purpose: 'ویزیت منطقه‌ای',
  transport: 'car', starts_at: Date.UTC(2026, 8, 10, 4), ends_at: Date.UTC(2026, 8, 12, 18),
  local_start_date: '2026-09-10', local_end_date: '2026-09-12', all_day: 0,
  blocks_planning: 1, status: 'draft', decided_by_user_id: null, decided_at: null,
  calendar_event_id: 'calendar-trip-1',
}

const destinationRow = {
  id: 'destination-1', business_trip_id: 'trip-1', sequence: 1, city: 'بجنورد',
  province: 'خراسان شمالی', address: null,
  starts_at: Date.UTC(2026, 8, 10, 8), ends_at: Date.UTC(2026, 8, 12, 16),
}

class FakeStore implements WorkspaceAtomicDataStore {
  readonly workspaceId = 'workspace-a'
  readonly schemaVersion = 10
  readonly batches: WorkspaceWriteCommand[][] = []
  constructor(
    private trip: Record<string, unknown> | null = tripRow,
    private destinations: Record<string, unknown>[] = [destinationRow],
  ) {}
  async health(): Promise<boolean> { return true }
  async queryFirst<T>(query: string, values: readonly unknown[] = []): Promise<T | null> {
    if (this.trip === null || !query.includes('FROM business_trips t')) return null
    if (query.includes('t.user_id = ?')) {
      if (this.trip.user_id !== values[1] || this.trip.id !== values[2]) return null
    } else if (this.trip.id !== values[1]) return null
    return this.trip as T
  }
  async queryAll<T>(query: string, values: readonly unknown[] = []): Promise<T[]> {
    if (query.includes('FROM business_trip_destinations')) return this.destinations as T[]
    if (query.includes('FROM business_trips t')) {
      return this.trip !== null && this.trip.user_id === values[1] ? [this.trip as T] : []
    }
    return []
  }
  async execute(): Promise<WorkspaceWriteResult> { return { success: true, changes: 1 } }
  async executeBatch(commands: readonly WorkspaceWriteCommand[]): Promise<WorkspaceWriteResult[]> {
    this.batches.push([...commands])
    return commands.map(() => ({ success: true, changes: 1 }))
  }
}

function input() {
  return {
    id: 'trip-1', calendarEventId: 'calendar-trip-1', userId: 'user-1',
    originCity: ' مشهد ', originProvince: ' خراسان رضوی ', purpose: ' ویزیت منطقه‌ای ',
    transport: 'car' as const,
    startsAt: Date.UTC(2026, 8, 10, 4), endsAt: Date.UTC(2026, 8, 12, 18),
    localStartDate: '2026-09-10', localEndDate: '2026-09-12', allDay: false,
    blocksPlanning: true,
    destinations: [{
      id: 'destination-1', sequence: 1, city: ' بجنورد ', province: ' خراسان شمالی ',
      address: null, startsAt: Date.UTC(2026, 8, 10, 8), endsAt: Date.UTC(2026, 8, 12, 16),
    }],
  }
}

describe('WorkspaceBusinessTripRepository', () => {
  it('atomically persists trip, destinations, Calendar projection and owner attendee', async () => {
    const store = new FakeStore(null, [])
    const repository = new WorkspaceBusinessTripRepository(store, () => 1_780_000_000_000)

    const created = await repository.createDraft(input())

    expect(created).toMatchObject({ originCity: 'مشهد', status: 'draft', blocksPlanning: true })
    expect(created.destinations[0]?.city).toBe('بجنورد')
    const commands = store.batches[0]!
    expect(commands).toHaveLength(4)
    expect(commands[0]?.query).toContain('INSERT INTO business_trips')
    expect(commands[1]?.query).toContain('INSERT INTO business_trip_destinations')
    expect(commands[2]?.query).toContain("'business_trip'")
    expect(commands[2]?.query).toContain('counts_as_visit')
    expect(commands[3]?.values).toEqual([
      'calendar-trip-1', 'workspace-a', 'user-1', 1_780_000_000_000, 1_780_000_000_000,
    ])
  })

  it('hydrates destinations and enforces owner read isolation', async () => {
    const store = new FakeStore()
    const repository = new WorkspaceBusinessTripRepository(store)

    const own = await repository.getOwn('user-1', 'trip-1')
    expect(own?.destinations).toEqual([
      expect.objectContaining({ id: 'destination-1', sequence: 1, city: 'بجنورد' }),
    ])
    await expect(repository.getOwn('user-2', 'trip-1')).resolves.toBeNull()
  })

  it('request does not block Planner before approval', async () => {
    const store = new FakeStore()
    const repository = new WorkspaceBusinessTripRepository(store, () => 1_780_000_000_001)

    const requested = await repository.submitOwn('user-1', 'trip-1')

    expect(requested?.status).toBe('requested')
    expect(store.batches[0]?.[1]?.query).toContain('blocks_planning = 0')
    expect(store.batches[0]?.[1]?.query).toContain('counts_as_visit = 0')
  })

  it('separate approval enables configured constraint while preserving non-Visit KPI semantics', async () => {
    const store = new FakeStore({ ...tripRow, status: 'requested' })
    const repository = new WorkspaceBusinessTripRepository(store, () => 1_780_000_000_002)

    const approved = await repository.decide('trip-1', 'approved', 'supervisor-1')

    expect(approved).toMatchObject({ status: 'approved', decidedByUserId: 'supervisor-1' })
    const projection = store.batches[0]?.[1]
    expect(projection?.values?.[0]).toBe('active')
    expect(projection?.values?.[1]).toBe(1)
    expect(projection?.query).toContain('counts_as_visit = 0')
  })
})

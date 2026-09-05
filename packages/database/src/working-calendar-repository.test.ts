import { describe, expect, it } from 'vitest'

import { IRAN_OFFICIAL_CALENDAR_1405 } from '@fieldrep/domain'

import type {
  WorkspaceAtomicDataStore,
  WorkspaceWriteCommand,
  WorkspaceWriteResult,
} from './contracts'
import { WorkspaceWorkingCalendarRepository } from './working-calendar-repository'

interface RecordedCall {
  query: string
  values: readonly unknown[]
}

const source = {
  authority: 'Calendar Center, Institute of Geophysics, University of Tehran',
  reference: 'https://calendar.ut.ac.ir/example.pdf',
  retrievedAt: '2026-09-05T00:00:00.000Z',
}

class FakeStore implements WorkspaceAtomicDataStore {
  readonly workspaceId = 'workspace-a'
  readonly schemaVersion = 8
  readonly reads: RecordedCall[] = []
  readonly writes: RecordedCall[] = []
  readonly batches: readonly WorkspaceWriteCommand[][] = []
  private mutableBatches: WorkspaceWriteCommand[][] = []

  constructor(
    private readonly versionPresent = true,
    private readonly rulePresent = true,
    private readonly eventRows: Record<string, unknown>[] = [],
    private readonly overrideRows: Record<string, unknown>[] = [],
  ) {
    Object.defineProperty(this, 'batches', { get: () => this.mutableBatches })
  }

  async health(): Promise<boolean> {
    return true
  }

  async queryFirst<T>(query: string, values: readonly unknown[] = []): Promise<T | null> {
    this.reads.push({ query, values })
    if (query.includes('FROM official_calendar_versions')) {
      if (!this.versionPresent) return null
      return {
        id: 'official-1405-v1',
        country_code: 'IR',
        jalali_year: 1405,
        version_label: 'ir-1405.1',
        sources_json: JSON.stringify([source]),
      } as T
    }
    if (query.includes('FROM working_calendar_rules')) {
      return this.rulePresent ? ({ is_working_day: 1 } as T) : null
    }
    return null
  }

  async queryAll<T>(query: string, values: readonly unknown[] = []): Promise<T[]> {
    this.reads.push({ query, values })
    if (query.includes('FROM official_calendar_events')) return this.eventRows as T[]
    if (query.includes('FROM calendar_overrides')) return this.overrideRows as T[]
    return []
  }

  async execute(query: string, values: readonly unknown[] = []): Promise<WorkspaceWriteResult> {
    this.writes.push({ query, values })
    return { success: true, changes: 1 }
  }

  async executeBatch(commands: readonly WorkspaceWriteCommand[]): Promise<WorkspaceWriteResult[]> {
    this.mutableBatches.push([...commands])
    return commands.map(() => ({ success: true, changes: 1 }))
  }
}

describe('WorkspaceWorkingCalendarRepository', () => {
  it('publishes a validated annual dataset atomically with one row per event', async () => {
    const store = new FakeStore()
    const repository = new WorkspaceWorkingCalendarRepository(store, () => 1_780_000_000_000)

    await repository.publishOfficialCalendar('official-1405-v1', IRAN_OFFICIAL_CALENDAR_1405)

    expect(store.batches).toHaveLength(1)
    const commands = store.batches[0]!
    expect(commands).toHaveLength(28)
    expect(commands[0]?.query).toContain("status = 'superseded'")
    expect(commands[1]?.query).toContain('INSERT INTO official_calendar_versions')
    expect(commands[2]?.query).toContain('INSERT INTO official_calendar_events')
    expect(commands[2]?.values?.[0]).toBe('official-1405-v1:ir-1405-holiday-01')
  })

  it('persists working rules and overrides with the physical workspace injected', async () => {
    const store = new FakeStore()
    const repository = new WorkspaceWorkingCalendarRepository(store, () => 1_780_000_000_001)

    await repository.createWorkingRule({
      id: 'rule-saturday',
      sourceScope: 'workspace',
      sourceScopeId: 'workspace-a',
      weekdayIndex: 0,
      isWorkingDay: true,
      validFrom: '2026-03-21',
    })
    await repository.createOverride({
      id: 'closure-1',
      scope: 'company',
      scopeId: 'company-1',
      startsOn: '2026-09-05',
      endsOn: '2026-09-05',
      mode: 'closure',
      title: 'تعطیلی شرکت',
      createdByUserId: 'admin-1',
    })

    expect(store.writes).toHaveLength(2)
    expect(store.writes[0]?.values?.[1]).toBe('workspace-a')
    expect(store.writes[1]?.values?.[1]).toBe('workspace-a')
  })

  it('resolves an official holiday as blocked using verified version data', async () => {
    const store = new FakeStore(true, true, [
      {
        id: 'official-1405-v1:holiday-1',
        jalali_month: 6,
        jalali_day: 8,
        canonical_date: '2026-08-30',
        label: 'ولادت پیامبر اکرم (ص) و امام جعفر صادق (ع)',
        event_kind: 'religious',
        is_holiday: 1,
        source_json: JSON.stringify(source),
      },
    ])
    const repository = new WorkspaceWorkingCalendarRepository(store)

    const context = await repository.resolveDay('company-1', '2026-08-30')

    expect(context.planningAllowed).toBe(false)
    expect(context.reasons).toContainEqual(
      expect.objectContaining({ code: 'official_holiday', blocking: true }),
    )
    expect(store.reads.some((read) => read.query.includes('FROM working_calendar_rules'))).toBe(true)
  })

  it('applies a company closure on a normal working day', async () => {
    const store = new FakeStore(true, true, [], [
      {
        id: 'closure-1',
        source_scope: 'company',
        source_scope_id: 'company-1',
        starts_on: '2026-09-05',
        ends_on: '2026-09-05',
        override_mode: 'closure',
        title: 'تعطیلی شرکت',
        reason: null,
      },
    ])
    const repository = new WorkspaceWorkingCalendarRepository(store)

    const context = await repository.resolveDay('company-1', '2026-09-05')

    expect(context.planningAllowed).toBe(false)
    expect(context.reasons[0]?.code).toBe('company_closure')
  })

  it('fails closed when the annual official dataset is not published', async () => {
    const repository = new WorkspaceWorkingCalendarRepository(new FakeStore(false, true))

    await expect(repository.resolveDay('company-1', '2026-09-05')).rejects.toThrow(
      'official_calendar_dataset_missing',
    )
  })

  it('fails closed when no effective working-week rule exists', async () => {
    const repository = new WorkspaceWorkingCalendarRepository(new FakeStore(true, false))

    await expect(repository.resolveDay('company-1', '2026-09-05')).rejects.toThrow(
      'working_calendar_policy_missing',
    )
  })
})

import { DEFAULT_TARGETS_POLICY, normalizeTargetsPolicy } from '@fieldrep/domain'
import { describe, expect, it } from 'vitest'

import type { WorkspaceWriteResult, WorkspaceWritableDataStore } from './contracts'
import {
  WorkspaceCalendarAdminRepository,
  type CalendarAdminRepository,
} from './calendar-admin-repository'

interface FakeStoreData {
  workingCalendar?: {
    workspace_id: string
    timezone: string
    working_weekdays_json: string
    updated_at: number
  }
  closures?: Array<{
    id: string
    workspace_id: string
    closure_level: 'company' | 'workspace'
    canonical_date: string
    label: string
    created_at: number
  }>
  settings?: Array<{ workspace_id: string; setting_key: string; value_json: string }>
}

class FakeStore implements WorkspaceWritableDataStore {
  public executeCalls: { query: string; values: unknown[] }[] = []
  public changes = 1

  constructor(
    public workspaceId: string = 'workspace-a',
    public schemaVersion: number = 1,
    private readonly data: FakeStoreData = {},
  ) {}

  health(): Promise<boolean> {
    return Promise.resolve(true)
  }

  queryFirst<T>(query: string, values?: readonly unknown[]): Promise<T | null> {
    const rows = this.getRows<T>(query, values ?? [])
    return Promise.resolve(rows[0] ?? null)
  }

  queryAll<T>(query: string, values?: readonly unknown[]): Promise<T[]> {
    return Promise.resolve(this.getRows<T>(query, values ?? []))
  }

  execute(query: string, values?: readonly unknown[]): Promise<WorkspaceWriteResult> {
    this.executeCalls.push({ query, values: [...(values ?? [])] })
    return Promise.resolve({ success: true, changes: this.changes })
  }

  private getRows<T>(query: string, values: readonly unknown[]): T[] {
    if (query.includes('FROM workspace_working_calendar')) {
      const row = this.data.workingCalendar
      return (row ? [row] : []) as T[]
    }
    if (query.includes('FROM calendar_closures')) {
      return (this.data.closures ?? []) as T[]
    }
    if (query.includes('FROM workspace_settings')) {
      const key = values[1] as string | undefined
      const row = (this.data.settings ?? []).find(
        (s) => s.setting_key === key,
      )
      return (row ? [row] : []) as T[]
    }
    return []
  }
}

function repository(store: FakeStore): CalendarAdminRepository {
  return new WorkspaceCalendarAdminRepository(store, () => 1000)
}

describe('WorkspaceCalendarAdminRepository', () => {
  it('getWorkingCalendar returns defaults when no row exists', async () => {
    const repo = repository(new FakeStore())
    const config = await repo.getWorkingCalendar()
    expect(config.timezone).toBe('Asia/Tehran')
    expect(config.workingWeekdays).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('getWorkingCalendar reads the stored row', async () => {
    const store = new FakeStore('workspace-a', 1, {
      workingCalendar: {
        workspace_id: 'workspace-a',
        timezone: 'Asia/Dubai',
        working_weekdays_json: '[0,1]',
        updated_at: 1700000000,
      },
    })
    const config = await repository(store).getWorkingCalendar()
    expect(config.timezone).toBe('Asia/Dubai')
    expect(config.workingWeekdays).toEqual([0, 1])
  })

  it('updateWorkingCalendar filters invalid weekday indexes', async () => {
    const store = new FakeStore()
    const repo = repository(store)
    await repo.updateWorkingCalendar({ workingWeekdays: [0, 9, -1, 3.5, 5] })
    expect(store.executeCalls).toHaveLength(1)
    const values = store.executeCalls[0]!.values as unknown[]
    expect(JSON.parse(values[2] as string)).toEqual([0, 5])
  })

  it('createClosure upserts by natural key and returns the domain shape', async () => {
    const store = new FakeStore()
    const repo = repository(store)
    const closure = await repo.createClosure({
      id: 'cl-1',
      level: 'workspace',
      canonicalDate: '2026-09-25',
      label: 'Company holiday',
      createdByUserId: 'admin-1',
    })
    expect(closure.id).toBe('cl-1')
    expect(closure.canonicalDate).toBe('2026-09-25')
    expect(store.executeCalls).toHaveLength(1)
    expect(store.executeCalls[0]!.query).toContain('ON CONFLICT')
  })

  it('deleteClosure returns true only when a row is removed', async () => {
    const store = new FakeStore()
    const repo = repository(store)
    expect(await repo.deleteClosure('cl-1')).toBe(true)
    store.changes = 0
    expect(await repo.deleteClosure('missing')).toBe(false)
  })

  it('getTargetsPolicy returns safe defaults when no row exists', async () => {
    const repo = repository(new FakeStore())
    const policy = await repo.getTargetsPolicy()
    expect(policy.defaultDailyTarget).toBe(DEFAULT_TARGETS_POLICY.defaultDailyTarget)
    expect(policy.maxDailyVisits).toBe(DEFAULT_TARGETS_POLICY.maxDailyVisits)
    expect(policy.classFrequency).toEqual({})
  })

  it('updateTargetsPolicy merges with the stored policy', async () => {
    const store = new FakeStore('workspace-a', 1, {
      settings: [
        {
          workspace_id: 'workspace-a',
          setting_key: 'planning:targets',
          value_json: JSON.stringify({ classFrequency: { A: 4 }, defaultDailyTarget: 6, maxDailyVisits: 10 }),
        },
      ],
    })
    const repo = repository(store)
    const merged = await repo.updateTargetsPolicy({ defaultDailyTarget: 8 }, 'admin-1')
    expect(merged.defaultDailyTarget).toBe(8)
    expect(merged.classFrequency.A).toBe(4)
    expect(store.executeCalls[0]!.values[2]).toContain('"defaultDailyTarget":8')
  })

  it('normalizeTargetsPolicy clamps invalid values', () => {
    const policy = normalizeTargetsPolicy(
      JSON.stringify({ classFrequency: { A: 'x', B: 2.7 }, defaultDailyTarget: -3, maxDailyVisits: 'bad' }),
    )
    expect(policy.classFrequency.A).toBe(0)
    expect(policy.classFrequency.B).toBe(2.7)
    expect(policy.defaultDailyTarget).toBe(0)
    expect(policy.maxDailyVisits).toBe(DEFAULT_TARGETS_POLICY.maxDailyVisits)
  })
})

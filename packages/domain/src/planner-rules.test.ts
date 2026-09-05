import { describe, expect, it } from 'vitest'

import type { PlanEntry } from './planner-contracts'
import {
  countActivePlanEntries,
  deriveVisitProgress,
  evaluateDailyTarget,
  findDuplicatePlanConflicts,
} from './planner-rules'

function planEntry(overrides: Partial<PlanEntry> = {}): PlanEntry {
  return {
    id: 'plan-1',
    workspaceId: 'workspace-1',
    ownerUserId: 'user-1',
    customerId: 'doctor-1',
    planDate: '2026-09-05',
    routeId: 'route-1',
    status: 'planned',
    source: 'manual',
    ...overrides,
  }
}

describe('Excel parity visit progress', () => {
  it('marks an under-frequency doctor incomplete', () => {
    expect(deriveVisitProgress(6, 3)).toEqual({
      frequency: 6,
      visited: 3,
      remaining: 3,
      achievementRatio: 0.5,
      achievementPercent: 50,
      status: 'incomplete',
    })
  })

  it('marks exact frequency achieved', () => {
    expect(deriveVisitProgress(4, 4).status).toBe('achieved')
  })

  it('keeps over-achievement above 100 percent', () => {
    const result = deriveVisitProgress(6, 7)
    expect(result.status).toBe('over_achieved')
    expect(result.achievementPercent).toBeCloseTo(116.6666667)
    expect(result.remaining).toBe(0)
  })

  it('handles zero frequency without division by zero', () => {
    expect(deriveVisitProgress(0, 0)).toEqual({
      frequency: 0,
      visited: 0,
      remaining: 0,
      achievementRatio: null,
      achievementPercent: null,
      status: 'not_required',
    })
  })

  it('rejects invalid negative inputs', () => {
    expect(() => deriveVisitProgress(-1, 0)).toThrow(RangeError)
    expect(() => deriveVisitProgress(6, -1)).toThrow(RangeError)
  })
})

describe('daily target parity', () => {
  it('tracks below, exact and over target states', () => {
    expect(evaluateDailyTarget(9, 7)).toMatchObject({
      remaining: 2,
      overBy: 0,
      status: 'below_target',
    })
    expect(evaluateDailyTarget(9, 9).status).toBe('target_met')
    expect(evaluateDailyTarget(9, 11)).toMatchObject({
      remaining: 0,
      overBy: 2,
      status: 'over_target',
    })
  })
})

describe('duplicate planning parity', () => {
  it('reports the same customer on the same day as an error', () => {
    const existing = planEntry()
    const candidate = planEntry({ id: 'plan-2' })

    expect(findDuplicatePlanConflicts([existing], candidate)).toEqual([
      expect.objectContaining({
        entryId: 'plan-1',
        kind: 'same_day',
        severity: 'error',
        dayDistance: 0,
      }),
    ])
  })

  it('reports the same customer on an adjacent day as a warning', () => {
    const existing = planEntry({ planDate: '2026-09-05' })
    const candidate = planEntry({ id: 'plan-2', planDate: '2026-09-06' })

    expect(findDuplicatePlanConflicts([existing], candidate)).toEqual([
      expect.objectContaining({
        kind: 'nearby_day',
        severity: 'warning',
        dayDistance: 1,
      }),
    ])
  })

  it('does not flag entries outside the configured nearby window', () => {
    const existing = planEntry({ planDate: '2026-09-05' })
    const candidate = planEntry({ id: 'plan-2', planDate: '2026-09-07' })

    expect(findDuplicatePlanConflicts([existing], candidate)).toEqual([])
  })

  it('ignores cancelled and rescheduled historical entries', () => {
    const candidate = planEntry({ id: 'candidate' })
    const entries = [
      planEntry({ id: 'cancelled', status: 'cancelled' }),
      planEntry({ id: 'rescheduled', status: 'rescheduled' }),
    ]

    expect(findDuplicatePlanConflicts(entries, candidate)).toEqual([])
  })

  it('does not compare a plan entry with itself during edits', () => {
    const existing = planEntry()
    expect(findDuplicatePlanConflicts([existing], existing)).toEqual([])
  })

  it('keeps workspace and user boundaries when detecting duplicates', () => {
    const candidate = planEntry({ id: 'candidate' })
    const entries = [
      planEntry({ id: 'other-workspace', workspaceId: 'workspace-2' }),
      planEntry({ id: 'other-user', ownerUserId: 'user-2' }),
    ]

    expect(findDuplicatePlanConflicts(entries, candidate)).toEqual([])
  })
})

describe('daily active plan count', () => {
  it('counts active and missed entries while excluding cancelled/rescheduled entries', () => {
    const entries = [
      planEntry({ id: 'p1', status: 'planned' }),
      planEntry({ id: 'p2', status: 'completed' }),
      planEntry({ id: 'p3', status: 'missed' }),
      planEntry({ id: 'p4', status: 'cancelled' }),
      planEntry({ id: 'p5', status: 'rescheduled' }),
      planEntry({ id: 'p6', planDate: '2026-09-06' }),
    ]

    expect(countActivePlanEntries(entries, '2026-09-05')).toBe(3)
  })

  it('rejects malformed canonical dates', () => {
    expect(() => countActivePlanEntries([], '1405/06/14')).toThrow(RangeError)
    expect(() => countActivePlanEntries([], '2026-02-31')).toThrow(RangeError)
  })
})

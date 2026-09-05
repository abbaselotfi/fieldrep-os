import { describe, expect, it } from 'vitest'

import type { PlanEntry } from './planner-contracts'
import { evaluatePlanCandidate } from './planner-engine'
import { planningCycleBounds } from './planning-cycle'

function entry(overrides: Partial<PlanEntry> = {}): PlanEntry {
  return {
    id: 'candidate',
    workspaceId: 'workspace-a',
    ownerUserId: 'user-1',
    customerId: 'doctor-1',
    planDate: '2026-09-05',
    routeId: 'route-1',
    status: 'planned',
    source: 'manual',
    ...overrides,
  }
}

const cycle = planningCycleBounds({ jalaliYear: 1405, quarter: 2 })

describe('planner domain engine', () => {
  it('allows a normal in-cycle candidate', () => {
    const result = evaluatePlanCandidate({
      cycle,
      dailyTarget: 9,
      existingEntries: [],
      candidate: entry(),
      requiredFrequency: 6,
      visited: 3,
      customerRouteIds: ['route-1'],
    })

    expect(result.canAdd).toBe(true)
    expect(result.issues).toEqual([])
    expect(result.visitProgress).toMatchObject({ status: 'incomplete', remaining: 3 })
    expect(result.dailyTargetAfter).toMatchObject({ planned: 1, status: 'below_target' })
  })

  it('blocks an entry outside the active quarter', () => {
    const result = evaluatePlanCandidate({
      cycle,
      dailyTarget: 9,
      existingEntries: [],
      candidate: entry({ planDate: '2026-09-23' }),
      requiredFrequency: 6,
      visited: 1,
    })

    expect(result.canAdd).toBe(false)
    expect(result.issues).toContainEqual({ code: 'outside_planning_cycle', severity: 'error' })
  })

  it('blocks a same-day duplicate and keeps the underlying conflict detail', () => {
    const existing = entry({ id: 'existing' })
    const result = evaluatePlanCandidate({
      cycle,
      dailyTarget: 9,
      existingEntries: [existing],
      candidate: entry(),
      requiredFrequency: 6,
      visited: 2,
    })

    expect(result.canAdd).toBe(false)
    expect(result.issues).toContainEqual({ code: 'duplicate_same_day', severity: 'error' })
    expect(result.duplicateConflicts[0]).toMatchObject({ kind: 'same_day', entryId: 'existing' })
  })

  it('warns for an adjacent-day duplicate without blocking the plan', () => {
    const existing = entry({ id: 'existing', planDate: '2026-09-04' })
    const result = evaluatePlanCandidate({
      cycle,
      dailyTarget: 9,
      existingEntries: [existing],
      candidate: entry(),
      requiredFrequency: 6,
      visited: 2,
    })

    expect(result.canAdd).toBe(true)
    expect(result.issues).toContainEqual({ code: 'duplicate_nearby_day', severity: 'warning' })
  })

  it('warns when the selected route is not assigned to the customer', () => {
    const result = evaluatePlanCandidate({
      cycle,
      dailyTarget: 9,
      existingEntries: [],
      candidate: entry({ routeId: 'route-2' }),
      requiredFrequency: 6,
      visited: 2,
      customerRouteIds: ['route-1'],
    })

    expect(result.canAdd).toBe(true)
    expect(result.issues).toContainEqual({ code: 'route_mismatch', severity: 'warning' })
  })

  it('warns when required frequency is already achieved', () => {
    const result = evaluatePlanCandidate({
      cycle,
      dailyTarget: 9,
      existingEntries: [],
      candidate: entry(),
      requiredFrequency: 4,
      visited: 4,
    })

    expect(result.issues).toContainEqual({ code: 'frequency_already_achieved', severity: 'warning' })
    expect(result.canAdd).toBe(true)
  })

  it('warns when adding the candidate takes the day over target', () => {
    const existingEntries = Array.from({ length: 9 }, (_, index) =>
      entry({
        id: `existing-${index}`,
        customerId: `doctor-${index + 2}`,
      }),
    )

    const result = evaluatePlanCandidate({
      cycle,
      dailyTarget: 9,
      existingEntries,
      candidate: entry(),
      requiredFrequency: 6,
      visited: 1,
    })

    expect(result.dailyTargetBefore.status).toBe('target_met')
    expect(result.dailyTargetAfter).toMatchObject({ planned: 10, overBy: 1, status: 'over_target' })
    expect(result.issues).toContainEqual({ code: 'daily_target_exceeded', severity: 'warning' })
    expect(result.canAdd).toBe(true)
  })
})

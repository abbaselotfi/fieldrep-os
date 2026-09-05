import { describe, expect, it } from 'vitest'

import {
  activePreviewPlans,
  cancelPreviewPlan,
  createPreviewPlan,
  createPreviewPlanSeed,
  previewAdjacentDuplicateDates,
  previewDayProgress,
  updatePreviewPlan,
} from './preview-plan'

describe('planner preview model', () => {
  it('creates one normalized active entry for every seeded weekly customer slot', () => {
    const entries = createPreviewPlanSeed()

    expect(entries).toHaveLength(24)
    expect(activePreviewPlans(entries)).toHaveLength(24)
    expect(entries[0]).toMatchObject({
      planDate: '2026-09-06',
      customerId: 'doctor-arman-rezaei',
      status: 'planned',
    })
  })

  it('blocks a same-day duplicate but allows the same customer on another day', () => {
    const entries = createPreviewPlanSeed()

    const duplicate = createPreviewPlan(
      entries,
      { customerId: 'doctor-arman-rezaei', planDate: '2026-09-06' },
      'new-1',
    )
    expect(duplicate.error).toBe('duplicate_same_day')
    expect(duplicate.entries).toHaveLength(entries.length)

    const allowed = createPreviewPlan(
      entries,
      { customerId: 'doctor-elham-tavakoli', planDate: '2026-09-07' },
      'new-2',
    )
    expect(allowed.error).toBeNull()
    expect(allowed.entries).toHaveLength(entries.length + 1)
  })

  it('detects adjacent-day repetition as advisory information', () => {
    const entries = createPreviewPlanSeed()
    const dates = previewAdjacentDuplicateDates(entries, {
      customerId: 'doctor-arman-rezaei',
      planDate: '2026-09-07',
    })

    expect(dates).toContain('2026-09-06')
    expect(dates).toContain('2026-09-08')
  })

  it('prevents an edit from colliding with another active same-day entry', () => {
    const entries = createPreviewPlanSeed()
    const target = entries.find(
      (entry) => entry.customerId === 'doctor-arman-rezaei' && entry.planDate === '2026-09-07',
    )!

    const result = updatePreviewPlan(entries, target.id, {
      customerId: 'doctor-arman-rezaei',
      planDate: '2026-09-06',
    })

    expect(result.error).toBe('duplicate_same_day')
  })

  it('soft-cancels an entry and releases its same-day slot', () => {
    const entries = createPreviewPlanSeed()
    const target = entries.find(
      (entry) => entry.customerId === 'doctor-arman-rezaei' && entry.planDate === '2026-09-06',
    )!
    const cancelled = cancelPreviewPlan(entries, target.id)

    expect(activePreviewPlans(cancelled)).toHaveLength(entries.length - 1)

    const replacement = createPreviewPlan(
      cancelled,
      { customerId: 'doctor-arman-rezaei', planDate: '2026-09-06' },
      'replacement',
    )
    expect(replacement.error).toBeNull()
  })

  it('derives daily target progress from the shared mutable plan state', () => {
    const entries = createPreviewPlanSeed()
    const progress = previewDayProgress(entries, '2026-09-06')

    expect(progress).toEqual({ planned: 8, target: 9, remaining: 1, overBy: 0 })
  })
})

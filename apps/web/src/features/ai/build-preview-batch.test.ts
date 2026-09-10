import { describe, expect, it } from 'vitest'

import { previewPlannerDays } from '../planner/preview-plan'
import { buildPreviewBatch } from './build-preview-batch'

describe('buildPreviewBatch', () => {
  const batch = buildPreviewBatch()

  it('scores every demo customer with the real engine', () => {
    expect(batch.suggestions.length).toBeGreaterThan(0)
    for (const suggestion of batch.suggestions) {
      expect(suggestion.score).toBeGreaterThan(0)
      expect(suggestion.reasons.length).toBeGreaterThan(0)
      expect(['very_high', 'high', 'medium', 'low']).toContain(suggestion.priorityBand)
    }
  })

  it('uses preview planner days as eligible dates', () => {
    const dates = new Set(previewPlannerDays.map((day) => day.planDate))
    for (const suggestion of batch.suggestions) {
      expect(dates.has(suggestion.suggestedDate)).toBe(true)
    }
  })

  it('is deterministic for identical inputs (§21)', () => {
    expect(buildPreviewBatch()).toEqual(buildPreviewBatch())
  })

  it('orders suggestions by descending score', () => {
    const scores = batch.suggestions.map((suggestion) => suggestion.score)
    const sorted = [...scores].sort((a, b) => b - a)
    expect(scores).toEqual(sorted)
  })

  it('top suggestion carries the class-priority factor at the top band', () => {
    const top = batch.suggestions[0]
    expect(top?.priorityBand === 'very_high' || top?.priorityBand === 'high').toBe(true)
    expect(top?.reasons.map((reason) => reason.code)).toContain('class_priority')
  })
})
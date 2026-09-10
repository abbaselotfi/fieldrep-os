import { describe, expect, it } from 'vitest'

import type { VisitSuggestion } from '@fieldrep/domain'

import { describeSuggestion, reasonLabels } from './recommendation-labels'

const suggestion: VisitSuggestion = {
  id: 'suggestion-1',
  customerId: 'doctor-1',
  suggestedDate: '2026-09-10',
  score: 60,
  priorityBand: 'high',
  reasons: [
    { code: 'frequency_gap', labelKey: 'recommendation.reason.frequency_gap', value: 3, contribution: 15 },
    { code: 'class_priority', labelKey: 'recommendation.reason.class_priority', value: 1, contribution: 20 },
  ],
  status: 'suggested',
}

describe('recommendation labels', () => {
  it('maps every reason code onto a Persian label', () => {
    expect(reasonLabels(suggestion)).toEqual([
      'ویزیت باقیمانده از فرکانس الزامی',
      'اولویت کلاس مشتری',
    ])
  })

  it('falls back to the raw code for unknown reasons', () => {
    const extended = {
      ...suggestion,
      reasons: [
        ...suggestion.reasons,
        { code: 'campaign_priority', labelKey: 'x' },
      ],
    } as VisitSuggestion
    expect(reasonLabels(extended)[2]).toBe('campaign_priority')
  })

  it('describes suggestions reproducibly from structured reasons (§10)', () => {
    expect(describeSuggestion(suggestion)).toBe(
      'ویزیت باقیمانده از فرکانس الزامی · اولویت کلاس مشتری',
    )
  })

  it('explains empty-reason suggestions honestly', () => {
    expect(describeSuggestion({ ...suggestion, reasons: [] })).toBe(
      'بدون فاکتور امتیاز فعال',
    )
  })
})
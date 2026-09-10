import { describe, expect, it } from 'vitest'

import type { VisitSuggestion } from './recommendation-suggestion'
import {
  decideSuggestion,
  SuggestionDecisionError,
} from './recommendation-acceptance'

function suggestion(overrides: Partial<VisitSuggestion> = {}): VisitSuggestion {
  return {
    id: 'suggestion-1',
    customerId: 'doctor-1',
    suggestedDate: '2026-09-10',
    suggestedLocationId: 'location-1',
    score: 55,
    priorityBand: 'high',
    reasons: [],
    status: 'suggested',
    ...overrides,
  }
}

describe('decideSuggestion', () => {
  it('accepting produces a plan seed with ai_suggestion provenance (§13)', () => {
    const decision = decideSuggestion({ suggestion: suggestion(), action: 'accept' })
    expect(decision.nextStatus).toBe('accepted')
    expect(decision.planSeed).toEqual({
      suggestionId: 'suggestion-1',
      customerId: 'doctor-1',
      planDate: '2026-09-10',
      locationId: 'location-1',
      source: 'ai_suggestion',
      sourceSuggestionId: 'suggestion-1',
    })
  })

  it('rejecting produces no plan seed', () => {
    const decision = decideSuggestion({ suggestion: suggestion(), action: 'reject' })
    expect(decision.nextStatus).toBe('rejected')
    expect(decision.planSeed).toBeNull()
  })

  it('editing requires at least one actual change', () => {
    expect(() =>
      decideSuggestion({ suggestion: suggestion(), action: 'edit', editedDate: '2026-09-10' }),
    ).toThrow(SuggestionDecisionError)
    expect(() =>
      decideSuggestion({ suggestion: suggestion(), action: 'edit' }),
    ).toThrow('suggestion_decision_failed:edit_requires_changes')
  })

  it('editing the date moves the plan seed to the adjusted date', () => {
    const decision = decideSuggestion({
      suggestion: suggestion(),
      action: 'edit',
      editedDate: '2026-09-12',
    })
    expect(decision.nextStatus).toBe('edited')
    expect(decision.planSeed?.planDate).toBe('2026-09-12')
    expect(decision.planSeed?.locationId).toBe('location-1')
  })

  it('editing the location only keeps the suggested date', () => {
    const decision = decideSuggestion({
      suggestion: suggestion(),
      action: 'edit',
      editedLocationId: 'location-9',
    })
    expect(decision.planSeed?.planDate).toBe('2026-09-10')
    expect(decision.planSeed?.locationId).toBe('location-9')
  })

  it('rejects invalid edited dates', () => {
    expect(() =>
      decideSuggestion({
        suggestion: suggestion(),
        action: 'edit',
        editedDate: '10/12/2026',
      }),
    ).toThrow('suggestion_decision_failed:invalid_edited_date')
  })

  it('closed suggestions can no longer be accepted or edited', () => {
    for (const status of ['converted_to_plan', 'expired', 'rejected'] as const) {
      expect(() =>
        decideSuggestion({ suggestion: suggestion({ status }), action: 'accept' }),
      ).toThrow('suggestion_decision_failed:suggestion_not_open')
    }
  })
})
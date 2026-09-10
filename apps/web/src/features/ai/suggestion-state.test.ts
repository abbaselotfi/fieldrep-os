import { describe, expect, it } from 'vitest'

import { applySuggestionDecision, findSuggestion } from './suggestion-state'
import type { SuggestionDecision, VisitSuggestion } from '@fieldrep/domain'

const suggestions: VisitSuggestion[] = [
  {
    id: 'suggestion-1',
    customerId: 'doctor-1',
    suggestedDate: '2026-09-10',
    score: 60,
    priorityBand: 'high',
    reasons: [],
    status: 'suggested',
  },
  {
    id: 'suggestion-2',
    customerId: 'doctor-2',
    suggestedDate: '2026-09-11',
    score: 40,
    priorityBand: 'medium',
    reasons: [],
    status: 'suggested',
  },
]

const accept: SuggestionDecision = {
  suggestionId: 'suggestion-1',
  action: 'accept',
  nextStatus: 'accepted',
  planSeed: null,
}

describe('applySuggestionDecision', () => {
  it('updates only the decided suggestion', () => {
    const next = applySuggestionDecision(suggestions, accept)
    expect(next[0]?.status).toBe('accepted')
    expect(next[1]?.status).toBe('suggested')
  })

  it('does not mutate the original list', () => {
    applySuggestionDecision(suggestions, accept)
    expect(suggestions[0]?.status).toBe('suggested')
  })

  it('ignores unknown suggestion ids', () => {
    const next = applySuggestionDecision(suggestions, {
      ...accept,
      suggestionId: 'suggestion-missing',
    })
    expect(next).toEqual(suggestions)
  })

  it('finds suggestions by id', () => {
    expect(findSuggestion(suggestions, 'suggestion-2')?.customerId).toBe('doctor-2')
    expect(findSuggestion(suggestions, 'missing')).toBeNull()
  })
})
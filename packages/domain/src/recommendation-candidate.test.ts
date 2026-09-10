import { describe, expect, it } from 'vitest'

import { deriveRecommendationFeatures } from './recommendation-features'
import {
  candidateIsAllowed,
  rankRecommendationCandidates,
  type RecommendationCandidate,
} from './recommendation-candidate'

function candidate(overrides: Partial<RecommendationCandidate> = {}): RecommendationCandidate {
  return {
    id: 'candidate-1',
    customerId: 'doctor-1',
    candidateLocationIds: ['location-1'],
    eligibleDates: ['2026-09-10'],
    features: deriveRecommendationFeatures({
      requiredFrequency: 6,
      completedFrequency: 3,
      daysSinceLastVisit: 27,
      cycleDaysRemaining: 21,
      cycleWorkingDays: 40,
      classWeight: 1,
      routeAffinity: 0.5,
    }),
    constraints: [],
    ...overrides,
  }
}

describe('candidateIsAllowed', () => {
  it('blocks candidates carrying a blocking constraint', () => {
    expect(candidateIsAllowed(candidate())).toBe(true)
    expect(
      candidateIsAllowed(
        candidate({ constraints: [{ code: 'user_on_leave', blocks: true }] }),
      ),
    ).toBe(false)
  })

  it('ignores non-blocking informational constraints', () => {
    expect(
      candidateIsAllowed(
        candidate({ constraints: [{ code: 'trip_destination_match', blocks: false }] }),
      ),
    ).toBe(true)
  })
})

describe('rankRecommendationCandidates', () => {
  it('ranks by score descending with hard-constraint gating', () => {
    const low = candidate({ id: 'a-low', customerId: 'doctor-a' })
    const high = candidate({
      id: 'b-high',
      customerId: 'doctor-b',
      features: deriveRecommendationFeatures({
        requiredFrequency: 8,
        completedFrequency: 0,
        daysSinceLastVisit: 40,
        cycleDaysRemaining: 2,
        cycleWorkingDays: 40,
        classWeight: 1,
        routeAffinity: 0.9,
      }),
    })
    const blockedButHigh = candidate({
      id: 'c-blocked',
      customerId: 'doctor-c',
      features: high.features,
      constraints: [{ code: 'company_closed', blocks: true }],
    })

    const ranked = rankRecommendationCandidates([low, high, blockedButHigh])
    expect(ranked.map((entry) => entry.candidate.id)).toEqual(['b-high', 'a-low', 'c-blocked'])
    expect(ranked[2]?.allowed).toBe(false)
  })

  it('breaks ties deterministically by id (§21)', () => {
    const first = candidate({ id: 'x-tie' })
    const second = candidate({ id: 'a-tie' })

    const ranked = rankRecommendationCandidates([first, second])
    expect(ranked.map((entry) => entry.candidate.id)).toEqual(['a-tie', 'x-tie'])
  })

  it('produces the same order on repeated calls', () => {
    const candidates = [candidate({ id: 'one' }), candidate({ id: 'two' })]
    const first = rankRecommendationCandidates(candidates).map((entry) => entry.candidate.id)
    const second = rankRecommendationCandidates(candidates).map((entry) => entry.candidate.id)
    expect(first).toEqual(second)
  })
})
import { describe, expect, it } from 'vitest'

import { rankRecommendationCandidates } from './recommendation-candidate'
import { deriveRecommendationFeatures } from './recommendation-features'
import {
  RECOMMENDATION_ENGINE_VERSION,
  RECOMMENDATION_POLICY_VERSION,
} from './recommendation-policy'
import { buildRecommendationBatch, type RankedCandidate } from './recommendation-batch'

function ranked(overrides: {
  id: string
  allowed?: boolean
  eligibleDates?: string[]
  locations?: string[]
  boost?: number
}): RankedCandidate {
  const features = deriveRecommendationFeatures({
    requiredFrequency: 6,
    completedFrequency: 3,
    daysSinceLastVisit: 27,
    cycleDaysRemaining: 21,
    cycleWorkingDays: 40,
    classWeight: 1,
    routeAffinity: 0.5,
  })
  const candidate = {
    id: overrides.id,
    customerId: `customer-${overrides.id}`,
    candidateLocationIds: overrides.locations ?? ['location-1'],
    eligibleDates: overrides.eligibleDates ?? ['2026-09-10', '2026-09-11', '2026-09-12'],
    features,
    constraints: [],
  }
  const [entry] = rankRecommendationCandidates([candidate])
  return {
    candidate,
    score: {
      ...entry!.score,
      score: entry!.score.score + (overrides.boost ?? 0),
    },
    allowed: overrides.allowed ?? true,
  }
}

describe('buildRecommendationBatch', () => {
  const input = {
    id: 'batch-1',
    userId: 'user-1',
    workspaceId: 'workspace-a',
    periodStart: '2026-09-10',
    periodEnd: '2026-09-24',
    createdAt: '2026-09-09T10:00:00.000Z',
  }

  it('keeps only allowed candidates and carries versions (§11)', () => {
    const batch = buildRecommendationBatch({
      ...input,
      ranked: [
        ranked({ id: 'a', boost: 5 }),
        ranked({ id: 'b', allowed: false }),
      ],
    })

    expect(batch.engineVersion).toBe(RECOMMENDATION_ENGINE_VERSION)
    expect(batch.policyVersion).toBe(RECOMMENDATION_POLICY_VERSION)
    expect(batch.suggestions.map((suggestion) => suggestion.customerId)).toEqual(['customer-a'])
    expect(batch.suggestions[0]?.status).toBe('suggested')
  })

  it('assigns dates deterministically from each candidate’s eligible list', () => {
    const batch = buildRecommendationBatch({
      ...input,
      ranked: [
        ranked({ id: 'a', boost: 10 }),
        ranked({ id: 'b', boost: 5 }),
        ranked({ id: 'c' }),
      ],
    })

    // Ranked by score: a, b, c → dates cycle 10th, 11th, 12th.
    expect(batch.suggestions.map((suggestion) => suggestion.suggestedDate)).toEqual([
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
    ])
  })

  it('produces an identical batch from identical inputs (§21)', () => {
    const rankedInput = [ranked({ id: 'a' }), ranked({ id: 'b', boost: 3 })]
    expect(buildRecommendationBatch({ ...input, ranked: rankedInput })).toEqual(
      buildRecommendationBatch({ ...input, ranked: rankedInput }),
    )
  })

  it('records the first candidate location as the suggested location', () => {
    const batch = buildRecommendationBatch({
      ...input,
      ranked: [ranked({ id: 'a', locations: ['location-2', 'location-3'] })],
    })
    expect(batch.suggestions[0]?.suggestedLocationId).toBe('location-2')
  })
})
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_RECOMMENDATION_WEIGHTS,
  normalizeRecommendationWeights,
  RECOMMENDATION_ENGINE_VERSION,
} from './recommendation-policy'
import { deriveRecommendationFeatures } from './recommendation-features'
import {
  maxRecommendationScore,
  scoreRecommendationCandidate,
} from './recommendation-scoring'

const inputs = {
  requiredFrequency: 6,
  completedFrequency: 3,
  daysSinceLastVisit: 27,
  cycleDaysRemaining: 21,
  cycleWorkingDays: 40,
  classWeight: 1,
  routeAffinity: 0.5,
}

describe('normalizeRecommendationWeights', () => {
  it('rejects negative weights and keeps defaults', () => {
    const weights = normalizeRecommendationWeights({ frequencyGap: -10 })
    expect(weights).toEqual(DEFAULT_RECOMMENDATION_WEIGHTS)
  })

  it('accepts valid overrides', () => {
    const weights = normalizeRecommendationWeights({ frequencyGap: 50 })
    expect(weights.frequencyGap).toBe(50)
    expect(weights.classPriority).toBe(DEFAULT_RECOMMENDATION_WEIGHTS.classPriority)
  })
})

describe('scoreRecommendationCandidate', () => {
  it('scores every meaningful factor with structured reasons', () => {
    const features = deriveRecommendationFeatures(inputs)
    const score = scoreRecommendationCandidate(features)

    expect(score.engineVersion).toBe(RECOMMENDATION_ENGINE_VERSION)
    const codes = score.reasons.map((reason) => reason.code)
    expect(codes).toEqual([
      'frequency_gap',
      'class_priority',
      'cycle_urgency',
      'days_since_last_visit',
      'route_affinity',
    ])

    const total = score.reasons.reduce((sum, reason) => sum + (reason.contribution ?? 0), 0)
    expect(score.score).toBeCloseTo(total, 6)
    expect(score.score).toBeLessThanOrEqual(maxRecommendationScore())
  })

  it('is deterministic for identical inputs (§21)', () => {
    const features = deriveRecommendationFeatures(inputs)
    expect(scoreRecommendationCandidate(features)).toEqual(
      scoreRecommendationCandidate(deriveRecommendationFeatures(inputs)),
    )
  })

  it('skips factors that carry no signal', () => {
    const features = deriveRecommendationFeatures({
      ...inputs,
      daysSinceLastVisit: null,
      routeAffinity: 0,
      completedFrequency: 6,
    })
    const score = scoreRecommendationCandidate(features)
    const codes = score.reasons.map((reason) => reason.code)
    expect(codes).toEqual(['class_priority', 'cycle_urgency'])
  })

  it('sums contributions reproducibly from reason metadata', () => {
    const features = deriveRecommendationFeatures(inputs)
    const score = scoreRecommendationCandidate(features)
    const gapReason = score.reasons.find((reason) => reason.code === 'frequency_gap')
    expect(gapReason?.value).toBe(3)
    expect(gapReason?.labelKey).toBe('recommendation.reason.frequency_gap')
    expect(gapReason?.contribution).toBeGreaterThan(0)
  })
})
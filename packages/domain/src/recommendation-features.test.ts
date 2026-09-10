import { describe, expect, it } from 'vitest'

import { deriveRecommendationFeatures } from './recommendation-features'

describe('deriveRecommendationFeatures', () => {
  it('derives gap and ratios from raw frequency inputs', () => {
    const features = deriveRecommendationFeatures({
      requiredFrequency: 6,
      completedFrequency: 3,
      daysSinceLastVisit: 27,
      cycleDaysRemaining: 21,
      cycleWorkingDays: 40,
      classWeight: 1,
    })
    expect(features.frequencyGap).toBe(3)
    expect(features.frequencyGapRatio).toBeCloseTo(0.5, 6)
    expect(features.classWeight).toBe(1)
  })

  it('computes cycle urgency from consumed working days', () => {
    const features = deriveRecommendationFeatures({
      requiredFrequency: 4,
      completedFrequency: 0,
      daysSinceLastVisit: null,
      cycleDaysRemaining: 10,
      cycleWorkingDays: 40,
      classWeight: 0.6,
    })
    expect(features.cycleUrgency).toBeCloseTo(0.75, 6)
  })

  it('clamps out-of-range inputs into explainable ranges', () => {
    const features = deriveRecommendationFeatures({
      requiredFrequency: 2,
      completedFrequency: 5,
      daysSinceLastVisit: null,
      cycleDaysRemaining: 90,
      cycleWorkingDays: 20,
      classWeight: 4,
      routeAffinity: -2,
    })
    expect(features.frequencyGap).toBe(0)
    expect(features.frequencyGapRatio).toBe(0)
    expect(features.cycleDaysRemaining).toBe(90)
    expect(features.cycleUrgency).toBe(0)
    expect(features.classWeight).toBe(1)
    expect(features.routeAffinity).toBe(0)
  })

  it('never visits have null recency and zero route affinity by default', () => {
    const features = deriveRecommendationFeatures({
      requiredFrequency: 4,
      completedFrequency: 0,
      daysSinceLastVisit: null,
      cycleDaysRemaining: 30,
      cycleWorkingDays: 40,
      classWeight: 0.3,
    })
    expect(features.daysSinceLastVisit).toBeNull()
    expect(features.routeAffinity).toBe(0)
  })
})
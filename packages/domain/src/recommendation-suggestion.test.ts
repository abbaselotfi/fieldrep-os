import { describe, expect, it } from 'vitest'

import {
  DEFAULT_RECOMMENDATION_WEIGHTS,
  normalizeRecommendationWeights,
} from './recommendation-policy'
import { derivePriorityBand } from './recommendation-suggestion'

describe('derivePriorityBand', () => {
  it('bands the default scale: very_high / high / medium / low', () => {
    const max =
      DEFAULT_RECOMMENDATION_WEIGHTS.frequencyGap +
      DEFAULT_RECOMMENDATION_WEIGHTS.classPriority +
      DEFAULT_RECOMMENDATION_WEIGHTS.cycleUrgency +
      DEFAULT_RECOMMENDATION_WEIGHTS.daysSinceVisit +
      DEFAULT_RECOMMENDATION_WEIGHTS.routeAffinity

    expect(derivePriorityBand(max)).toBe('very_high')
    expect(derivePriorityBand(max * 0.6)).toBe('high')
    expect(derivePriorityBand(max * 0.35)).toBe('medium')
    expect(derivePriorityBand(max * 0.1)).toBe('low')
    expect(derivePriorityBand(0)).toBe('low')
  })

  it('bands against overridden weights, not the defaults', () => {
    const weights = normalizeRecommendationWeights({ frequencyGap: 100 })
    // Max is now 170 (100+20+20+15+15); 100/170 ≈ 0.59 → high.
    expect(derivePriorityBand(100, weights)).toBe('high')
    expect(derivePriorityBand(60, weights)).toBe('medium')
  })

  it('clamps out-of-range scores', () => {
    expect(derivePriorityBand(-50)).toBe('low')
    expect(derivePriorityBand(9_999)).toBe('very_high')
  })
})
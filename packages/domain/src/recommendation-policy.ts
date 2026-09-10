/**
 * Versioned scoring coefficients (AI-PLANNER-SPEC §8/§20).
 *
 * Exact coefficients are versioned and testable — never buried inside
 * free-form prompts. Bump `RECOMMENDATION_ENGINE_VERSION` whenever the
 * defaults change so historic suggestions keep their audit identity.
 */
export const RECOMMENDATION_ENGINE_VERSION = 'fieldrep-rec-1.0.0'

/** Policy identity for the current default weight set (§11/§20). */
export const RECOMMENDATION_POLICY_VERSION = 'fieldrep-rec-weights-1'

export interface RecommendationWeights {
  frequencyGap: number
  classPriority: number
  cycleUrgency: number
  daysSinceVisit: number
  routeAffinity: number
}

export const DEFAULT_RECOMMENDATION_WEIGHTS: RecommendationWeights = {
  frequencyGap: 30,
  classPriority: 20,
  cycleUrgency: 20,
  daysSinceVisit: 15,
  routeAffinity: 15,
}

const POSITIVE_FACTORS: readonly (keyof RecommendationWeights)[] = [
  'frequencyGap',
  'classPriority',
  'cycleUrgency',
  'daysSinceVisit',
  'routeAffinity',
]

export function normalizeRecommendationWeights(
  weights: Partial<RecommendationWeights> | undefined,
): RecommendationWeights {
  const fallback = DEFAULT_RECOMMENDATION_WEIGHTS
  if (weights === undefined) return { ...fallback }

  const resolved = { ...fallback }
  for (const key of POSITIVE_FACTORS) {
    const value = weights[key]
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      resolved[key] = value
    }
  }
  return resolved
}

export function totalWeight(weights: RecommendationWeights): number {
  return POSITIVE_FACTORS.reduce((sum, key) => sum + weights[key], 0)
}
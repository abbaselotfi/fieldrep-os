import type { RecommendationFeatures } from './recommendation-features'
import {
  normalizeRecommendationWeights,
  RECOMMENDATION_ENGINE_VERSION,
  totalWeight,
  type RecommendationWeights,
} from './recommendation-policy'

/** Machine-readable reason (AI-PLANNER-SPEC §9). */
export interface SuggestionReason {
  code:
    | 'frequency_gap'
    | 'class_priority'
    | 'cycle_urgency'
    | 'days_since_last_visit'
    | 'route_affinity'
  labelKey: string
  value?: number
  contribution?: number
  metadata?: Record<string, unknown>
}

export interface RecommendationScore {
  /** 0..totalWeight — explainable additive score, never provider-computed. */
  score: number
  reasons: SuggestionReason[]
  engineVersion: string
}

const DAYS_SINCE_VISIT_HORIZON = 30

function reason(
  code: SuggestionReason['code'],
  labelKey: string,
  value: number,
  contribution: number,
): SuggestionReason {
  return { code, labelKey, value, contribution }
}

/**
 * Deterministic additive scoring (AI-PLANNER-SPEC §8). Each factor's
 * contribution is weight × normalized feature, and every applied factor
 * emits a structured reason so the explanation is reproducible (§10/§21).
 */
export function scoreRecommendationCandidate(
  features: RecommendationFeatures,
  weights?: Partial<RecommendationWeights>,
): RecommendationScore {
  const w = normalizeRecommendationWeights(weights)
  const reasons: SuggestionReason[] = []

  if (features.frequencyGap > 0) {
    reasons.push(
      reason(
        'frequency_gap',
        'recommendation.reason.frequency_gap',
        features.frequencyGap,
        w.frequencyGap * features.frequencyGapRatio,
      ),
    )
  }

  if (features.classWeight > 0) {
    reasons.push(
      reason(
        'class_priority',
        'recommendation.reason.class_priority',
        features.classWeight,
        w.classPriority * features.classWeight,
      ),
    )
  }

  if (features.cycleUrgency > 0) {
    reasons.push(
      reason(
        'cycle_urgency',
        'recommendation.reason.cycle_urgency',
        features.cycleDaysRemaining,
        w.cycleUrgency * features.cycleUrgency,
      ),
    )
  }

  if (features.daysSinceLastVisit !== null && features.daysSinceLastVisit > 0) {
    const recencyFactor = Math.min(1, features.daysSinceLastVisit / DAYS_SINCE_VISIT_HORIZON)
    reasons.push(
      reason(
        'days_since_last_visit',
        'recommendation.reason.days_since_last_visit',
        features.daysSinceLastVisit,
        w.daysSinceVisit * recencyFactor,
      ),
    )
  }

  if (features.routeAffinity > 0) {
    reasons.push(
      reason(
        'route_affinity',
        'recommendation.reason.route_affinity',
        features.routeAffinity,
        w.routeAffinity * features.routeAffinity,
      ),
    )
  }

  const score = reasons.reduce((sum, item) => sum + (item.contribution ?? 0), 0)
  return { score, reasons, engineVersion: RECOMMENDATION_ENGINE_VERSION }
}

export function maxRecommendationScore(weights?: Partial<RecommendationWeights>): number {
  return totalWeight(normalizeRecommendationWeights(weights))
}
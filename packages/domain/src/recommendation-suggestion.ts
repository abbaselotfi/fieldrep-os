import type { SuggestionReason } from './recommendation-scoring'
import { maxRecommendationScore } from './recommendation-scoring'
import type { RecommendationWeights } from './recommendation-policy'

/** Visit suggestion (AI-PLANNER-SPEC §12). */
export type SuggestionStatus =
  | 'suggested'
  | 'accepted'
  | 'rejected'
  | 'edited'
  | 'converted_to_plan'
  | 'expired'

export type PriorityBand = 'very_high' | 'high' | 'medium' | 'low'

export interface VisitSuggestion {
  id: string
  customerId: string
  suggestedDate: string
  suggestedLocationId?: string
  score: number
  priorityBand: PriorityBand
  reasons: SuggestionReason[]
  status: SuggestionStatus
}

/**
 * Priority bands are application-owned (spec leaves thresholds open):
 * share of the maximum explainable score decides the band, so bands stay
 * meaningful even when workspace weight overrides change the scale.
 */
export function derivePriorityBand(
  score: number,
  weights?: Partial<RecommendationWeights>,
): PriorityBand {
  const effectiveMax = maxRecommendationScore(weights)
  const ratio = effectiveMax > 0 ? Math.min(1, Math.max(0, score / effectiveMax)) : 0

  if (ratio >= 0.75) return 'very_high'
  if (ratio >= 0.5) return 'high'
  if (ratio >= 0.3) return 'medium'
  return 'low'
}
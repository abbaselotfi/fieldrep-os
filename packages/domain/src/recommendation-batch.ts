import type { RecommendationCandidate } from './recommendation-candidate'
import type { RecommendationWeights } from './recommendation-policy'
import { RECOMMENDATION_POLICY_VERSION } from './recommendation-policy'
import type { RecommendationScore } from './recommendation-scoring'
import { derivePriorityBand, type VisitSuggestion } from './recommendation-suggestion'

/** Recommendation batch envelope (AI-PLANNER-SPEC §11). */
export interface RecommendationBatch {
  id: string
  userId: string
  workspaceId: string
  periodStart: string
  periodEnd: string
  engineVersion: string
  policyVersion: string
  createdAt: string
  suggestions: VisitSuggestion[]
}

export interface RankedCandidate {
  candidate: RecommendationCandidate
  score: RecommendationScore
  allowed: boolean
}

export interface BuildRecommendationBatchInput {
  id: string
  userId: string
  workspaceId: string
  periodStart: string
  periodEnd: string
  createdAt: string
  ranked: RankedCandidate[]
  weights?: Partial<RecommendationWeights>
}

/**
 * Builds the suggestion batch from deterministic ranking output (§11).
 * Only allowed candidates become suggestions — hard-constraint failures are
 * never presented, regardless of score (§5). Date/location assignment walks
 * the ranked order and each candidate's own eligible lists, so the batch is
 * reproducible from identical inputs (§21).
 */
export function buildRecommendationBatch(
  input: BuildRecommendationBatchInput,
): RecommendationBatch {
  const suggestions = input.ranked
    .filter((entry) => entry.allowed)
    .map((entry, index) => buildSuggestion(entry, index, input.weights))

  return {
    id: input.id,
    userId: input.userId,
    workspaceId: input.workspaceId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    engineVersion: input.ranked[0]?.score.engineVersion ?? '',
    policyVersion: RECOMMENDATION_POLICY_VERSION,
    createdAt: input.createdAt,
    suggestions,
  }
}

function buildSuggestion(
  entry: RankedCandidate,
  index: number,
  weights: Partial<RecommendationWeights> | undefined,
): VisitSuggestion {
  const { candidate, score } = entry
  const eligibleDates = candidate.eligibleDates
  const suggestedDate =
    eligibleDates.length > 0 ? eligibleDates[index % eligibleDates.length]! : ''

  const suggestion: VisitSuggestion = {
    id: `suggestion-${candidate.id}`,
    customerId: candidate.customerId,
    suggestedDate,
    score: score.score,
    priorityBand: derivePriorityBand(score.score, weights),
    reasons: score.reasons,
    status: 'suggested',
  }
  const locationId = candidate.candidateLocationIds[0]
  if (locationId !== undefined) suggestion.suggestedLocationId = locationId
  return suggestion
}
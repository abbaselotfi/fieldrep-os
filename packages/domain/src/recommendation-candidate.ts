import type { RecommendationFeatures } from './recommendation-features'
import type { RecommendationWeights } from './recommendation-policy'
import { scoreRecommendationCandidate, type RecommendationScore } from './recommendation-scoring'

/**
 * Candidate contract (AI-PLANNER-SPEC §5/§6). Hard constraints decide
 * whether a candidate is allowed at all; soft scores only rank allowed
 * candidates. A high score can never bypass a blocking constraint (§5).
 */
export interface RecommendationConstraint {
  code: string
  blocks: boolean
  labelKey?: string
}

export interface RecommendationCandidate {
  id: string
  customerId: string
  candidateLocationIds: string[]
  eligibleDates: string[]
  features: RecommendationFeatures
  constraints: RecommendationConstraint[]
}

export function candidateIsAllowed(candidate: RecommendationCandidate): boolean {
  return !candidate.constraints.some((constraint) => constraint.blocks)
}

/**
 * Deterministic ranking (AI-PLANNER-SPEC §21): allowed candidates first,
 * score descending, ties broken by stable id ordering — same input always
 * yields the same order.
 */
export function rankRecommendationCandidates(
  candidates: RecommendationCandidate[],
  weights?: Partial<import('./recommendation-policy').RecommendationWeights>,
): Array<{ candidate: RecommendationCandidate; score: RecommendationScore; allowed: boolean }> {
  return candidates
    .map((candidate) => ({
      candidate,
      score: scoreRecommendationCandidate(candidate.features, weights),
      allowed: candidateIsAllowed(candidate),
    }))
    .sort((a, b) => {
      if (a.allowed !== b.allowed) return a.allowed ? -1 : 1
      if (b.score.score !== a.score.score) return b.score.score - a.score.score
      return a.candidate.id < b.candidate.id ? -1 : a.candidate.id > b.candidate.id ? 1 : 0
    })
}
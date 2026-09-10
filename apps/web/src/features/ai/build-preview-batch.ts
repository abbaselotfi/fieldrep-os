import {
  buildRecommendationBatch,
  deriveRecommendationFeatures,
  rankRecommendationCandidates,
  type RecommendationBatch,
  type RecommendationCandidate,
} from '@fieldrep/domain'

import { demoCustomers } from '../../data/demo-field-workspace'
import { previewPlannerDays } from '../planner/preview-plan'

/**
 * Preview batch builder (P7-A3): feeds the real deterministic engine with
 * demo-workspace inputs so the AI page shows genuine scoring, reasons and
 * priority bands — no fabricated scores.
 */
const CLASS_WEIGHTS = { A: 1, B: 0.6, C: 0.3 } as const

/** Preview cycle context: 8 working days remain out of 20. */
const CYCLE_DAYS_REMAINING = 8
const CYCLE_WORKING_DAYS = 20

/** Deterministic recency simulation: stable per customer array position. */
const BASE_DAYS_SINCE_VISIT = 12
const DAYS_SINCE_VISIT_STEP = 7

export function buildPreviewBatch(createdAt = '2026-09-09T10:00:00.000Z'): RecommendationBatch {
  const eligibleDates = previewPlannerDays.map((day) => day.planDate)

  const candidates: RecommendationCandidate[] = demoCustomers.map((customer, index) => ({
    id: `candidate-${customer.id}`,
    customerId: customer.id,
    candidateLocationIds: customer.locations.map((_, locationIndex) => `location-${locationIndex + 1}`),
    eligibleDates,
    features: deriveRecommendationFeatures({
      requiredFrequency: customer.frequencyTarget,
      completedFrequency: customer.frequencyCompleted,
      daysSinceLastVisit: BASE_DAYS_SINCE_VISIT + index * DAYS_SINCE_VISIT_STEP,
      cycleDaysRemaining: CYCLE_DAYS_REMAINING,
      cycleWorkingDays: CYCLE_WORKING_DAYS,
      classWeight: CLASS_WEIGHTS[customer.className],
      routeAffinity: 0.4,
    }),
    constraints: [],
  }))

  return buildRecommendationBatch({
    id: 'batch-preview',
    userId: 'preview-user',
    workspaceId: 'preview-workspace',
    periodStart: eligibleDates[0] ?? '2026-09-06',
    periodEnd: eligibleDates[eligibleDates.length - 1] ?? '2026-09-10',
    createdAt,
    ranked: rankRecommendationCandidates(candidates),
  })
}
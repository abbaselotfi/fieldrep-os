/**
 * Recommendation feature derivation (AI-PLANNER-SPEC §4/§7).
 *
 * Feature names and normalization are owned by the engine, never the UI.
 * All derived values stay in explainable ranges so each factor's
 * contribution can be replayed in audits (§21 deterministic testability).
 */
export interface RecommendationFeatureInputs {
  requiredFrequency: number
  completedFrequency: number
  /** Days since the last completed visit; null when never visited. */
  daysSinceLastVisit: number | null
  cycleDaysRemaining: number
  /** Total working days available in the planning cycle. */
  cycleWorkingDays: number
  /** Customer class priority normalized to 0..1 (A=1, B≈0.6, C≈0.3 …). */
  classWeight: number
  routeAffinity?: number
}

export interface RecommendationFeatures {
  requiredFrequency: number
  completedFrequency: number
  frequencyGap: number
  /** 0..1 — share of the required frequency still outstanding. */
  frequencyGapRatio: number
  daysSinceLastVisit: number | null
  cycleDaysRemaining: number
  /** 0..1 — time pressure: grows as the cycle's working days are consumed. */
  cycleUrgency: number
  classWeight: number
  routeAffinity: number
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export function deriveRecommendationFeatures(
  input: RecommendationFeatureInputs,
): RecommendationFeatures {
  const required = Math.max(0, input.requiredFrequency)
  const completed = Math.max(0, input.completedFrequency)
  const frequencyGap = Math.max(0, required - completed)
  const cycleWorkingDays = Math.max(1, input.cycleWorkingDays)
  const cycleDaysRemaining = Math.max(0, input.cycleDaysRemaining)

  return {
    requiredFrequency: required,
    completedFrequency: completed,
    frequencyGap,
    frequencyGapRatio: required === 0 ? 0 : clamp01(frequencyGap / required),
    daysSinceLastVisit: input.daysSinceLastVisit,
    cycleDaysRemaining,
    cycleUrgency: clamp01(1 - cycleDaysRemaining / cycleWorkingDays),
    classWeight: clamp01(input.classWeight),
    routeAffinity: clamp01(input.routeAffinity ?? 0),
  }
}
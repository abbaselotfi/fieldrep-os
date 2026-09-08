/**
 * Visit verification policy thresholds (MAPS-LOCATION-SPEC §23-24).
 *
 * The spec deliberately leaves the numbers to the application; these defaults
 * favour explainability: a fix inside the verified radius with acceptable
 * GPS accuracy is `verified`, further fixes degrade to `nearby` then
 * `outside`. Workspaces may override thresholds via policy overrides.
 */
export interface VisitVerificationPolicy {
  /** Distance (meters) within which a fix counts as `verified`. */
  verifiedRadiusMeters: number
  /** Distance (meters) within which a fix still counts as `nearby`. */
  nearbyRadiusMeters: number
  /** Fixes with GPS accuracy (meters) worse than this are `unverified`. */
  maxAccuracyMeters: number
}

export const DEFAULT_VISIT_VERIFICATION_POLICY: VisitVerificationPolicy = {
  verifiedRadiusMeters: 150,
  nearbyRadiusMeters: 500,
  maxAccuracyMeters: 100,
}

export function normalizeVisitVerificationPolicy(
  policy: Partial<VisitVerificationPolicy> | undefined,
): VisitVerificationPolicy {
  const fallback = DEFAULT_VISIT_VERIFICATION_POLICY
  if (policy === undefined) return { ...fallback }

  const verifiedRadiusMeters = positive(policy.verifiedRadiusMeters, fallback.verifiedRadiusMeters)
  const nearbyRadiusMeters = positive(policy.nearbyRadiusMeters, fallback.nearbyRadiusMeters)
  return {
    verifiedRadiusMeters,
    // `nearby` must never be stricter than `verified`.
    nearbyRadiusMeters: Math.max(nearbyRadiusMeters, verifiedRadiusMeters),
    maxAccuracyMeters: positive(policy.maxAccuracyMeters, fallback.maxAccuracyMeters),
  }
}

function positive(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback
}
import type { LocationCaptureMode } from './location-evidence'
import { distanceMetersBetween, type GeoPoint } from './geo-distance'
import {
  normalizeVisitVerificationPolicy,
  type VisitVerificationPolicy,
} from './visit-verification-policy'

/**
 * Visit verification result (MAPS-LOCATION-SPEC §24).
 * `reasons` carries stable machine-readable codes so supervisors and audits
 * can replay exactly why a status was decided.
 */
export type VisitVerificationStatus = 'verified' | 'nearby' | 'unverified' | 'outside'

export type VisitVerificationReason =
  | 'within_verified_radius'
  | 'within_nearby_radius'
  | 'beyond_nearby_radius'
  | 'accuracy_exceeds_limit'
  | 'target_location_missing'
  | 'offline_capture'

export interface VisitVerificationResult {
  status: VisitVerificationStatus
  distanceMeters: number | null
  accuracyMeters: number | null
  policyRadiusMeters: number
  reasons: VisitVerificationReason[]
}

export interface EvaluateVisitVerificationInput {
  /** Target customer location point; null when the target has no fix. */
  targetPoint: GeoPoint | null
  capturedPoint: GeoPoint
  accuracyMeters: number | null
  captureMode: LocationCaptureMode
  policy?: Partial<VisitVerificationPolicy>
}

export function evaluateVisitVerification(
  input: EvaluateVisitVerificationInput,
): VisitVerificationResult {
  const policy = normalizeVisitVerificationPolicy(input.policy)
  const reasons: VisitVerificationReason[] = []
  const accuracyMeters = input.accuracyMeters

  if (input.captureMode === 'offline') reasons.push('offline_capture')

  if (input.targetPoint === null) {
    reasons.push('target_location_missing')
    return {
      status: 'unverified',
      distanceMeters: null,
      accuracyMeters,
      policyRadiusMeters: policy.verifiedRadiusMeters,
      reasons,
    }
  }

  const distanceMeters = distanceMetersBetween(input.targetPoint, input.capturedPoint)

  if (accuracyMeters !== null && accuracyMeters > policy.maxAccuracyMeters) {
    reasons.push('accuracy_exceeds_limit')
    return {
      status: 'unverified',
      distanceMeters,
      accuracyMeters,
      policyRadiusMeters: policy.verifiedRadiusMeters,
      reasons,
    }
  }

  if (distanceMeters <= policy.verifiedRadiusMeters) {
    reasons.push('within_verified_radius')
    return {
      status: 'verified',
      distanceMeters,
      accuracyMeters,
      policyRadiusMeters: policy.verifiedRadiusMeters,
      reasons,
    }
  }

  if (distanceMeters <= policy.nearbyRadiusMeters) {
    reasons.push('within_nearby_radius')
    return {
      status: 'nearby',
      distanceMeters,
      accuracyMeters,
      policyRadiusMeters: policy.nearbyRadiusMeters,
      reasons,
    }
  }

  reasons.push('beyond_nearby_radius')
  return {
    status: 'outside',
    distanceMeters,
    accuracyMeters,
    policyRadiusMeters: policy.nearbyRadiusMeters,
    reasons,
  }
}
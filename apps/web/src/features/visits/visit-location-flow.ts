import type {
  GeoPoint,
  LocationCaptureMode,
  VisitVerificationPolicy,
  VisitVerificationResult,
} from '@fieldrep/domain'
import { evaluateVisitVerification } from '@fieldrep/domain'

import {
  captureLocationEvidence,
  type CaptureLocationOptions,
  type GeoPositionFix,
} from './capture-location'

/**
 * One-shot check-in flow (P6-A3): capture the device fix, derive the capture
 * mode, and evaluate the application-owned geofence policy against the
 * visit's target customer location.
 */
export interface VisitLocationCheckResult {
  fix: GeoPositionFix
  captureMode: LocationCaptureMode
  verification: VisitVerificationResult
}

export interface RunVisitLocationCheckInput {
  online: boolean
  /** Target customer-location point; null when the target has no fix. */
  targetPoint: GeoPoint | null
  policy?: Partial<VisitVerificationPolicy>
  now?: () => number
  capture?: (options: CaptureLocationOptions) => Promise<GeoPositionFix>
}

export async function runVisitLocationCheck(
  input: RunVisitLocationCheckInput,
): Promise<VisitLocationCheckResult> {
  const capture = input.capture ?? captureLocationEvidence
  const fix = await capture({
    online: input.online,
    ...(input.now === undefined ? {} : { now: input.now }),
  })
  const captureMode = deriveFlowCaptureMode(input.online, fix)
  const verification = evaluateVisitVerification({
    targetPoint: input.targetPoint,
    capturedPoint: { latitude: fix.latitude, longitude: fix.longitude },
    accuracyMeters: fix.accuracyMeters,
    captureMode,
    ...(input.policy === undefined ? {} : { policy: input.policy }),
  })
  return { fix, captureMode, verification }
}

function deriveFlowCaptureMode(online: boolean, fix: GeoPositionFix): LocationCaptureMode {
  return online
    ? (fix.accuracyMeters ?? 0) <= 50
      ? 'gps'
      : 'network'
    : 'offline'
}
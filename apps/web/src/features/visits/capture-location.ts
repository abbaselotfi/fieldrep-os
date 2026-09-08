import { deriveLocationCaptureMode } from '@fieldrep/domain'

/**
 * Device GPS capture for visit location evidence (P5-A1).
 *
 * Wraps the browser Geolocation API behind a testable contract and derives
 * the domain capture mode (gps / network / offline) from connectivity and
 * reported accuracy, mirroring OCE/Sanofi evidence semantics.
 */
export interface GeoPositionFix {
  latitude: number
  longitude: number
  accuracyMeters: number | null
  altitudeMeters: number | null
  capturedAt: number
}

export type GeoCaptureErrorCode =
  | 'geolocation_unsupported'
  | 'permission_denied'
  | 'position_unavailable'
  | 'timeout'

export class GeoCaptureError extends Error {
  constructor(
    readonly code: GeoCaptureErrorCode,
  ) {
    super(`geo_capture_failed:${code}`)
    this.name = 'GeoCaptureError'
  }
}

export interface CaptureLocationOptions {
  online: boolean
  /** Max wait for a fix, in milliseconds (default 15s). */
  timeoutMs?: number
  /** Accept a cached fix up to this age, in milliseconds (default 30s). */
  maximumAgeMs?: number
  now?: () => number
}

export type MinimalGeolocation = {
  getCurrentPosition(
    success: (position: {
      coords: {
        latitude: number
        longitude: number
        accuracy: number | null
        altitude: number | null
      }
    }) => void,
    failure: (error: { code: number }) => void,
    options: { timeout: number; maximumAge: number; enableHighAccuracy: boolean },
  ): void
}

export function resolveGeolocation(): MinimalGeolocation | null {
  const candidate = (globalThis as { navigator?: { geolocation?: MinimalGeolocation } }).navigator
  return candidate?.geolocation ?? null
}

export async function captureLocationEvidence(
  options: CaptureLocationOptions,
): Promise<GeoPositionFix> {
  const geolocation = resolveGeolocation()
  if (geolocation === null) throw new GeoCaptureError('geolocation_unsupported')

  const now = options.now ?? Date.now
  const timeoutMs = options.timeoutMs ?? 15_000
  const maximumAgeMs = options.maximumAgeMs ?? 30_000

  return new Promise<GeoPositionFix>((resolve, reject) => {
    geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
          altitudeMeters: position.coords.altitude,
          capturedAt: now(),
        })
      },
      (failure) => {
        // 1 = permission denied, 2 = position unavailable, 3 = timeout.
        const code: GeoCaptureErrorCode =
          failure.code === 1
            ? 'permission_denied'
            : failure.code === 3
              ? 'timeout'
              : 'position_unavailable'
        reject(new GeoCaptureError(code))
      },
      { timeout: timeoutMs, maximumAge: maximumAgeMs, enableHighAccuracy: true },
    )
  })
}

export function captureModeForFix(online: boolean, fix: GeoPositionFix) {
  return deriveLocationCaptureMode({
    online,
    accuracyMeters: fix.accuracyMeters,
  })
}
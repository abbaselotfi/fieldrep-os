import { afterEach, describe, expect, it } from 'vitest'

import {
  GeoCaptureError,
  captureLocationEvidence,
  captureModeForFix,
  resolveGeolocation,
  type MinimalGeolocation,
} from './capture-location'

function installFakeGeolocation(implementation: MinimalGeolocation['getCurrentPosition']) {
  const fake: MinimalGeolocation = { getCurrentPosition: implementation }
  ;(globalThis as { navigator: { geolocation?: MinimalGeolocation } }).navigator.geolocation = fake
  return () => {
    delete (globalThis as { navigator: { geolocation?: MinimalGeolocation } }).navigator.geolocation
  }
}

describe('captureLocationEvidence', () => {
  const cleanups: Array<() => void> = []
  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.()
  })

  it('maps a successful fix onto the domain shape', async () => {
    cleanups.push(
      installFakeGeolocation((success) => {
        success({
          coords: { latitude: 35.6892, longitude: 51.389, accuracy: 8, altitude: 1190 },
        })
      }),
    )

    const fix = await captureLocationEvidence({ online: true, now: () => 1_788_000_000_000 })
    expect(fix).toEqual({
      latitude: 35.6892,
      longitude: 51.389,
      accuracyMeters: 8,
      altitudeMeters: 1190,
      capturedAt: 1_788_000_000_000,
    })
  })

  it('maps permission denial to a stable error code', async () => {
    cleanups.push(
      installFakeGeolocation((_success, failure) => {
        failure({ code: 1 })
      }),
    )

    await expect(captureLocationEvidence({ online: true })).rejects.toThrow(
      'geo_capture_failed:permission_denied',
    )
    await expect(captureLocationEvidence({ online: true })).rejects.toBeInstanceOf(GeoCaptureError)
  })

  it('maps timeout to a stable error code', async () => {
    cleanups.push(
      installFakeGeolocation((_success, failure) => {
        failure({ code: 3 })
      }),
    )

    await expect(captureLocationEvidence({ online: true })).rejects.toThrow(
      'geo_capture_failed:timeout',
    )
  })

  it('throws geolocation_unsupported when the API is missing', async () => {
    delete (globalThis as { navigator?: { geolocation?: MinimalGeolocation } }).navigator?.geolocation
    expect(resolveGeolocation()).toBeNull()
    await expect(captureLocationEvidence({ online: true })).rejects.toThrow(
      'geo_capture_failed:geolocation_unsupported',
    )
  })

  it('derives offline capture mode from connectivity', () => {
    const fix = {
      latitude: 35.6892,
      longitude: 51.389,
      accuracyMeters: 5,
      altitudeMeters: null,
      capturedAt: 1,
    }
    expect(captureModeForFix(false, fix)).toBe('offline')
    expect(captureModeForFix(true, fix)).toBe('gps')
    expect(
      captureModeForFix(true, { ...fix, accuracyMeters: 900 }),
    ).toBe('network')
  })
})
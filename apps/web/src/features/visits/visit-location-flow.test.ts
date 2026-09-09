import { describe, expect, it } from 'vitest'

import { runVisitLocationCheck, type VisitLocationCheckResult } from './visit-location-flow'
import type { GeoPositionFix } from './capture-location'

const target = { latitude: 35.6892, longitude: 51.389 }

function fakeCapture(fixOverrides: Partial<GeoPositionFix> = {}) {
  const fix: GeoPositionFix = {
    latitude: 35.6893,
    longitude: 51.3891,
    accuracyMeters: 8,
    altitudeMeters: 1200,
    capturedAt: 1_788_000_000_000,
    ...fixOverrides,
  }
  return async () => fix
}

describe('runVisitLocationCheck', () => {
  it('verifies an online accurate fix near the target', async () => {
    const result: VisitLocationCheckResult = await runVisitLocationCheck({
      online: true,
      targetPoint: target,
      capture: fakeCapture(),
    })
    expect(result.captureMode).toBe('gps')
    expect(result.verification.status).toBe('verified')
    expect(result.verification.reasons).toContain('within_verified_radius')
  })

  it('classifies coarse online fixes as network capture', async () => {
    const result = await runVisitLocationCheck({
      online: true,
      targetPoint: target,
      capture: fakeCapture({ accuracyMeters: 900 }),
    })
    expect(result.captureMode).toBe('network')
    expect(result.verification.status).toBe('unverified')
    expect(result.verification.reasons).toContain('accuracy_exceeds_limit')
  })

  it('marks offline fixes and still verifies the distance decision', async () => {
    const result = await runVisitLocationCheck({
      online: false,
      targetPoint: target,
      capture: fakeCapture(),
    })
    expect(result.captureMode).toBe('offline')
    expect(result.verification.status).toBe('verified')
    expect(result.verification.reasons).toContain('offline_capture')
  })

  it('reports missing target locations honestly', async () => {
    const result = await runVisitLocationCheck({
      online: true,
      targetPoint: null,
      capture: fakeCapture(),
    })
    expect(result.verification.status).toBe('unverified')
    expect(result.verification.reasons).toContain('target_location_missing')
  })

  it('honours policy overrides through to the verification result', async () => {
    const result = await runVisitLocationCheck({
      online: true,
      targetPoint: target,
      policy: { verifiedRadiusMeters: 1, nearbyRadiusMeters: 2 },
      capture: fakeCapture(),
    })
    expect(result.verification.status).toBe('outside')
  })
})
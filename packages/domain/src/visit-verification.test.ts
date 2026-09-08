import { describe, expect, it } from 'vitest'

import { evaluateVisitVerification } from './visit-verification'
import { DEFAULT_VISIT_VERIFICATION_POLICY } from './visit-verification-policy'

const target = { latitude: 35.6892, longitude: 51.389 }

describe('evaluateVisitVerification', () => {
  it('verifies a fix inside the verified radius with good accuracy', () => {
    const result = evaluateVisitVerification({
      targetPoint: target,
      capturedPoint: { latitude: 35.6899, longitude: 51.3898 },
      accuracyMeters: 10,
      captureMode: 'gps',
    })
    expect(result.status).toBe('verified')
    expect(result.reasons).toEqual(['within_verified_radius'])
    expect(result.distanceMeters).toBeLessThan(DEFAULT_VISIT_VERIFICATION_POLICY.verifiedRadiusMeters)
    expect(result.policyRadiusMeters).toBe(DEFAULT_VISIT_VERIFICATION_POLICY.verifiedRadiusMeters)
  })

  it('marks fixes beyond verified but within nearby radius as nearby', () => {
    const result = evaluateVisitVerification({
      targetPoint: target,
      capturedPoint: { latitude: 35.6905, longitude: 51.3905 },
      accuracyMeters: 10,
      captureMode: 'gps',
      policy: { verifiedRadiusMeters: 50, nearbyRadiusMeters: 1000 },
    })
    expect(result.status).toBe('nearby')
    expect(result.reasons).toEqual(['within_nearby_radius'])
    expect(result.policyRadiusMeters).toBe(1000)
  })

  it('marks far fixes as outside', () => {
    const result = evaluateVisitVerification({
      targetPoint: target,
      capturedPoint: { latitude: 35.75, longitude: 51.45 },
      accuracyMeters: 10,
      captureMode: 'gps',
    })
    expect(result.status).toBe('outside')
    expect(result.reasons).toEqual(['beyond_nearby_radius'])
  })

  it('degrades to unverified when GPS accuracy exceeds the policy limit', () => {
    const result = evaluateVisitVerification({
      targetPoint: target,
      capturedPoint: target,
      accuracyMeters: 5_000,
      captureMode: 'network',
    })
    expect(result.status).toBe('unverified')
    expect(result.reasons).toEqual(['accuracy_exceeds_limit'])
  })

  it('reports unverified with a reason when the target has no location fix', () => {
    const result = evaluateVisitVerification({
      targetPoint: null,
      capturedPoint: target,
      accuracyMeters: 10,
      captureMode: 'gps',
    })
    expect(result.status).toBe('unverified')
    expect(result.reasons).toEqual(['target_location_missing'])
    expect(result.distanceMeters).toBeNull()
  })

  it('flags offline captures alongside the distance decision', () => {
    const result = evaluateVisitVerification({
      targetPoint: target,
      capturedPoint: { latitude: 35.6893, longitude: 51.3891 },
      accuracyMeters: 10,
      captureMode: 'offline',
    })
    expect(result.status).toBe('verified')
    expect(result.reasons).toContain('offline_capture')
    expect(result.reasons).toContain('within_verified_radius')
  })

  it('honours custom accuracy limits', () => {
    const result = evaluateVisitVerification({
      targetPoint: target,
      capturedPoint: target,
      accuracyMeters: 60,
      captureMode: 'gps',
      policy: { maxAccuracyMeters: 50 },
    })
    expect(result.status).toBe('unverified')
  })
})
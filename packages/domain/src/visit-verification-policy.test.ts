import { describe, expect, it } from 'vitest'

import {
  DEFAULT_VISIT_VERIFICATION_POLICY,
  normalizeVisitVerificationPolicy,
} from './visit-verification-policy'

describe('normalizeVisitVerificationPolicy', () => {
  it('returns the defaults untouched', () => {
    expect(normalizeVisitVerificationPolicy(undefined)).toEqual(
      DEFAULT_VISIT_VERIFICATION_POLICY,
    )
  })

  it('accepts valid overrides', () => {
    expect(
      normalizeVisitVerificationPolicy({
        verifiedRadiusMeters: 200,
        nearbyRadiusMeters: 900,
        maxAccuracyMeters: 50,
      }),
    ).toEqual({ verifiedRadiusMeters: 200, nearbyRadiusMeters: 900, maxAccuracyMeters: 50 })
  })

  it('falls back for invalid values', () => {
    expect(
      normalizeVisitVerificationPolicy({
        verifiedRadiusMeters: -5,
        nearbyRadiusMeters: Number.NaN,
        maxAccuracyMeters: 0,
      }),
    ).toEqual(DEFAULT_VISIT_VERIFICATION_POLICY)
  })

  it('never lets nearby be stricter than verified', () => {
    const policy = normalizeVisitVerificationPolicy({
      verifiedRadiusMeters: 800,
      nearbyRadiusMeters: 300,
    })
    expect(policy.nearbyRadiusMeters).toBeGreaterThanOrEqual(policy.verifiedRadiusMeters)
  })
})
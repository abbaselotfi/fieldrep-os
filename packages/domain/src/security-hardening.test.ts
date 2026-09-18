import { describe, expect, it } from 'vitest'

import {
  DEFAULT_CONTENT_SECURITY_POLICY,
  DEFAULT_MFA_POLICY,
  DEFAULT_RATE_LIMIT_POLICY,
  EMPTY_ABUSE_SNAPSHOT,
  buildSecurityHeaders,
  classifyAbuseRisk,
  classifyAbuseTransition,
  evaluatePrivilegedMfa,
  evaluateRateLimit,
  inspectRateLimit,
  normalizeAbusePolicy,
  normalizeMfaPolicy,
  normalizeRateLimitPolicy,
  rateLimitPolicyFor,
  recordAbuseSignal,
  requiresPrivilegedMfa,
} from './security-hardening'

describe('normalizeRateLimitPolicy', () => {
  it('falls back to the strict baseline for absent or incoherent values', () => {
    expect(normalizeRateLimitPolicy(undefined)).toEqual(DEFAULT_RATE_LIMIT_POLICY)
    expect(normalizeRateLimitPolicy({ windowMs: 500 })).toEqual(DEFAULT_RATE_LIMIT_POLICY)
    expect(normalizeRateLimitPolicy({ maxRequests: 0 })).toEqual(DEFAULT_RATE_LIMIT_POLICY)
    expect(normalizeRateLimitPolicy({ maxRequests: Number.NaN })).toEqual(DEFAULT_RATE_LIMIT_POLICY)
  })

  it('floors valid values', () => {
    expect(normalizeRateLimitPolicy({ windowMs: 5_000.7, maxRequests: 12.9 })).toEqual({
      windowMs: 5_000,
      maxRequests: 12,
    })
  })
})

describe('evaluateRateLimit', () => {
  const policy = { windowMs: 1_000, maxRequests: 3 }

  it('opens a fresh window and consumes capacity', () => {
    const first = evaluateRateLimit(null, 10_000, policy)
    expect(first.allowed).toBe(true)
    expect(first.remaining).toBe(2)
    expect(first.nextState).toEqual({ windowStartMs: 10_000, count: 1 })

    const second = evaluateRateLimit(first.nextState, 10_100, policy)
    expect(second.remaining).toBe(1)
  })

  it('blocks beyond the budget with the exact reset delay', () => {
    const state = { windowStartMs: 10_000, count: 4 }
    const decision = evaluateRateLimit(state, 10_400, policy)
    expect(decision.allowed).toBe(false)
    expect(decision.remaining).toBe(0)
    expect(decision.retryAfterMs).toBe(600)
    expect(decision.nextState).toBe(state)
  })

  it('resets once the window has elapsed', () => {
    const decision = evaluateRateLimit({ windowStartMs: 10_000, count: 3 }, 11_000, policy)
    expect(decision.allowed).toBe(true)
    expect(decision.nextState).toEqual({ windowStartMs: 11_000, count: 1 })
  })

  it('never grants capacity when the clock moves backwards', () => {
    const decision = evaluateRateLimit({ windowStartMs: 10_000, count: 2 }, 9_500, policy)
    expect(decision.allowed).toBe(true)
    expect(decision.nextState.windowStartMs).toBe(10_000)
    expect(decision.nextState.count).toBe(3)
  })
})

describe('inspectRateLimit', () => {
  it('reports usage without consuming a request', () => {
    expect(inspectRateLimit(null, 5_000, { windowMs: 1_000, maxRequests: 5 })).toEqual({
      used: 0,
      remaining: 5,
      resetsAtMs: 6_000,
    })
    expect(inspectRateLimit({ windowStartMs: 5_000, count: 4 }, 5_500, { windowMs: 1_000, maxRequests: 5 })).toEqual({
      used: 4,
      remaining: 1,
      resetsAtMs: 6_000,
    })
  })
})

describe('rate limit surfaces', () => {
  it('bounds auth, export and import more tightly than generic API traffic', () => {
    expect(rateLimitPolicyFor('auth').maxRequests).toBeLessThan(rateLimitPolicyFor('api').maxRequests)
    expect(rateLimitPolicyFor('export').maxRequests).toBeLessThan(rateLimitPolicyFor('api').maxRequests)
    expect(rateLimitPolicyFor('import').maxRequests).toBeLessThanOrEqual(10)
  })
})

describe('abuse controls', () => {
  it('normalizes an incoherent policy back to the baseline', () => {
    expect(normalizeAbusePolicy({ watchThreshold: 10, blockThreshold: 10 })).toEqual(
      normalizeAbusePolicy(null),
    )
    expect(normalizeAbusePolicy({ watchThreshold: 0, blockThreshold: 5 })).toEqual(
      normalizeAbusePolicy(null),
    )
    expect(normalizeAbusePolicy({ watchThreshold: 3, blockThreshold: 9 })).toEqual({
      watchThreshold: 3,
      blockThreshold: 9,
    })
  })

  it('classifies the strongest signal', () => {
    const policy = { watchThreshold: 5, blockThreshold: 20 }
    expect(classifyAbuseRisk(EMPTY_ABUSE_SNAPSHOT, policy)).toBe('normal')
    expect(classifyAbuseRisk({ ...EMPTY_ABUSE_SNAPSHOT, authFailures: 4 }, policy)).toBe('normal')
    expect(classifyAbuseRisk({ ...EMPTY_ABUSE_SNAPSHOT, authFailures: 5 }, policy)).toBe('watch')
    expect(classifyAbuseRisk({ ...EMPTY_ABUSE_SNAPSHOT, exportRequests: 19 }, policy)).toBe('watch')
    expect(classifyAbuseRisk({ ...EMPTY_ABUSE_SNAPSHOT, exportRequests: 20 }, policy)).toBe('blocked')
    expect(classifyAbuseRisk({ ...EMPTY_ABUSE_SNAPSHOT, rejectedRequests: 50 }, policy)).toBe(
      'blocked',
    )
  })

  it('records signals monotonically and ignores invalid amounts', () => {
    const once = recordAbuseSignal(EMPTY_ABUSE_SNAPSHOT, 'authFailures')
    expect(once.authFailures).toBe(1)
    expect(recordAbuseSignal(once, 'authFailures', 4).authFailures).toBe(5)
    expect(recordAbuseSignal(once, 'authFailures', -3).authFailures).toBe(2)
    expect(recordAbuseSignal(once, 'exportRequests', 2).exportRequests).toBe(2)
  })

  it('describes risk transitions for audit', () => {
    expect(classifyAbuseTransition('normal', 'watch')).toBe('escalated')
    expect(classifyAbuseTransition('watch', 'blocked')).toBe('escalated')
    expect(classifyAbuseTransition('blocked', 'watch')).toBe('deescalated')
    expect(classifyAbuseTransition('watch', 'watch')).toBe('unchanged')
  })
})

describe('privileged MFA step-up', () => {
  const hour = 60 * 60 * 1_000

  it('detects privileged permissions explicitly', () => {
    expect(requiresPrivilegedMfa(['companies.manage'])).toBe(true)
    expect(requiresPrivilegedMfa(['datasets.export'])).toBe(true)
    expect(requiresPrivilegedMfa(['reports.read.own', 'plans.read.own'])).toBe(false)
    expect(requiresPrivilegedMfa([])).toBe(false)
  })

  it('never requires MFA for a non-privileged action', () => {
    expect(
      evaluatePrivilegedMfa({
        permissions: ['plans.read.own'],
        session: { mfaVerifiedAtMs: null },
        atMs: 10_000,
      }),
    ).toBe('not_required')
  })

  it('fails closed when a privileged action has no verification', () => {
    expect(
      evaluatePrivilegedMfa({
        permissions: ['companies.manage'],
        session: { mfaVerifiedAtMs: null },
        atMs: 10_000,
      }),
    ).toBe('mfa_required')
  })

  it('accepts a fresh verification and refuses a stale or future one', () => {
    const base = { permissions: ['platform.settings.manage'], atMs: 100 * hour }
    expect(
      evaluatePrivilegedMfa({ ...base, session: { mfaVerifiedAtMs: 99 * hour } }),
    ).toBe('satisfied')
    // Exactly at the freshness boundary is still fresh.
    expect(
      evaluatePrivilegedMfa({ ...base, session: { mfaVerifiedAtMs: 92 * hour } }),
    ).toBe('satisfied')
    expect(
      evaluatePrivilegedMfa({ ...base, session: { mfaVerifiedAtMs: 92 * hour - 1 } }),
    ).toBe('mfa_stale')
    expect(
      evaluatePrivilegedMfa({ ...base, session: { mfaVerifiedAtMs: 101 * hour } }),
    ).toBe('mfa_stale')
  })

  it('honors a stricter freshness policy and normalizes invalid ones', () => {
    expect(
      evaluatePrivilegedMfa({
        permissions: ['datasets.export'],
        session: { mfaVerifiedAtMs: 0 },
        atMs: 10 * 60 * 1_000,
        policy: { freshnessMs: 5 * 60 * 1_000 },
      }),
    ).toBe('mfa_stale')
    expect(normalizeMfaPolicy({ freshnessMs: 10 })).toEqual(DEFAULT_MFA_POLICY)
    expect(normalizeMfaPolicy(null)).toEqual(DEFAULT_MFA_POLICY)
  })
})

describe('security response headers', () => {
  it('emits the hardened default set including CSP and HSTS', () => {
    const headers = buildSecurityHeaders()
    expect(headers['strict-transport-security']).toContain('max-age=31536000')
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['content-security-policy']).toBe(DEFAULT_CONTENT_SECURITY_POLICY)
    expect(headers['permissions-policy']).toContain('camera=()')
  })

  it('allows suppressing the CSP for machine endpoints', () => {
    const headers = buildSecurityHeaders({ contentSecurityPolicy: null })
    expect(headers['content-security-policy']).toBeUndefined()
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
  })

  it('appends explicit frame ancestors and relaxes framing accordingly', () => {
    const headers = buildSecurityHeaders({ frameAncestors: ["'self'"] })
    expect(headers['x-frame-options']).toBe('SAMEORIGIN')
    expect(headers['content-security-policy']).toContain("frame-ancestors 'self'")
  })
})
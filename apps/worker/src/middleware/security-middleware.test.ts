import type { AuthContext } from '@fieldrep/domain'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

import { attachAuthContext, type AuthorizationEnv } from './authorization'
import { requirePrivilegedMfa } from './privileged-mfa'
import { securityHeaders } from './security-headers'

function authContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'platform-admin-1',
    membershipId: 'membership-1',
    companyId: 'company-1',
    workspaceId: 'workspace-1',
    roleKeys: ['platform_admin'],
    permissions: ['companies.manage'],
    scopes: [{ type: 'platform' }],
    ...overrides,
  }
}

describe('security-headers middleware', () => {
  it('stamps every response, including denials, with the hardened policy', async () => {
    const app = new Hono<AuthorizationEnv>()
    app.use('/api/*', securityHeaders())
    app.get('/api/ok', (c) => c.json({ ok: true }))
    app.get('/api/nope', (c) => c.json({ error: 'no' }, 403))

    for (const path of ['/api/ok', '/api/nope']) {
      const response = await app.request(path)
      expect(response.headers.get('content-security-policy')).toContain("default-src 'self'")
      expect(response.headers.get('x-frame-options')).toBe('DENY')
      expect(response.headers.get('x-content-type-options')).toBe('nosniff')
      expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
      expect(response.headers.get('strict-transport-security')).toContain('max-age=31536000')
      expect(response.headers.get('permissions-policy')).toContain('camera=()')
    }
  })
})

describe('privileged-mfa middleware', () => {
  function appFor(
    context: AuthContext | null,
    verifiedAtMs: number | null | undefined,
    policy?: { freshnessMs: number },
  ) {
    const app = new Hono<AuthorizationEnv>()
    const resolver = { resolve: async () => context }
    const sessionResolver =
      verifiedAtMs === undefined
        ? { resolvePrivilegedSession: async () => null }
        : { resolvePrivilegedSession: async () => ({ mfaVerifiedAtMs: verifiedAtMs }) }
    app.use('/admin', attachAuthContext(resolver))
    app.use('/admin', requirePrivilegedMfa({ sessionResolver, policy, now: () => 10_000 }))
    app.get('/admin', (c) => c.json({ ok: true }))
    return app
  }

  it('lets non-privileged callers through without a session binding', async () => {
    const app = appFor(authContext({ permissions: ['plans.read.own'] }), undefined)
    const response = await app.request('/admin')
    expect(response.status).toBe(200)
  })

  it('fails closed for privileged callers without a session binding', async () => {
    const app = appFor(authContext(), undefined)
    const response = await app.request('/admin')
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'mfa_setup_required' })
  })

  it('requires a step-up for privileged callers with no verification', async () => {
    const app = appFor(authContext(), null)
    const response = await app.request('/admin')
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'mfa_required' })
  })

  it('passes privileged callers through with a fresh verification', async () => {
    const app = appFor(authContext(), 9_000)
    const response = await app.request('/admin')
    expect(response.status).toBe(200)
  })

  it('refuses privileged callers with a stale verification', async () => {
    const app = appFor(authContext(), 0, { freshnessMs: 1_000 })
    const response = await app.request('/admin')
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'mfa_stale' })
  })

  it('keeps the 401 authentication boundary before the MFA check', async () => {
    const app = appFor(null, null)
    const response = await app.request('/admin')
    expect(response.status).toBe(401)
  })
})
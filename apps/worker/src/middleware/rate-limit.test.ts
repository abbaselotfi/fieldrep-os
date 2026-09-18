import type { AuthContext } from '@fieldrep/domain'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

import type { AuthorizationEnv } from './authorization'
import { InMemoryRateLimitStore, rateLimit } from './rate-limit'

function authContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    membershipId: 'membership-1',
    companyId: 'company-1',
    workspaceId: 'workspace-1',
    roleKeys: ['user'],
    permissions: ['plans.read.own'],
    scopes: [{ type: 'self' }],
    ...overrides,
  }
}

describe('rate-limit middleware', () => {
  it('denies with 429 and retry-after once the budget is exhausted', async () => {
    const now = { value: 10_000 }
    const app = new Hono<AuthorizationEnv>()
    app.use(
      '/protected',
      rateLimit({
        surface: 'api',
        store: new InMemoryRateLimitStore(),
        policy: { windowMs: 1_000, maxRequests: 2 },
        now: () => now.value,
      }),
    )
    app.get('/protected', (c) => c.json({ ok: true }))

    const first = await app.request('/protected')
    expect(first.status).toBe(200)
    expect(first.headers.get('x-ratelimit-limit')).toBe('2')
    expect(first.headers.get('x-ratelimit-remaining')).toBe('1')

    const second = await app.request('/protected')
    expect(second.status).toBe(200)

    const denied = await app.request('/protected')
    expect(denied.status).toBe(429)
    expect(denied.headers.get('x-ratelimit-remaining')).toBe('0')
    expect(denied.headers.get('retry-after')).toBe('1')
    const body = (await denied.json()) as { error: string; retryAfterMs: number }
    expect(body.error).toBe('rate_limited')
    expect(body.retryAfterMs).toBeGreaterThan(0)
  })

  it('opens a fresh window once the previous one elapses', async () => {
    const now = { value: 10_000 }
    const app = new Hono<AuthorizationEnv>()
    app.use(
      '/protected',
      rateLimit({
        surface: 'api',
        store: new InMemoryRateLimitStore(),
        policy: { windowMs: 1_000, maxRequests: 1 },
        now: () => now.value,
      }),
    )
    app.get('/protected', (c) => c.json({ ok: true }))

    expect((await app.request('/protected')).status).toBe(200)
    expect((await app.request('/protected')).status).toBe(429)

    now.value = 11_000
    const reopened = await app.request('/protected')
    expect(reopened.status).toBe(200)
    expect(reopened.headers.get('x-ratelimit-remaining')).toBe('0')
  })

  it('buckets authenticated and anonymous requests under distinct keys', async () => {
    const store = new InMemoryRateLimitStore()
    await store.set('auth:fallback', { windowStartMs: 10_000, count: 1 })
    expect(await store.get('auth:fallback')).toEqual({ windowStartMs: 10_000, count: 1 })
    expect(await store.get('auth:user:user-1')).toBeNull()
    await store.set('auth:user:user-1', { windowStartMs: 10_000, count: 2 })
    expect(await store.get('auth:user:user-1')).toEqual({ windowStartMs: 10_000, count: 2 })
  })

  it('counts the authenticated user under their own bucket, not the shared address bucket', async () => {
    const { attachAuthContext } = await import('./authorization')
    const resolver = { resolve: async () => authContext() }
    const app = new Hono<AuthorizationEnv>()
    const store = new InMemoryRateLimitStore()
    app.use('/user', attachAuthContext(resolver))
    app.use(
      '/user',
      rateLimit({
        surface: 'auth',
        store,
        policy: { windowMs: 60_000, maxRequests: 1 },
        now: () => 10_000,
      }),
    )
    app.get('/user', (c) => c.json({ ok: true }))

    expect((await app.request('/user')).status).toBe(200)
    // The user's second request hits their own bucket, not the address one.
    expect((await app.request('/user')).status).toBe(429)
    expect(await store.get('auth:user:user-1')).not.toBeNull()
  })
})
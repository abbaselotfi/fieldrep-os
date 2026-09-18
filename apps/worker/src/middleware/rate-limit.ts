import {
  evaluateRateLimit,
  rateLimitPolicyFor,
  type RateLimitPolicy,
  type RateLimitState,
  type RateLimitSurface,
} from '@fieldrep/domain'
import { createMiddleware } from 'hono/factory'

import type { AuthorizationEnv } from './authorization'

/**
 * Fixed-window rate limiting (P12-A1) over a pluggable store so workers can
 * bind KV/D1 and tests can use memory. The domain guard decides; the store
 * only moves `RateLimitState` in and out. Keys name the caller, never the
 * payload: authenticated user id first, otherwise the source address.
 */

export interface RateLimitStore {
  get(key: string): Promise<RateLimitState | null>
  set(key: string, state: RateLimitState): Promise<void>
}

export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, RateLimitState>()

  async get(key: string): Promise<RateLimitState | null> {
    return this.buckets.get(key) ?? null
  }

  async set(key: string, state: RateLimitState): Promise<void> {
    this.buckets.set(key, state)
  }
}

export interface RateLimitOptions {
  surface: RateLimitSurface
  store: RateLimitStore
  /** Overrides the surface budget (tests); production uses the surface policy. */
  policy?: Partial<RateLimitPolicy> | undefined
  /** Builds the storage key; defaults to the authenticated user, else the source address. */
  keyFor?: ((request: Request, userId: string | undefined) => string) | undefined
  /** Clock override for tests (epoch ms). */
  now?: (() => number) | undefined
}

export function rateLimitBucketKey(request: Request, userId: string | undefined): string {
  if (userId !== undefined) return `user:${userId}`
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const connecting = request.headers.get('cf-connecting-ip')?.trim()
  return `addr:${forwarded ?? connecting ?? 'unknown'}`
}

export function rateLimit(options: RateLimitOptions) {
  const surfacePolicy = rateLimitPolicyFor(options.surface)
  const policy: RateLimitPolicy = {
    windowMs: options.policy?.windowMs ?? surfacePolicy.windowMs,
    maxRequests: options.policy?.maxRequests ?? surfacePolicy.maxRequests,
  }
  const keyFor = options.keyFor ?? rateLimitBucketKey
  const now = options.now ?? Date.now

  return createMiddleware(async (c, next) => {
    const authContext = c.var.authContext as { userId?: string } | undefined
    const key = `${options.surface}:${keyFor(c.req.raw, authContext?.userId)}`
    const atMs = now()
    const state = await options.store.get(key)
    const decision = evaluateRateLimit(state, atMs, policy)

    if (!decision.allowed) {
      const retryAfterSeconds = Math.ceil(decision.retryAfterMs / 1_000)
      c.header('retry-after', String(Math.max(retryAfterSeconds, 1)))
      c.header('x-ratelimit-limit', String(policy.maxRequests))
      c.header('x-ratelimit-remaining', '0')
      // The denial is also fed back to the abuse classifier (§28) by callers.
      return c.json({ error: 'rate_limited', retryAfterMs: decision.retryAfterMs }, 429)
    }

    await options.store.set(key, decision.nextState)
    c.header('x-ratelimit-limit', String(policy.maxRequests))
    c.header('x-ratelimit-remaining', String(decision.remaining))
    await next()
  })
}
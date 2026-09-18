import type { PermissionKey } from './identity'

/**
 * Security hardening contracts (P12-A1).
 *
 * Deterministic rate limiting, abuse escalation and privileged-role MFA
 * step-up (SECURITY-THREAT-MODEL §9, §28). Every helper here is pure: the
 * middleware layer only moves state in and out. Fail-closed by default — an
 * unknown/absent policy falls back to the strict baseline, and a privileged
 * action without fresh MFA is refused.
 */

export interface RateLimitPolicy {
  windowMs: number
  maxRequests: number
}

/** Strict baseline applied when a surface has no explicit policy. */
export const DEFAULT_RATE_LIMIT_POLICY: RateLimitPolicy = { windowMs: 60_000, maxRequests: 60 }

export function normalizeRateLimitPolicy(
  value: Partial<RateLimitPolicy> | null | undefined,
): RateLimitPolicy {
  const windowMs = value?.windowMs
  const maxRequests = value?.maxRequests
  return {
    windowMs:
      windowMs !== undefined && Number.isFinite(windowMs) && windowMs >= 1_000
        ? Math.floor(windowMs)
        : DEFAULT_RATE_LIMIT_POLICY.windowMs,
    maxRequests:
      maxRequests !== undefined && Number.isFinite(maxRequests) && maxRequests >= 1
        ? Math.floor(maxRequests)
        : DEFAULT_RATE_LIMIT_POLICY.maxRequests,
  }
}

/**
 * Per-surface budgets (§28: login brute force, expensive exports/imports and
 * generic API spam are bounded independently).
 */
export type RateLimitSurface = 'auth' | 'api' | 'export' | 'import' | 'sync'

export const RATE_LIMIT_POLICIES: Readonly<Record<RateLimitSurface, RateLimitPolicy>> = {
  auth: { windowMs: 60_000, maxRequests: 10 },
  api: { windowMs: 60_000, maxRequests: 120 },
  export: { windowMs: 60_000, maxRequests: 5 },
  import: { windowMs: 60_000, maxRequests: 5 },
  sync: { windowMs: 60_000, maxRequests: 60 },
}

export function rateLimitPolicyFor(surface: RateLimitSurface): RateLimitPolicy {
  return RATE_LIMIT_POLICIES[surface]
}

export interface RateLimitState {
  windowStartMs: number
  count: number
}

export interface RateLimitDecision {
  allowed: boolean
  remaining: number
  /** Milliseconds until the current window resets (0 when allowed). */
  retryAfterMs: number
  nextState: RateLimitState
}

/**
 * Fixed-window evaluation: deterministic and monotonic in `atMs`. A clock that
 * moves backwards never grants extra capacity (the existing window is kept).
 */
export function evaluateRateLimit(
  state: RateLimitState | null,
  atMs: number,
  policy: RateLimitPolicy = DEFAULT_RATE_LIMIT_POLICY,
): RateLimitDecision {
  const elapsed = state === null ? policy.windowMs : atMs - state.windowStartMs
  if (state === null || elapsed >= policy.windowMs) {
    return {
      allowed: true,
      remaining: policy.maxRequests - 1,
      retryAfterMs: 0,
      nextState: { windowStartMs: atMs, count: 1 },
    }
  }

  const resetsAtMs = state.windowStartMs + policy.windowMs
  if (state.count >= policy.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(resetsAtMs - atMs, 0),
      nextState: state,
    }
  }

  const nextCount = state.count + 1
  return {
    allowed: true,
    remaining: policy.maxRequests - nextCount,
    retryAfterMs: 0,
    nextState: {
      // The window never re-anchors inside an open window — a backwards clock
      // therefore cannot grant extra capacity.
      windowStartMs: state.windowStartMs,
      count: nextCount,
    },
  }
}

/** Remaining capacity of a window without consuming a request. */
export function inspectRateLimit(
  state: RateLimitState | null,
  atMs: number,
  policy: RateLimitPolicy = DEFAULT_RATE_LIMIT_POLICY,
): { used: number; remaining: number; resetsAtMs: number } {
  const expired = state === null || atMs - state.windowStartMs >= policy.windowMs
  const used = expired ? 0 : state.count
  return {
    used,
    remaining: Math.max(policy.maxRequests - used, 0),
    resetsAtMs: expired ? atMs + policy.windowMs : state.windowStartMs + policy.windowMs,
  }
}

/** Signal keys the abuse classifier tracks (§28 abuse controls). */
export type AbuseSignalKey = 'authFailures' | 'rejectedRequests' | 'exportRequests'

export interface AbuseSignalSnapshot {
  authFailures: number
  rejectedRequests: number
  exportRequests: number
}

export const EMPTY_ABUSE_SNAPSHOT: AbuseSignalSnapshot = {
  authFailures: 0,
  rejectedRequests: 0,
  exportRequests: 0,
}

export interface AbusePolicy {
  /** At or above this signal count the subject is watched. */
  watchThreshold: number
  /** At or above this signal count the subject is blocked. */
  blockThreshold: number
}

export const DEFAULT_ABUSE_POLICY: AbusePolicy = { watchThreshold: 5, blockThreshold: 20 }

export function normalizeAbusePolicy(value: Partial<AbusePolicy> | null | undefined): AbusePolicy {
  const watch = value?.watchThreshold
  const block = value?.blockThreshold
  if (
    watch === undefined ||
    block === undefined ||
    !Number.isFinite(watch) ||
    !Number.isFinite(block) ||
    watch < 1 ||
    block <= watch
  ) {
    return DEFAULT_ABUSE_POLICY
  }
  return { watchThreshold: Math.floor(watch), blockThreshold: Math.floor(block) }
}

export type AbuseRisk = 'normal' | 'watch' | 'blocked'

/**
 * Fail-closed classification: the strongest signal decides. A block threshold
 * that is unreachable (≤ watch) is normalized away, so 'blocked' always means
 * "a configured limit was actually exceeded".
 */
export function classifyAbuseRisk(
  snapshot: AbuseSignalSnapshot,
  policy: AbusePolicy = DEFAULT_ABUSE_POLICY,
): AbuseRisk {
  const normalized = normalizeAbusePolicy(policy)
  const peak = Math.max(snapshot.authFailures, snapshot.rejectedRequests, snapshot.exportRequests)
  if (peak >= normalized.blockThreshold) return 'blocked'
  if (peak >= normalized.watchThreshold) return 'watch'
  return 'normal'
}

/** Records one signal observation into a snapshot (never negative). */
export function recordAbuseSignal(
  snapshot: AbuseSignalSnapshot,
  signal: AbuseSignalKey,
  amount = 1,
): AbuseSignalSnapshot {
  const step = Number.isInteger(amount) && amount > 0 ? amount : 1
  return { ...snapshot, [signal]: snapshot[signal] + step }
}

export function classifyAbuseTransition(
  current: AbuseRisk,
  next: AbuseRisk,
): 'escalated' | 'deescalated' | 'unchanged' {
  const order: readonly AbuseRisk[] = ['normal', 'watch', 'blocked']
  const delta = order.indexOf(next) - order.indexOf(current)
  if (delta > 0) return 'escalated'
  return delta < 0 ? 'deescalated' : 'unchanged'
}

/**
 * Privileged permission keys that require a fresh MFA step-up (§9: "MFA
 * capability for privileged roles"). Deliberately explicit — a new privileged
 * permission must be added here to be covered.
 */
export const PRIVILEGED_MFA_PERMISSIONS = [
  'companies.manage',
  'workspaces.manage',
  'limits.manage',
  'features.manage',
  'platform.settings.manage',
  'database_routes.manage',
  'support_access.start',
  'workspace_data.export',
  'datasets.export',
  'memberships.manage.company',
  'memberships.manage.workspace',
  'role_assignments.manage.workspace',
] as const satisfies readonly PermissionKey[]

export function requiresPrivilegedMfa(permissions: readonly string[]): boolean {
  const privileged = new Set<string>(PRIVILEGED_MFA_PERMISSIONS)
  return permissions.some((permission) => privileged.has(permission))
}

export interface MfaPolicy {
  /** How long a verification stays fresh for a privileged action. */
  freshnessMs: number
}

export const DEFAULT_MFA_POLICY: MfaPolicy = { freshnessMs: 8 * 60 * 60 * 1_000 }

export function normalizeMfaPolicy(value: Partial<MfaPolicy> | null | undefined): MfaPolicy {
  const freshnessMs = value?.freshnessMs
  if (freshnessMs === undefined || !Number.isFinite(freshnessMs) || freshnessMs < 1_000) {
    return DEFAULT_MFA_POLICY
  }
  return { freshnessMs: Math.floor(freshnessMs) }
}

export interface PrivilegedSessionState {
  /** Epoch ms of the last successful second-factor verification. */
  mfaVerifiedAtMs: number | null
}

export type MfaDecision = 'not_required' | 'satisfied' | 'mfa_required' | 'mfa_stale'

/**
 * Fail-closed step-up: a privileged action with no verification is refused
 * (`mfa_required`), and a verification older than the freshness window is
 * refused too (`mfa_stale`) — never silently accepted.
 */
export function evaluatePrivilegedMfa(input: {
  permissions: readonly string[]
  session: PrivilegedSessionState
  atMs: number
  policy?: Partial<MfaPolicy> | null | undefined
}): MfaDecision {
  if (!requiresPrivilegedMfa(input.permissions)) return 'not_required'
  const verifiedAt = input.session.mfaVerifiedAtMs
  if (verifiedAt === null) return 'mfa_required'
  const { freshnessMs } = normalizeMfaPolicy(input.policy)
  const age = input.atMs - verifiedAt
  // A future-dated verification is incoherent — treat it as stale, not valid.
  if (age < 0 || age > freshnessMs) return 'mfa_stale'
  return 'satisfied'
}

export const DEFAULT_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
].join('; ')

/**
 * Deterministic hardened response headers. `contentSecurityPolicy: null`
 * suppresses the CSP (e.g. machine-to-machine JSON endpoints that must not
 * inherit a document policy), and framing is denied unless explicit ancestors
 * are requested.
 */
export function buildSecurityHeaders(
  options: {
    contentSecurityPolicy?: string | null | undefined
    frameAncestors?: readonly string[] | undefined
  } = {},
): Record<string, string> {
  const frameAncestors = options.frameAncestors ?? []
  const csp =
    options.contentSecurityPolicy === undefined
      ? DEFAULT_CONTENT_SECURITY_POLICY
      : options.contentSecurityPolicy
  const effectiveCsp =
    csp === null
      ? null
      : frameAncestors.length === 0
        ? csp
        : `${csp}; frame-ancestors ${frameAncestors.join(' ')}`

  const headers: Record<string, string> = {
    'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
    'x-frame-options': frameAncestors.length === 0 ? 'DENY' : 'SAMEORIGIN',
  }
  if (effectiveCsp !== null) headers['content-security-policy'] = effectiveCsp
  return headers
}
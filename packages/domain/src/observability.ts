/**
 * Observability contracts (P12-A2).
 *
 * Request correlation, structured event logging with sensitive-data
 * discipline, latency/SLO evaluation and health rollups (REQUIREMENTS
 * NFR-005: errors, sync failures and security-relevant events must be
 * diagnosable without exposing sensitive data unnecessarily). Pure
 * contracts + deterministic helpers — sinks and clocks live in the callers.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical'

export const WELL_KNOWN_EVENT_KINDS = [
  'http.request.completed',
  'auth.denied',
  'permission.denied',
  'rate.limited',
  'abuse.escalated',
  'mfa.challenged',
  'dataset.export.recorded',
  'sync.operation.applied',
  'health.check',
] as const

export type ObservabilityEventKind = (typeof WELL_KNOWN_EVENT_KINDS)[number] | (string & {})

export interface LogEventInput {
  kind: ObservabilityEventKind
  level: LogLevel
  component: string
  message: string
  atMs: number
  requestId?: string | undefined
  userId?: string | undefined
  companyId?: string | undefined
  workspaceId?: string | undefined
  latencyMs?: number | undefined
  outcome?: string | undefined
  metadata?: Readonly<Record<string, unknown>> | null | undefined
}

export interface LogEvent {
  kind: string
  level: LogLevel
  component: string
  message: string
  atMs: number
  requestId: string | null
  userId: string | null
  companyId: string | null
  workspaceId: string | null
  latencyMs: number | null
  outcome: string | null
  metadata: Record<string, unknown> | null
}

export function isLogLevel(value: string): value is LogLevel {
  return (
    value === 'debug' || value === 'info' || value === 'warn' || value === 'error' || value === 'critical'
  )
}

/**
 * Normalizes one event: unknown levels fall back to `info` (a log pipeline
 * must never crash on a bad level), `undefined` scope becomes `null`, and
 * metadata is sanitized so secrets can never leak through structured logs.
 */
export function buildLogEvent(input: LogEventInput, sensitiveKeys?: readonly string[]): LogEvent {
  return {
    kind: input.kind,
    level: isLogLevel(input.level) ? input.level : 'info',
    component: input.component,
    message: input.message,
    atMs: input.atMs,
    requestId: input.requestId ?? null,
    userId: input.userId ?? null,
    companyId: input.companyId ?? null,
    workspaceId: input.workspaceId ?? null,
    latencyMs: input.latencyMs ?? null,
    outcome: input.outcome ?? null,
    metadata: sanitizeLogMetadata(input.metadata ?? null, sensitiveKeys),
  }
}

const SENSITIVE_METADATA_KEYS = new Set([
  'password',
  'passcode',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'secret',
  'clientsecret',
  'apikey',
  'api_key',
  'authorization',
  'cookie',
  'set-cookie',
  'setcookie',
  'otp',
  'mfacode',
  'totp',
  'privatekey',
])

export const LOG_METADATA_REDACTED = '[redacted]'

/**
 * Recursively redacts sensitive keys (case-insensitive, separators ignored)
 * up to a fixed depth, so a structured log can never carry a secret no
 * matter how deeply a caller nests it.
 */
export function sanitizeLogMetadata(
  metadata: Readonly<Record<string, unknown>> | null | undefined,
  extraKeys?: readonly string[],
  depth = 5,
): Record<string, unknown> | null {
  if (metadata === null || metadata === undefined) return null
  const blocked = new Set(SENSITIVE_METADATA_KEYS)
  for (const key of extraKeys ?? []) blocked.add(foldMetadataKey(key))

  const redact = (value: unknown, level: number): unknown => {
    if (Array.isArray(value)) {
      return level <= 0 ? value.map(() => LOG_METADATA_REDACTED) : value.map((item) => redact(item, level - 1))
    }
    if (value !== null && typeof value === 'object' && level > 0) {
      const out: Record<string, unknown> = {}
      for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
        out[key] = blocked.has(foldMetadataKey(key)) ? LOG_METADATA_REDACTED : redact(entry, level - 1)
      }
      return out
    }
    return value
  }

  const entries: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(metadata)) {
    entries[key] = blocked.has(foldMetadataKey(key)) ? LOG_METADATA_REDACTED : redact(value, depth)
  }
  return entries
}

function foldMetadataKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/gu, '')
}

/**
 * Request correlation: traces every log/metric of one request back to a
 * single id. Prefers a caller-supplied id (gateway/proxy), generates a
 * deterministic fallback otherwise. Fail-closed: anything unusable becomes a
 * generated id, never an empty string.
 */
export interface RequestCorrelation {
  requestId: string
  forwardedFromHeader: boolean
}

const REQUEST_ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'

export function resolveRequestId(
  headerValue: string | null | undefined,
  random: () => number = Math.random,
): RequestCorrelation {
  const normalized = (headerValue ?? '').trim().replace(/\s+/gu, '')
  if (normalized.length >= 8 && normalized.length <= 64 && /^[A-Za-z0-9_-]+$/u.test(normalized)) {
    return { requestId: normalized, forwardedFromHeader: true }
  }
  let suffix = ''
  for (let index = 0; index < 12; index += 1) {
    suffix += REQUEST_ID_CHARS[Math.floor(random() * REQUEST_ID_CHARS.length)] ?? '0'
  }
  return { requestId: `req-${suffix}`, forwardedFromHeader: false }
}

/**
 * Latency and SLO evaluation. Percentile is nearest-rank over a bounded
 * sample, so dashboards stay deterministic for the same inputs.
 */
export interface SloBudget {
  p50Ms: number
  p95Ms: number
  p99Ms: number
  errorRate: number
}

export const DEFAULT_SLO_BUDGET: SloBudget = {
  p50Ms: 300,
  p95Ms: 1_200,
  p99Ms: 3_000,
  errorRate: 0.01,
}

export function normalizeSloBudget(value: Partial<SloBudget> | null | undefined): SloBudget {
  const pick = (raw: number | undefined, fallback: number): number =>
    raw !== undefined && Number.isFinite(raw) && raw >= 0 ? raw : fallback
  return {
    p50Ms: pick(value?.p50Ms, DEFAULT_SLO_BUDGET.p50Ms),
    p95Ms: pick(value?.p95Ms, DEFAULT_SLO_BUDGET.p95Ms),
    p99Ms: pick(value?.p99Ms, DEFAULT_SLO_BUDGET.p99Ms),
    errorRate: pick(value?.errorRate, DEFAULT_SLO_BUDGET.errorRate),
  }
}

export function percentile(values: readonly number[], rank: number): number {
  if (values.length === 0) return 0
  const clamped = Math.min(Math.max(rank, 0), 1)
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.max(Math.ceil(clamped * sorted.length) - 1, 0)
  return sorted[index] ?? 0
}

export interface SloSample {
  latencyMs: number
  errored: boolean
}

export interface SloEvaluation {
  count: number
  errorCount: number
  errorRate: number
  p50Ms: number
  p95Ms: number
  p99Ms: number
  withinBudget: boolean
  breaches: string[]
}

export function evaluateSlo(
  samples: readonly SloSample[],
  budget: SloBudget = DEFAULT_SLO_BUDGET,
): SloEvaluation {
  const latencies = samples.map((sample) => Math.max(sample.latencyMs, 0))
  const errorCount = samples.filter((sample) => sample.errored).length
  const count = samples.length
  const errorRate = count === 0 ? 0 : errorCount / count
  const p50Ms = percentile(latencies, 0.5)
  const p95Ms = percentile(latencies, 0.95)
  const p99Ms = percentile(latencies, 0.99)

  const breaches: string[] = []
  if (count === 0) breaches.push('no_samples')
  if (p50Ms > budget.p50Ms) breaches.push('p50_latency')
  if (p95Ms > budget.p95Ms) breaches.push('p95_latency')
  if (p99Ms > budget.p99Ms) breaches.push('p99_latency')
  if (errorRate > budget.errorRate) breaches.push('error_rate')

  return { count, errorCount, errorRate, p50Ms, p95Ms, p99Ms, withinBudget: breaches.length === 0, breaches }
}

export type HealthState = 'healthy' | 'degraded' | 'unhealthy'

export interface HealthCheckResult {
  name: string
  state: HealthState
  latencyMs: number | null
  detail: string | null
}

export interface HealthRollup {
  state: HealthState
  checks: HealthCheckResult[]
}

/**
 * Fail-closed rollup: any unhealthy check makes the service unhealthy, a
 * degraded check degrades it, and an empty check list reports degraded
 * rather than pretending to be healthy.
 */
export function rollupHealth(checks: readonly HealthCheckResult[]): HealthRollup {
  const ordered = [...checks].sort((a, b) => a.name.localeCompare(b.name))
  let state: HealthState = ordered.length === 0 ? 'degraded' : 'healthy'
  for (const check of ordered) {
    if (check.state === 'unhealthy') {
      state = 'unhealthy'
      break
    }
    if (check.state === 'degraded') state = 'degraded'
  }
  return { state, checks: ordered }
}

/** A probe is only servable when its payload decodes to healthy/degraded. */
export function isServableHealthState(state: string): state is HealthState {
  return state === 'healthy' || state === 'degraded'
}
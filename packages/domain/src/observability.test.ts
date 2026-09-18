import { describe, expect, it } from 'vitest'

import {
  buildLogEvent,
  evaluateSlo,
  isLogLevel,
  isServableHealthState,
  normalizeSloBudget,
  percentile,
  resolveRequestId,
  rollupHealth,
  sanitizeLogMetadata,
  LOG_METADATA_REDACTED,
} from './observability'

describe('buildLogEvent', () => {
  it('normalizes scope to null and never crashes on an unknown level', () => {
    const event = buildLogEvent({
      kind: 'sync.operation.applied',
      level: 'VERBOSE' as never,
      component: 'worker',
      message: 'applied 3 ops',
      atMs: 10_000,
      outcome: 'applied',
    })
    expect(event.level).toBe('info')
    expect(event.requestId).toBeNull()
    expect(event.metadata).toBeNull()
    expect(event.latencyMs).toBeNull()
    expect(event.outcome).toBe('applied')
    expect(isLogLevel('error')).toBe(true)
    expect(isLogLevel('VERBOSE')).toBe(false)
  })
})

describe('sanitizeLogMetadata', () => {
  it('redacts secrets case-insensitively and keeps safe fields', () => {
    const sanitized = sanitizeLogMetadata({
      route: '/plans',
      password: 'hunter2',
      headers: { Authorization: 'Bearer abc', 'X-Trace': 't-1' },
      attempts: [{ otp: '123456', ok: false }, { region: 'ir-thr' }],
    })
    expect(sanitized).toEqual({
      route: '/plans',
      password: LOG_METADATA_REDACTED,
      headers: { Authorization: LOG_METADATA_REDACTED, 'X-Trace': 't-1' },
      attempts: [{ otp: LOG_METADATA_REDACTED, ok: false }, { region: 'ir-thr' }],
    })
  })

  it('honors caller-provided extra keys and never leaks through nesting', () => {
    const sanitized = sanitizeLogMetadata(
      { practitioner: { nationalCode: 'X' }, token: 't' },
      ['nationalCode'],
    )
    expect(sanitized).toEqual({
      practitioner: { nationalCode: LOG_METADATA_REDACTED },
      token: LOG_METADATA_REDACTED,
    })
    expect(sanitizeLogMetadata(null)).toBeNull()
    expect(sanitizeLogMetadata(undefined, ['x'])).toBeNull()
  })
})

describe('resolveRequestId', () => {
  it('forwards a usable caller id and marks it as forwarded', () => {
    expect(resolveRequestId('  gateway-trace-42 ')).toEqual({
      requestId: 'gateway-trace-42',
      forwardedFromHeader: true,
    })
  })

  it('generates a deterministic fallback for unusable ids', () => {
    const deterministic = () => 0.5
    const first = resolveRequestId('', deterministic)
    const second = resolveRequestId('has space inside and !!!', deterministic)
    expect(first.forwardedFromHeader).toBe(false)
    expect(first.requestId).toMatch(/^req-[a-z0-9]{12}$/u)
    expect(second.requestId).toBe(first.requestId)
    expect(resolveRequestId(null, deterministic).requestId).toBe(first.requestId)
  })

  it('rejects ids that are too short, too long or malformed', () => {
    const fallback = resolveRequestId('no', () => 0)
    expect(fallback.requestId).toBe('req-aaaaaaaaaaaa')
    expect(resolveRequestId('x'.repeat(65), () => 0).forwardedFromHeader).toBe(false)
    expect(resolveRequestId('has;semicolon!!', () => 0).forwardedFromHeader).toBe(false)
  })
})

describe('percentile', () => {
  it('uses nearest-rank and clamps the rank', () => {
    expect(percentile([], 0.5)).toBe(0)
    expect(percentile([5, 1, 3], 0.5)).toBe(3)
    expect(percentile([5, 1, 3], 0.99)).toBe(5)
    expect(percentile([5, 1, 3], 0)).toBe(1)
    expect(percentile([5, 1, 3], 2)).toBe(5)
  })
})

describe('evaluateSlo', () => {
  it('reports a healthy service within budget', () => {
    const evaluation = evaluateSlo([
      { latencyMs: 100, errored: false },
      { latencyMs: 200, errored: false },
      { latencyMs: 300, errored: false },
      { latencyMs: 400, errored: false },
    ])
    expect(evaluation.count).toBe(4)
    expect(evaluation.withinBudget).toBe(true)
    expect(evaluation.breaches).toEqual([])
    expect(evaluation.p50Ms).toBe(200)
    expect(evaluation.p95Ms).toBe(400)
  })

  it('flags latency and error-rate breaches deterministically', () => {
    const evaluation = evaluateSlo(
      [
        { latencyMs: 100, errored: false },
        { latencyMs: 5_000, errored: true },
        { latencyMs: 5_000, errored: false },
      ],
      normalizeSloBudget({ p50Ms: 200, p95Ms: 400, p99Ms: 900, errorRate: 0.1 }),
    )
    expect(evaluation.withinBudget).toBe(false)
    expect(evaluation.breaches).toEqual(
      expect.arrayContaining(['p50_latency', 'p95_latency', 'p99_latency', 'error_rate']),
    )
    expect(evaluation.errorRate).toBeCloseTo(1 / 3)
  })

  it('treats an empty sample as a breach, never as healthy', () => {
    const evaluation = evaluateSlo([])
    expect(evaluation.withinBudget).toBe(false)
    expect(evaluation.breaches).toEqual(['no_samples'])
    expect(normalizeSloBudget({ p95Ms: -1 }).p95Ms).toBe(1_200)
  })
})

describe('rollupHealth', () => {
  it('degrades on the worst check and sorts deterministically', () => {
    const rollup = rollupHealth([
      { name: 'd1', state: 'healthy', latencyMs: 3, detail: null },
      { name: 'auth', state: 'degraded', latencyMs: 40, detail: 'slow' },
    ])
    expect(rollup.state).toBe('degraded')
    expect(rollup.checks.map((check) => check.name)).toEqual(['auth', 'd1'])
  })

  it('fails closed on unhealthy checks and on empty check lists', () => {
    expect(
      rollupHealth([
        { name: 'd1', state: 'degraded', latencyMs: 3, detail: null },
        { name: 'kv', state: 'unhealthy', latencyMs: null, detail: 'timeout' },
      ]).state,
    ).toBe('unhealthy')
    expect(rollupHealth([]).state).toBe('degraded')
    expect(isServableHealthState('healthy')).toBe(true)
    expect(isServableHealthState('unhealthy')).toBe(false)
    expect(isServableHealthState('unknown')).toBe(false)
  })
})
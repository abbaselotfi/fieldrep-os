import { describe, expect, it } from 'vitest'

import { createHealthApi } from './health-api'
import type { HealthCheckResult } from '@fieldrep/domain'

function check(overrides: Partial<HealthCheckResult> = {}): HealthCheckResult {
  return {
    name: 'd1',
    state: 'healthy',
    latencyMs: 2,
    detail: null,
    ...overrides,
  }
}

describe('health API', () => {
  it('serves the cheap liveness probe without dependency calls', async () => {
    let checksCalled = false
    const app = createHealthApi({
      now: () => 5_000,
      readinessChecks: async () => {
        checksCalled = true
        return []
      },
    })
    const response = await app.request('/health')
    expect(response.status).toBe(200)
    const body = (await response.json()) as { service: string; status: string }
    expect(body.service).toBe('fieldrep-os-api')
    expect(body.status).toBe('ok')
    expect(checksCalled).toBe(false)
  })

  it('aggregates readiness checks — degraded stays 200, labeled', async () => {
    const app = createHealthApi({
      now: () => 5_000,
      readinessChecks: async () => [check(), check({ name: 'kv', state: 'degraded', detail: 'slow' })],
    })
    const response = await app.request('/health/ready')
    expect(response.status).toBe(200)
    const body = (await response.json()) as { status: string; checks: { name: string; state: string }[] }
    expect(body.status).toBe('degraded')
    expect(body.checks.map((c) => `${c.name}:${c.state}`)).toEqual(['d1:healthy', 'kv:degraded'])
  })

  it('returns 503 when a check is unhealthy', async () => {
    const app = createHealthApi({
      now: () => 5_000,
      readinessChecks: async () => [check({ state: 'unhealthy', detail: 'd1 down' })],
    })
    const response = await app.request('/health/ready')
    expect(response.status).toBe(503)
    const body = (await response.json()) as { status: string }
    expect(body.status).toBe('unhealthy')
  })

  it('treats unknown states and unreadable payloads as unhealthy (fail-closed)', async () => {
    const unknown = createHealthApi({
      now: () => 5_000,
      readinessChecks: async () => [check({ state: 'sort-of-fine' as never })],
    })
    expect((await unknown.request('/health/ready')).status).toBe(503)

    const unreadable = createHealthApi({
      now: () => 5_000,
      readinessChecks: async () => [null as unknown as HealthCheckResult],
    })
    const response = await unreadable.request('/health/ready')
    expect(response.status).toBe(503)
    const body = (await response.json()) as { checks: { name: string; detail: string | null }[] }
    expect(body.checks[0]!.name).toBe('readiness_payload')
  })

  it('labels an empty check list degraded (never silently healthy)', async () => {
    const app = createHealthApi({ now: () => 5_000, readinessChecks: async () => [] })
    const response = await app.request('/health/ready')
    expect(response.status).toBe(200)
    const body = (await response.json()) as { status: string }
    expect(body.status).toBe('degraded')
  })
})
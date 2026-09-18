import type { HealthCheckResult } from '@fieldrep/domain'
import { isServableHealthState, rollupHealth, type HealthRollup } from '@fieldrep/domain'
import { Hono } from 'hono'
import { z } from 'zod'

import type { ObservabilityEnv } from '../middleware/observability'

/**
 * Health & readiness API (P12-A2, REQUIREMENTS NFR-005). `/health` is the
 * cheap liveness probe (no dependency calls); `/health/ready` runs the
 * registered checks and fails closed: an unhealthy rollup is a 503, a
 * degraded one is still 200 but labeled, and an *unknown* state from any
 * check is treated as unhealthy — never silently served.
 */

export interface HealthDependencies {
  now(): number
  readinessChecks(): Promise<readonly HealthCheckResult[]>
}

const checkStateSchema = z.object({
  state: z.string(),
  name: z.string(),
  latencyMs: z.number().nullable().optional(),
  detail: z.string().nullable().optional(),
})

export function createHealthApi(dependencies: HealthDependencies) {
  const app = new Hono<ObservabilityEnv>()

  app.get('/health', (c) => {
    return c.json({ service: 'fieldrep-os-api', status: 'ok', at: dependencies.now() })
  })

  app.get('/health/ready', async (c) => {
    const rawChecks = await dependencies.readinessChecks()
    const parsed = z.array(checkStateSchema).safeParse(rawChecks)
    if (!parsed.success) {
      const rollup: HealthRollup = {
        state: 'unhealthy',
        checks: [
          {
            name: 'readiness_payload',
            state: 'unhealthy',
            latencyMs: null,
            detail: 'unreadable check payload',
          },
        ],
      }
      return c.json({ status: rollup.state, checks: rollup.checks }, 503)
    }

    const normalized: HealthCheckResult[] = parsed.data.map((check) => ({
      name: check.name,
      state: isServableHealthState(check.state) ? check.state : 'unhealthy',
      latencyMs: check.latencyMs ?? null,
      detail: check.detail ?? null,
    }))
    const rollup = rollupHealth(normalized)
    return c.json(
      { status: rollup.state, checks: rollup.checks },
      rollup.state === 'unhealthy' ? 503 : 200,
    )
  })

  return app
}
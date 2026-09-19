import type {
  AuthContext,
  BackupDrillRecord,
  LifecycleEvent,
  RetentionPolicy,
} from '@fieldrep/domain'
import { describe, expect, it } from 'vitest'

import {
  createDataLifecycleApi,
  type DataLifecycleDependencies,
  type DataLifecycleGateway,
  type DrillGatewayResult,
} from './data-lifecycle-api'

const DAY = 86_400_000

function authContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'platform-admin-1',
    membershipId: 'membership-pa1',
    companyId: 'company-1',
    workspaceId: 'workspace-a',
    roleKeys: ['platform_admin'],
    permissions: ['companies.read', 'companies.manage', 'security.read', 'platform.settings.manage'],
    scopes: [{ type: 'platform' }],
    ...overrides,
  }
}

const drill: BackupDrillRecord = {
  id: 'drill-1',
  scope: 'workspace',
  targetId: 'w1',
  backupReference: 'backup://2026-09',
  startedAtMs: 1_000,
  completedAtMs: null,
  result: null,
  verifiedBy: null,
  rpoMinutes: null,
  rtoMinutes: null,
  notes: null,
}

function lifecycleEvent(overrides: Partial<LifecycleEvent> = {}): LifecycleEvent {
  return {
    id: 'ev-1',
    action: 'suspend',
    companyId: 'c1',
    workspaceId: null,
    performedBy: 'platform-admin-1',
    reason: null,
    atMs: 1_000,
    ...overrides,
  }
}

function gateway(overrides: Partial<DataLifecycleGateway> = {}): DataLifecycleGateway {
  return {
    getRetentionPolicy: async () => null,
    upsertRetentionPolicy: async (_companyId, policy) => ({
      purgeAfterDays: policy.purgeAfterDays ?? 365,
    }),
    listLifecycleEvents: async () => [],
    recordLifecycleEvent: async (input) =>
      lifecycleEvent({ id: input.id, action: input.action, companyId: input.companyId, atMs: input.atMs }),
    listBackupDrills: async () => [drill],
    startDrill: async (input): Promise<DrillGatewayResult> => ({
      drill: { ...drill, id: input.id, scope: input.scope },
      outcome: 'started',
      reason: null,
    }),
    completeDrill: async (input): Promise<DrillGatewayResult> => ({
      drill: { ...drill, id: input.id, result: input.result, completedAtMs: input.completedAtMs },
      outcome: 'completed',
      reason: null,
    }),
    ...overrides,
  }
}

function dependencies(
  gw: DataLifecycleGateway,
  context: AuthContext | null = authContext(),
  now = 5_000,
): DataLifecycleDependencies {
  return {
    authContextResolver: { resolve: async () => context },
    dataLifecycle: () => gw,
    now: () => now,
  }
}

describe('retention policy API', () => {
  it('requires authentication', async () => {
    const app = createDataLifecycleApi(dependencies(gateway(), null))
    expect((await app.request('/platform/companies/c1/retention-policy')).status).toBe(401)
  })

  it('reports the default policy as an explicit source', async () => {
    const app = createDataLifecycleApi(dependencies(gateway()))
    const response = await app.request('/platform/companies/c1/retention-policy')
    expect(response.status).toBe(200)
    const body = (await response.json()) as { policy: RetentionPolicy; source: string }
    expect(body.policy.purgeAfterDays).toBe(365)
    expect(body.source).toBe('default')
  })

  it('reports a company-specific policy when one exists', async () => {
    const app = createDataLifecycleApi(
      dependencies(gateway({ getRetentionPolicy: async () => ({ purgeAfterDays: 90 }) })),
    )
    const body = (await (await app.request('/platform/companies/c1/retention-policy')).json()) as {
      policy: RetentionPolicy
      source: string
    }
    expect(body).toMatchObject({ policy: { purgeAfterDays: 90 }, source: 'company' })
  })

  it('requires companies.manage and enforces the 30-day floor', async () => {
    const forbidden = createDataLifecycleApi(
      dependencies(gateway(), authContext({ permissions: ['companies.read'] })),
    )
    expect(
      (
        await forbidden.request('/platform/companies/c1/retention-policy', {
          method: 'PUT',
          body: JSON.stringify({ purgeAfterDays: 90 }),
        })
      ).status,
    ).toBe(403)

    const app = createDataLifecycleApi(dependencies(gateway()))
    const tooShort = await app.request('/platform/companies/c1/retention-policy', {
      method: 'PUT',
      body: JSON.stringify({ purgeAfterDays: 10 }),
    })
    expect(tooShort.status).toBe(400)

    const ok = await app.request('/platform/companies/c1/retention-policy', {
      method: 'PUT',
      body: JSON.stringify({ purgeAfterDays: 180 }),
    })
    expect(ok.status).toBe(200)
    expect(((await ok.json()) as { policy: RetentionPolicy }).policy.purgeAfterDays).toBe(180)
  })
})

describe('lifecycle API', () => {
  it('replays the append-only ledger into the current subject', async () => {
    const app = createDataLifecycleApi(
      dependencies(
        gateway({
          listLifecycleEvents: async () => [
            lifecycleEvent({ id: 'ev-1', action: 'suspend', atMs: 1_000 }),
            lifecycleEvent({ id: 'ev-2', action: 'archive', atMs: 2_000 }),
          ],
        }),
      ),
    )
    const response = await app.request('/platform/companies/c1/lifecycle')
    expect(response.status).toBe(200)
    const body = (await response.json()) as { subject: { status: string; archivedAtMs: number | null } }
    expect(body.subject.status).toBe('archived')
    expect(body.subject.archivedAtMs).toBe(2_000)
  })

  it('refuses an action the replayed subject does not allow, with a reason', async () => {
    const app = createDataLifecycleApi(dependencies(gateway()))
    // Nothing archived yet → a purge request is impossible.
    const response = await app.request('/platform/companies/c1/lifecycle', {
      method: 'POST',
      body: JSON.stringify({ id: 'ev-9', action: 'request_purge' }),
    })
    expect(response.status).toBe(409)
    const body = (await response.json()) as { error: string; reason: string }
    expect(body.error).toBe('lifecycle_action_not_allowed')
    expect(body.reason).toBe('invalid_state')
  })

  it('blocks a purge behind retention and a legal hold (order of operations)', async () => {
    const archived = lifecycleEvent({
      id: 'ev-arch',
      action: 'archive',
      atMs: 5_000 - 10 * DAY,
    })
    const app = createDataLifecycleApi(
      dependencies(gateway({ listLifecycleEvents: async () => [archived] })),
    )
    const blocked = await app.request('/platform/companies/c1/lifecycle', {
      method: 'POST',
      body: JSON.stringify({ id: 'ev-p1', action: 'request_purge' }),
    })
    expect(blocked.status).toBe(409)
    expect(((await blocked.json()) as { reason: string }).reason).toBe('retention_not_expired')

    const held = createDataLifecycleApi(
      dependencies(
        gateway({
          listLifecycleEvents: async () => [
            lifecycleEvent({ id: 'ev-arch', action: 'archive', atMs: 5_000 - 400 * DAY }),
            lifecycleEvent({ id: 'ev-hold', action: 'place_legal_hold', atMs: 5_000 - 300 * DAY }),
          ],
        }),
      ),
    )
    const heldResponse = await held.request('/platform/companies/c1/lifecycle', {
      method: 'POST',
      body: JSON.stringify({ id: 'ev-p2', action: 'request_purge' }),
    })
    expect(heldResponse.status).toBe(409)
    expect(((await heldResponse.json()) as { reason: string }).reason).toBe('legal_hold_blocked')
  })

  it('records an allowed action and returns the resulting subject', async () => {
    const app = createDataLifecycleApi(dependencies(gateway()))
    const response = await app.request('/platform/companies/c1/lifecycle', {
      method: 'POST',
      body: JSON.stringify({ id: 'ev-1', action: 'suspend', reason: 'contract paused' }),
    })
    expect(response.status).toBe(201)
    const body = (await response.json()) as {
      subject: { status: string; suspendedAtMs: number | null }
      event: LifecycleEvent
    }
    expect(body.subject.status).toBe('suspended')
    expect(body.subject.suspendedAtMs).toBe(5_000)
    expect(body.event.id).toBe('ev-1')
  })

  it('requires companies.manage for lifecycle mutations', async () => {
    const app = createDataLifecycleApi(
      dependencies(gateway(), authContext({ permissions: ['companies.read'] })),
    )
    const response = await app.request('/platform/companies/c1/lifecycle', {
      method: 'POST',
      body: JSON.stringify({ id: 'ev-1', action: 'suspend' }),
    })
    expect(response.status).toBe(403)
  })
})

describe('backup drill API', () => {
  it('lists drills with the recoverability verdict', async () => {
    const app = createDataLifecycleApi(
      dependencies(
        gateway({
          listBackupDrills: async () => [
            { ...drill, completedAtMs: 5_000 - 5 * DAY, result: 'passed', rpoMinutes: 5, rtoMinutes: 30 },
          ],
        }),
      ),
    )
    const response = await app.request('/platform/backup-drills?scope=workspace')
    expect(response.status).toBe(200)
    const body = (await response.json()) as { drills: readonly BackupDrillRecord[]; recoverabilityProven: boolean }
    expect(body.drills).toHaveLength(1)
    expect(body.recoverabilityProven).toBe(true)
  })

  it('reports recoverability as unproven for a stale or failed drill', async () => {
    const app = createDataLifecycleApi(
      dependencies(
        gateway({
          listBackupDrills: async () => [
            { ...drill, completedAtMs: 5_000 - 200 * DAY, result: 'passed', rpoMinutes: 5, rtoMinutes: 30 },
          ],
        }),
      ),
    )
    const body = (await (await app.request('/platform/backup-drills')).json()) as {
      recoverabilityProven: boolean
    }
    expect(body.recoverabilityProven).toBe(false)

    const failed = createDataLifecycleApi(
      dependencies(
        gateway({
          listBackupDrills: async () => [
            { ...drill, completedAtMs: 5_000, result: 'failed' },
          ],
        }),
      ),
    )
    expect(
      ((await (await failed.request('/platform/backup-drills')).json()) as { recoverabilityProven: boolean })
        .recoverabilityProven,
    ).toBe(false)
  })

  it('starts a drill with 201 and rejects an invalid one with 400', async () => {
    const app = createDataLifecycleApi(dependencies(gateway()))
    const response = await app.request('/platform/backup-drills', {
      method: 'POST',
      body: JSON.stringify({
        id: 'drill-9',
        scope: 'control_plane',
        backupReference: 'backup://2026-09',
      }),
    })
    expect(response.status).toBe(201)
    expect(((await response.json()) as { drill: BackupDrillRecord }).drill.id).toBe('drill-9')

    const invalid = createDataLifecycleApi(
      dependencies(
        gateway({
          startDrill: async () => ({ drill: null, outcome: 'rejected', reason: 'invalid_drill' }),
        }),
      ),
    )
    const bad = await invalid.request('/platform/backup-drills', {
      method: 'POST',
      body: JSON.stringify({ id: '', scope: 'workspace', backupReference: 'b' }),
    })
    expect(bad.status).toBe(400)
  })

  it('completes a drill, mapping 404 and the metrics_required refusal', async () => {
    const app = createDataLifecycleApi(dependencies(gateway()))
    const response = await app.request('/platform/backup-drills/drill-1/complete', {
      method: 'POST',
      body: JSON.stringify({ result: 'passed', rpoMinutes: 5, rtoMinutes: 30 }),
    })
    expect(response.status).toBe(200)
    expect(((await response.json()) as { drill: BackupDrillRecord }).drill.result).toBe('passed')

    const missing = createDataLifecycleApi(
      dependencies(gateway({ completeDrill: async () => null })),
    )
    expect(
      (
        await missing.request('/platform/backup-drills/x/complete', {
          method: 'POST',
          body: JSON.stringify({ result: 'failed' }),
        })
      ).status,
    ).toBe(404)

    const noMetrics = createDataLifecycleApi(
      dependencies(
        gateway({
          completeDrill: async () => ({ drill, outcome: 'rejected', reason: 'metrics_required' }),
        }),
      ),
    )
    const refused = await noMetrics.request('/platform/backup-drills/drill-1/complete', {
      method: 'POST',
      body: JSON.stringify({ result: 'passed' }),
    })
    expect(refused.status).toBe(409)
    expect(((await refused.json()) as { reason: string }).reason).toBe('metrics_required')
  })

  it('restricts drill reads to security.read and writes to platform.settings.manage', async () => {
    const reader = createDataLifecycleApi(
      dependencies(gateway(), authContext({ permissions: ['companies.read'] })),
    )
    expect((await reader.request('/platform/backup-drills')).status).toBe(403)

    const writer = createDataLifecycleApi(
      dependencies(gateway(), authContext({ permissions: ['security.read'] })),
    )
    expect(
      (
        await writer.request('/platform/backup-drills', {
          method: 'POST',
          body: JSON.stringify({ id: 'd', scope: 'control_plane', backupReference: 'b' }),
        })
      ).status,
    ).toBe(403)
  })
})
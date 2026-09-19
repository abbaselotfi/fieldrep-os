import type {
  BackupDrillRecord,
  BackupScope,
  LifecycleAction,
  LifecycleEvent,
  LifecycleGuardResult,
  LifecycleSubject,
  RetentionPolicy,
} from '@fieldrep/domain'
import {
  DEFAULT_RETENTION_POLICY,
  isRecoverabilityProven,
  replayLifecycleSubject,
  validateLifecycleAction,
} from '@fieldrep/domain'
import { Hono } from 'hono'
import { z } from 'zod'

import {
  attachAuthContext,
  requirePermission,
  type AuthContextResolver,
  type AuthorizationEnv,
} from '../middleware/authorization'

/**
 * Data lifecycle & recovery API (P12-A3, SECURITY-THREAT-MODEL §29).
 *
 * Permission-scoped per PERMISSION-MATRIX §10:
 *  - retention policy / lifecycle reads    → `companies.read`
 *  - retention policy / lifecycle mutations → `companies.manage`
 *  - backup drill reads                     → `security.read`
 *  - backup drill start/complete            → `platform.settings.manage`
 *
 * The subject state is always replayed from the append-only ledger; a legal
 * hold blocks every destructive action and a purge requires expired retention.
 */

const retentionSchema = z.object({ purgeAfterDays: z.number().int().min(30) })

const lifecycleActionSchema = z.object({
  id: z.string().min(1),
  action: z.enum([
    'suspend',
    'resume',
    'archive',
    'restore',
    'request_purge',
    'complete_purge',
    'place_legal_hold',
    'release_legal_hold',
  ]),
  workspaceId: z.string().min(1).optional(),
  reason: z.string().min(1).optional(),
})

const startDrillSchema = z.object({
  id: z.string().min(1),
  scope: z.enum(['control_plane', 'workspace']),
  targetId: z.string().min(1).optional(),
  backupReference: z.string().min(1),
  notes: z.string().min(1).optional(),
})

const completeDrillSchema = z.object({
  result: z.enum(['passed', 'failed']),
  rpoMinutes: z.number().int().min(0).optional(),
  rtoMinutes: z.number().int().min(0).optional(),
  notes: z.string().min(1).optional(),
})

/** How long a passed drill keeps proving recoverability. */
const RECOVERABILITY_FRESHNESS_DAYS = 90

/** The guarded drill result shape the wiring/respository hands to the API. */
export interface DrillGatewayResult {
  drill: BackupDrillRecord | null
  outcome: 'started' | 'completed' | 'rejected'
  reason: 'invalid_drill' | 'invalid_state' | 'metrics_required' | null
}

export interface DataLifecycleDependencies {
  authContextResolver: AuthContextResolver
  dataLifecycle(): DataLifecycleGateway
  now(): number
}

export interface DataLifecycleGateway {
  getRetentionPolicy(companyId: string): Promise<RetentionPolicy | null>
  upsertRetentionPolicy(
    companyId: string,
    policy: { purgeAfterDays?: number | undefined },
    updatedBy: string | undefined,
  ): Promise<RetentionPolicy>
  listLifecycleEvents(
    companyId: string,
    workspaceId?: string | undefined,
  ): Promise<readonly LifecycleEvent[]>
  recordLifecycleEvent(input: {
    id: string
    action: LifecycleAction
    companyId: string
    workspaceId?: string | undefined
    performedBy?: string | undefined
    reason?: string | undefined
    atMs: number
  }): Promise<LifecycleEvent | null>
  listBackupDrills(scope?: BackupScope | undefined): Promise<readonly BackupDrillRecord[]>
  startDrill(input: {
    id: string
    scope: BackupScope
    targetId?: string | undefined
    backupReference: string
    performedBy?: string | undefined
    notes?: string | undefined
  }): Promise<DrillGatewayResult>
  completeDrill(input: {
    id: string
    result: 'passed' | 'failed'
    completedAtMs: number
    verifiedBy?: string | undefined
    rpoMinutes?: number | undefined
    rtoMinutes?: number | undefined
    notes?: string | undefined
  }): Promise<DrillGatewayResult | null>
}

export function createDataLifecycleApi(dependencies: DataLifecycleDependencies) {
  const app = new Hono<AuthorizationEnv>()

  app.use('*', attachAuthContext(dependencies.authContextResolver))

  app.get(
    '/platform/companies/:companyId/retention-policy',
    requirePermission('companies.read'),
    async (c) => {
      const stored = await dependencies
        .dataLifecycle()
        .getRetentionPolicy(c.req.param('companyId'))
      return c.json({
        policy: stored ?? DEFAULT_RETENTION_POLICY,
        source: stored === null ? 'default' : 'company',
      })
    },
  )

  app.put(
    '/platform/companies/:companyId/retention-policy',
    requirePermission('companies.manage'),
    async (c) => {
      const parsed = retentionSchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) return c.json({ error: 'invalid_retention_policy' }, 400)
      const auth = c.get('authContext')
      const policy = await dependencies
        .dataLifecycle()
        .upsertRetentionPolicy(c.req.param('companyId'), parsed.data, auth.userId)
      return c.json({ policy })
    },
  )

  app.get(
    '/platform/companies/:companyId/lifecycle',
    requirePermission('companies.read'),
    async (c) => {
      const workspaceId = c.req.query('workspaceId')
      const events = await dependencies
        .dataLifecycle()
        .listLifecycleEvents(
          c.req.param('companyId'),
          workspaceId === undefined || workspaceId === '' ? undefined : workspaceId,
        )
      const subject: LifecycleSubject = replayLifecycleSubject(events)
      return c.json({ subject, events })
    },
  )

  app.post(
    '/platform/companies/:companyId/lifecycle',
    requirePermission('companies.manage'),
    async (c) => {
      const parsed = lifecycleActionSchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) return c.json({ error: 'invalid_lifecycle_action' }, 400)
      const gateway = dependencies.dataLifecycle()
      const companyId = c.req.param('companyId')
      const events = await gateway.listLifecycleEvents(
        companyId,
        parsed.data.workspaceId === undefined ? undefined : parsed.data.workspaceId,
      )
      const subject = replayLifecycleSubject(events)
      const guard: LifecycleGuardResult = validateLifecycleAction(
        subject,
        parsed.data.action,
        dependencies.now(),
      )
      if (guard !== 'ok') {
        return c.json({ error: 'lifecycle_action_not_allowed', reason: guard }, 409)
      }
      const auth = c.get('authContext')
      const event = await gateway.recordLifecycleEvent({
        id: parsed.data.id,
        action: parsed.data.action,
        companyId,
        workspaceId: parsed.data.workspaceId,
        performedBy: auth.userId,
        reason: parsed.data.reason,
        atMs: dependencies.now(),
      })
      if (event === null) return c.json({ error: 'invalid_lifecycle_action' }, 400)
      return c.json({ subject: replayLifecycleSubject([...events, event]), event }, 201)
    },
  )

  app.get(
    '/platform/backup-drills',
    requirePermission('security.read'),
    async (c) => {
      const scopeParam = c.req.query('scope')
      const scope = scopeParam === 'control_plane' || scopeParam === 'workspace' ? scopeParam : undefined
      const drills = await dependencies.dataLifecycle().listBackupDrills(scope)
      return c.json({
        drills,
        recoverabilityProven: isRecoverabilityProven(drills, dependencies.now(), RECOVERABILITY_FRESHNESS_DAYS),
      })
    },
  )

  app.post(
    '/platform/backup-drills',
    requirePermission('platform.settings.manage'),
    async (c) => {
      const parsed = startDrillSchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) return c.json({ error: 'invalid_backup_drill' }, 400)
      const auth = c.get('authContext')
      const result = await dependencies.dataLifecycle().startDrill({
        ...parsed.data,
        performedBy: auth.userId,
      })
      if (result.outcome === 'rejected' || result.drill === null) {
        return c.json({ error: 'invalid_backup_drill', reason: result.reason }, 400)
      }
      return c.json({ drill: result.drill }, 201)
    },
  )

  app.post(
    '/platform/backup-drills/:drillId/complete',
    requirePermission('platform.settings.manage'),
    async (c) => {
      const parsed = completeDrillSchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) return c.json({ error: 'invalid_drill_completion' }, 400)
      const auth = c.get('authContext')
      const result = await dependencies.dataLifecycle().completeDrill({
        id: c.req.param('drillId'),
        result: parsed.data.result,
        completedAtMs: dependencies.now(),
        verifiedBy: auth.userId,
        rpoMinutes: parsed.data.rpoMinutes,
        rtoMinutes: parsed.data.rtoMinutes,
        notes: parsed.data.notes,
      })
      if (result === null) return c.json({ error: 'backup_drill_not_found' }, 404)
      if (result.outcome === 'rejected') {
        return c.json({ error: 'drill_completion_not_allowed', reason: result.reason }, 409)
      }
      return c.json({ drill: result.drill })
    },
  )

  return app
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}
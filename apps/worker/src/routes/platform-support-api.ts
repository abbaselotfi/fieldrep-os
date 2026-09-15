import type {
  PlatformUsageOverview,
  SupportAccessGrant,
  SupportAccessGrantFilter,
} from '@fieldrep/domain'
import { SUPPORT_ACCESS_DECISION_EVENTS } from '@fieldrep/domain'
import { Hono } from 'hono'
import { z } from 'zod'

import {
  attachAuthContext,
  requirePermission,
  type AuthContextResolver,
  type AuthorizationEnv,
} from '../middleware/authorization'

/**
 * Platform support-access & analytics API (P10-A3).
 *
 * Governed, scoped, auditable support/data-access workflows per
 * PERMISSION-MATRIX §10 ("Such access must be governed, scoped, and
 * auditable"):
 *  - usage analytics          → `platform.settings.read`
 *  - grant reads              → `security.read`
 *  - grant lifecycle actions  → `support_access.start`
 * Every lifecycle transition records a platform audit event.
 */

const grantQuerySchema = z.object({
  workspaceId: z.string().min(1).optional(),
  status: z.enum(['requested', 'approved', 'denied', 'revoked', 'expired']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

const createGrantSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  reason: z.string().min(1),
})

const decisionSchema = z.object({
  decision: z.enum(['approve', 'deny', 'revoke', 'expire']),
  durationMs: z.number().int().min(1).optional(),
})

export interface PlatformSupportDependencies {
  authContextResolver: AuthContextResolver
  platformSupport(): PlatformSupportGateway
}

export interface PlatformSupportGateway {
  getUsageOverview(): Promise<PlatformUsageOverview>
  listSupportAccessGrants(
    filters: SupportAccessGrantFilter,
  ): Promise<readonly SupportAccessGrant[]>
  createSupportAccessGrant(input: {
    id: string
    workspaceId: string
    reason: string
    requestedByUserId?: string | undefined
  }): Promise<SupportAccessGrant>
  decideSupportAccessGrant(
    id: string,
    input: {
      decision: 'approve' | 'deny' | 'revoke' | 'expire'
      decidedByUserId?: string | undefined
      durationMs?: number | undefined
    },
  ): Promise<{ grant: SupportAccessGrant; transition: 'applied' | 'rejected' } | null>
  recordAuditEvent(input: {
    id: string
    actorUserId?: string | undefined
    actionKey: string
    targetType: string
    targetId?: string | undefined
    workspaceId?: string | undefined
  }): Promise<boolean>
}

export function createPlatformSupportApi(dependencies: PlatformSupportDependencies) {
  const app = new Hono<AuthorizationEnv>()

  app.use('*', attachAuthContext(dependencies.authContextResolver))

  app.get('/platform/analytics/usage', requirePermission('platform.settings.read'), async (c) => {
    const overview = await dependencies.platformSupport().getUsageOverview()
    return c.json({ overview })
  })

  app.get(
    '/platform/support-access-grants',
    requirePermission('security.read'),
    async (c) => {
      const parsed = grantQuerySchema.safeParse(c.req.query())
      if (!parsed.success) return c.json({ error: 'invalid_grant_filter' }, 400)
      const filters: SupportAccessGrantFilter = { limit: parsed.data.limit }
      if (parsed.data.workspaceId !== undefined) filters.workspaceId = parsed.data.workspaceId
      if (parsed.data.status !== undefined) filters.status = parsed.data.status
      const grants = await dependencies.platformSupport().listSupportAccessGrants(filters)
      return c.json({ grants })
    },
  )

  app.post(
    '/platform/support-access-grants',
    requirePermission('support_access.start'),
    async (c) => {
      const parsed = createGrantSchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) return c.json({ error: 'invalid_support_access_grant' }, 400)
      const auth = c.get('authContext')
      const gateway = dependencies.platformSupport()
      const grant = await gateway.createSupportAccessGrant({
        id: parsed.data.id,
        workspaceId: parsed.data.workspaceId,
        reason: parsed.data.reason,
        requestedByUserId: auth?.userId,
      })
      await gateway.recordAuditEvent({
        id: `audit-${grant.id}-requested`,
        actorUserId: auth?.userId,
        actionKey: 'support_access.requested',
        targetType: 'workspace',
        targetId: grant.workspaceId,
        workspaceId: grant.workspaceId,
      })
      return c.json({ grant }, 201)
    },
  )

  app.post(
    '/platform/support-access-grants/:grantId/decision',
    requirePermission('support_access.start'),
    async (c) => {
      const parsed = decisionSchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) return c.json({ error: 'invalid_support_access_decision' }, 400)
      const auth = c.get('authContext')
      const gateway = dependencies.platformSupport()
      const result = await gateway.decideSupportAccessGrant(c.req.param('grantId'), {
        decision: parsed.data.decision,
        decidedByUserId: auth?.userId,
        durationMs: parsed.data.durationMs,
      })
      if (result === null) return c.json({ error: 'grant_not_found' }, 404)
      if (result.transition === 'rejected') {
        return c.json({ error: 'support_access_transition_invalid' }, 409)
      }
      await gateway.recordAuditEvent({
        id: `audit-${result.grant.id}-${parsed.data.decision}`,
        actorUserId: auth?.userId,
        actionKey: SUPPORT_ACCESS_DECISION_EVENTS[parsed.data.decision],
        targetType: 'workspace',
        targetId: result.grant.workspaceId,
        workspaceId: result.grant.workspaceId,
      })
      return c.json({ grant: result.grant })
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
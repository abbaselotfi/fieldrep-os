import type {
  AuditActionSummary,
  AuditEvent,
  AuditEventFilter,
  WorkspaceId,
} from '@fieldrep/domain'
import { buildAuditActionSummary } from '@fieldrep/domain'
import { Hono } from 'hono'
import { z } from 'zod'

import {
  attachAuthContext,
  requireWorkspacePermission,
  type AuthContextResolver,
  type AuthorizationEnv,
} from '../middleware/authorization'

/**
 * Audit & admin-report API (P9-A5).
 *
 * Permission-scoped per PERMISSION-MATRIX §8:
 *  - audit event reads  → `audit.read.workspace`
 *  - admin summary      → `reports.read.workspace`
 * Cross-workspace access is rejected before any repository resolution.
 */

const auditQuerySchema = z.object({
  actorUserId: z.string().min(1).optional(),
  entityType: z.string().min(1).optional(),
  entityId: z.string().min(1).optional(),
  actionKey: z.string().min(1).optional(),
  fromMs: z.coerce.number().int().min(0).optional(),
  toMs: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export interface AuditAdminDependencies {
  authContextResolver: AuthContextResolver
  auditForWorkspace(workspaceId: WorkspaceId): Promise<AuditAdminGateway>
}

export interface AuditAdminGateway {
  listAuditEvents(filters: AuditEventFilter): Promise<readonly AuditEvent[]>
}

export function createAuditAdminApi(dependencies: AuditAdminDependencies) {
  const app = new Hono<AuthorizationEnv>()

  app.use('/workspaces/*', attachAuthContext(dependencies.authContextResolver))

  app.get(
    '/workspaces/:workspaceId/audit-events',
    requireWorkspacePermission('audit.read.workspace'),
    async (c) => {
      const parsed = auditQuerySchema.safeParse(c.req.query())
      if (!parsed.success) return c.json({ error: 'invalid_audit_filter' }, 400)

      const filters: AuditEventFilter = { limit: parsed.data.limit }
      if (parsed.data.actorUserId !== undefined) filters.actorUserId = parsed.data.actorUserId
      if (parsed.data.entityType !== undefined) filters.entityType = parsed.data.entityType
      if (parsed.data.entityId !== undefined) filters.entityId = parsed.data.entityId
      if (parsed.data.actionKey !== undefined) filters.actionKey = parsed.data.actionKey
      if (parsed.data.fromMs !== undefined) filters.fromMs = parsed.data.fromMs
      if (parsed.data.toMs !== undefined) filters.toMs = parsed.data.toMs

      const gateway = await dependencies.auditForWorkspace(c.req.param('workspaceId'))
      const events = await gateway.listAuditEvents(filters)
      return c.json({ events })
    },
  )

  app.get(
    '/workspaces/:workspaceId/admin/report/audit-summary',
    requireWorkspacePermission('reports.read.workspace'),
    async (c) => {
      const parsed = auditQuerySchema
        .omit({ limit: true })
        .safeParse(c.req.query())
      if (!parsed.success) return c.json({ error: 'invalid_audit_filter' }, 400)

      const filters: AuditEventFilter = { limit: 200 }
      if (parsed.data.actorUserId !== undefined) filters.actorUserId = parsed.data.actorUserId
      if (parsed.data.entityType !== undefined) filters.entityType = parsed.data.entityType
      if (parsed.data.actionKey !== undefined) filters.actionKey = parsed.data.actionKey
      if (parsed.data.fromMs !== undefined) filters.fromMs = parsed.data.fromMs
      if (parsed.data.toMs !== undefined) filters.toMs = parsed.data.toMs

      const gateway = await dependencies.auditForWorkspace(c.req.param('workspaceId'))
      const events = await gateway.listAuditEvents(filters)
      const summary: AuditActionSummary[] = buildAuditActionSummary(events)
      return c.json({ summary })
    },
  )

  return app
}
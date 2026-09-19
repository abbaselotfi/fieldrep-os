import type {
  AuditActionSummary,
  AuditEvent,
  AuditEventFilter,
  WorkspaceId,
} from '@fieldrep/domain'
import { WORKLOAD_BUDGETS, buildAuditActionSummary, resolvePageWindow } from '@fieldrep/domain'
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

/**
 * Page-window budget (P12-A4): the `limit`/`pageSize` ceiling is re-derived by
 * the domain guard, so an oversized request is clamped to the surface budget
 * rather than trusted — bounded work per request (§28).
 */
const auditQuerySchema = z.object({
  actorUserId: z.string().min(1).optional(),
  entityType: z.string().min(1).optional(),
  entityId: z.string().min(1).optional(),
  actionKey: z.string().min(1).optional(),
  fromMs: z.coerce.number().int().min(0).optional(),
  toMs: z.coerce.number().int().min(0).optional(),
  page: z.coerce.number().int().optional(),
  pageSize: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().optional(),
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

      const window = resolvePageWindow(
        {
          page: parsed.data.page ?? null,
          pageSize: parsed.data.pageSize ?? parsed.data.limit ?? null,
        },
        WORKLOAD_BUDGETS.audit,
      )

      const filters: AuditEventFilter = { limit: window.pageSize }
      if (parsed.data.actorUserId !== undefined) filters.actorUserId = parsed.data.actorUserId
      if (parsed.data.entityType !== undefined) filters.entityType = parsed.data.entityType
      if (parsed.data.entityId !== undefined) filters.entityId = parsed.data.entityId
      if (parsed.data.actionKey !== undefined) filters.actionKey = parsed.data.actionKey
      if (parsed.data.fromMs !== undefined) filters.fromMs = parsed.data.fromMs
      if (parsed.data.toMs !== undefined) filters.toMs = parsed.data.toMs

      const gateway = await dependencies.auditForWorkspace(c.req.param('workspaceId'))
      const events = await gateway.listAuditEvents(filters)
      return c.json({ events, page: window })
    },
  )

  app.get(
    '/workspaces/:workspaceId/admin/report/audit-summary',
    requireWorkspacePermission('reports.read.workspace'),
    async (c) => {
      const parsed = auditQuerySchema
        .omit({ limit: true, page: true, pageSize: true })
        .safeParse(c.req.query())
      if (!parsed.success) return c.json({ error: 'invalid_audit_filter' }, 400)

      // The summary is a bounded projection: never more than the surface budget.
      const filters: AuditEventFilter = { limit: WORKLOAD_BUDGETS.audit.maxPageSize }
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
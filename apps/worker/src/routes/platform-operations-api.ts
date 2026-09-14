import type {
  PlatformAuditEvent,
  PlatformAuditEventFilter,
  WorkspaceId,
  WorkspaceDataRoute,
} from '@fieldrep/domain'
import { buildAuditActionSummary, validateRouteStatusChange } from '@fieldrep/domain'
import { Hono } from 'hono'
import { z } from 'zod'

import {
  attachAuthContext,
  requirePermission,
  type AuthContextResolver,
  type AuthorizationEnv,
} from '../middleware/authorization'

/**
 * Platform operations API (P10-A2).
 *
 * Platform audit center + workspace data-route registry, permission-scoped per
 * PERMISSION-MATRIX §10:
 *  - audit reads/summary  → `audit.read.all`
 *  - data-route reads     → `database_routes.read`
 *  - data-route writes    → `database_routes.manage`
 */

const auditQuerySchema = z.object({
  companyId: z.string().min(1).optional(),
  workspaceId: z.string().min(1).optional(),
  actorUserId: z.string().min(1).optional(),
  actionKey: z.string().min(1).optional(),
  targetType: z.string().min(1).optional(),
  fromMs: z.coerce.number().int().min(0).optional(),
  toMs: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

const upsertRouteSchema = z.object({
  storeType: z.enum(['d1', 'service', 'sql', 'other']),
  storeIdentifier: z.string().min(1),
  status: z.enum(['active', 'maintenance', 'disabled']),
  schemaVersion: z.number().int().min(1),
})

export interface PlatformOperationsDependencies {
  authContextResolver: AuthContextResolver
  platformOperations(): PlatformOperationsGateway
}

export interface PlatformOperationsGateway {
  listAuditEvents(filters: PlatformAuditEventFilter): Promise<readonly PlatformAuditEvent[]>
  listDataRoutes(): Promise<readonly WorkspaceDataRoute[]>
  getDataRoute(workspaceId: WorkspaceId): Promise<WorkspaceDataRoute | null>
  upsertDataRoute(input: {
    workspaceId: WorkspaceId
    storeType: 'd1' | 'service' | 'sql' | 'other'
    storeIdentifier: string
    status: 'active' | 'maintenance' | 'disabled'
    schemaVersion: number
  }): Promise<WorkspaceDataRoute>
}

function buildAuditFilters(
  data: Omit<PlatformAuditEventFilter, 'limit'>,
  limit: number,
): PlatformAuditEventFilter {
  return { ...data, limit }
}

export function createPlatformOperationsApi(dependencies: PlatformOperationsDependencies) {
  const app = new Hono<AuthorizationEnv>()

  app.use('*', attachAuthContext(dependencies.authContextResolver))

  app.get('/platform/audit-events', requirePermission('audit.read.all'), async (c) => {
    const parsed = auditQuerySchema.safeParse(c.req.query())
    if (!parsed.success) return c.json({ error: 'invalid_audit_filter' }, 400)
    const events = await dependencies
      .platformOperations()
      .listAuditEvents(buildAuditFilters(parsed.data, parsed.data.limit))
    return c.json({ events })
  })

  app.get(
    '/platform/audit-events/report/summary',
    requirePermission('audit.read.all'),
    async (c) => {
      const parsed = auditQuerySchema
        .extend({ limit: z.coerce.number().int().min(1).max(200).default(200) })
        .safeParse(c.req.query())
      if (!parsed.success) return c.json({ error: 'invalid_audit_filter' }, 400)
      const events = await dependencies
        .platformOperations()
        .listAuditEvents(buildAuditFilters(parsed.data, parsed.data.limit))
      // Reuse the deterministic workspace-admin summary projection; platform
      // events map `target_type` onto the shared `entityType` dimension.
      const summary = buildAuditActionSummary(
        events.map((event) => ({
          id: event.id,
          actorUserId: event.actorUserId,
          actionKey: event.actionKey,
          entityType: event.targetType,
          entityId: event.targetId,
          metadata: event.metadata,
          occurredAt: event.occurredAt,
        })),
      )
      return c.json({ summary })
    },
  )

  app.get('/platform/data-routes', requirePermission('database_routes.read'), async (c) => {
    const routes = await dependencies.platformOperations().listDataRoutes()
    return c.json({ routes })
  })

  app.get(
    '/platform/data-routes/:workspaceId',
    requirePermission('database_routes.read'),
    async (c) => {
      const route = await dependencies
        .platformOperations()
        .getDataRoute(c.req.param('workspaceId'))
      if (route === null) return c.json({ error: 'route_not_found' }, 404)
      return c.json({ route })
    },
  )

  app.put(
    '/platform/data-routes/:workspaceId',
    requirePermission('database_routes.manage'),
    async (c) => {
      const parsed = upsertRouteSchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) return c.json({ error: 'invalid_data_route' }, 400)

      const gateway = dependencies.platformOperations()
      const workspaceId = c.req.param('workspaceId')
      const existing = await gateway.getDataRoute(workspaceId)
      if (
        existing !== null &&
        validateRouteStatusChange(existing.status, parsed.data.status) === 'invalid_transition'
      ) {
        return c.json({ error: 'route_transition_invalid' }, 409)
      }

      const route = await gateway.upsertDataRoute({
        workspaceId,
        storeType: parsed.data.storeType,
        storeIdentifier: parsed.data.storeIdentifier,
        status: parsed.data.status,
        schemaVersion: parsed.data.schemaVersion,
      })
      return c.json({ route }, existing === null ? 201 : 200)
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
import type {
  CalendarClosure,
  CreateCalendarClosureInput,
  TargetsPolicy,
  WorkspaceId,
} from '@fieldrep/domain'
import { Hono } from 'hono'
import { z } from 'zod'

import {
  attachAuthContext,
  requireWorkspacePermission,
  type AuthContextResolver,
  type AuthorizationEnv,
} from '../middleware/authorization'

/**
 * Calendar admin API (P9-A4) — working-calendar config, closures
 * (holidays/events) and targets policy administration.
 *
 * Permission-scoped per PERMISSION-MATRIX §8:
 *  - calendar config  → `calendar.manage.workspace`
 *  - closures         → `holidays.manage.workspace`
 *  - targets policy   → `targets.manage.workspace`
 */

const canonicalDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u)

const updateCalendarConfigSchema = z
  .object({
    timezone: z.string().min(1).optional(),
    workingWeekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  })
  .refine((value) => Object.keys(value).length > 0)

const createClosureSchema = z.object({
  id: z.string().min(1),
  level: z.enum(['company', 'workspace']),
  canonicalDate: canonicalDateSchema,
  label: z.string().min(1),
})

const updateTargetsPolicySchema = z
  .object({
    classFrequency: z.record(z.string(), z.number()).optional(),
    defaultDailyTarget: z.number().int().min(0).optional(),
    maxDailyVisits: z.number().int().min(0).optional(),
  })
  .refine((value) => Object.keys(value).length > 0)

export interface CalendarAdminDependencies {
  authContextResolver: AuthContextResolver
  adminForWorkspace(workspaceId: WorkspaceId): Promise<CalendarAdminGateway>
}

export interface CalendarAdminGateway {
  getWorkingCalendar(): Promise<{
    timezone: string
    workingWeekdays: readonly number[]
    updatedAt: string
  }>
  updateWorkingCalendar(patch: {
    workingWeekdays?: readonly number[]
    timezone?: string
    updatedByUserId?: string
  }): Promise<{ timezone: string; workingWeekdays: readonly number[]; updatedAt: string }>
  listClosures(fromDate: string, toDate: string): Promise<readonly CalendarClosure[]>
  createClosure(input: CreateCalendarClosureInput): Promise<CalendarClosure>
  deleteClosure(closureId: string): Promise<boolean>
  getTargetsPolicy(): Promise<TargetsPolicy>
  updateTargetsPolicy(patch: Partial<TargetsPolicy>, updatedByUserId: string): Promise<TargetsPolicy>
}

export function createCalendarAdminApi(dependencies: CalendarAdminDependencies) {
  const app = new Hono<AuthorizationEnv>()

  app.use('/workspaces/*', attachAuthContext(dependencies.authContextResolver))

  app.get(
    '/workspaces/:workspaceId/calendar-config',
    requireWorkspacePermission('calendar.manage.workspace'),
    async (c) => {
      const gateway = await dependencies.adminForWorkspace(c.req.param('workspaceId'))
      return c.json({ config: await gateway.getWorkingCalendar() })
    },
  )

  app.put(
    '/workspaces/:workspaceId/calendar-config',
    requireWorkspacePermission('calendar.manage.workspace'),
    async (c) => {
      const parsed = updateCalendarConfigSchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) return c.json({ error: 'invalid_calendar_config' }, 400)
      const authContext = c.get('authContext')
      const gateway = await dependencies.adminForWorkspace(c.req.param('workspaceId'))
      const patch: { timezone?: string; workingWeekdays?: readonly number[] } = {}
      if (parsed.data.timezone !== undefined) patch.timezone = parsed.data.timezone
      if (parsed.data.workingWeekdays !== undefined) patch.workingWeekdays = parsed.data.workingWeekdays
      const config = await gateway.updateWorkingCalendar({
        ...patch,
        updatedByUserId: authContext.userId,
      })
      return c.json({ config })
    },
  )

  app.get(
    '/workspaces/:workspaceId/closures',
    requireWorkspacePermission('holidays.manage.workspace'),
    async (c) => {
      const from = canonicalDateSchema.safeParse(c.req.query('from'))
      const to = canonicalDateSchema.safeParse(c.req.query('to'))
      if (!from.success || !to.success || from.data > to.data) {
        return c.json({ error: 'invalid_closure_range' }, 400)
      }
      const gateway = await dependencies.adminForWorkspace(c.req.param('workspaceId'))
      return c.json({ closures: await gateway.listClosures(from.data, to.data) })
    },
  )

  app.post(
    '/workspaces/:workspaceId/closures',
    requireWorkspacePermission('holidays.manage.workspace'),
    async (c) => {
      const parsed = createClosureSchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) return c.json({ error: 'invalid_closure' }, 400)
      const authContext = c.get('authContext')
      const gateway = await dependencies.adminForWorkspace(c.req.param('workspaceId'))
      const closure = await gateway.createClosure({
        id: parsed.data.id,
        level: parsed.data.level,
        canonicalDate: parsed.data.canonicalDate,
        label: parsed.data.label,
        createdByUserId: authContext.userId,
      })
      return c.json({ closure }, 201)
    },
  )

  app.delete(
    '/workspaces/:workspaceId/closures/:closureId',
    requireWorkspacePermission('holidays.manage.workspace'),
    async (c) => {
      const gateway = await dependencies.adminForWorkspace(c.req.param('workspaceId'))
      const deleted = await gateway.deleteClosure(c.req.param('closureId'))
      if (!deleted) return c.json({ error: 'closure_not_found' }, 404)
      return c.body(null, 204)
    },
  )

  app.get(
    '/workspaces/:workspaceId/targets-policy',
    requireWorkspacePermission('targets.manage.workspace'),
    async (c) => {
      const gateway = await dependencies.adminForWorkspace(c.req.param('workspaceId'))
      return c.json({ policy: await gateway.getTargetsPolicy() })
    },
  )

  app.put(
    '/workspaces/:workspaceId/targets-policy',
    requireWorkspacePermission('targets.manage.workspace'),
    async (c) => {
      const parsed = updateTargetsPolicySchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) return c.json({ error: 'invalid_targets_policy' }, 400)
      const authContext = c.get('authContext')
      const gateway = await dependencies.adminForWorkspace(c.req.param('workspaceId'))
      const policyPatch: Partial<TargetsPolicy> = {}
      if (parsed.data.classFrequency !== undefined) policyPatch.classFrequency = parsed.data.classFrequency
      if (parsed.data.defaultDailyTarget !== undefined) policyPatch.defaultDailyTarget = parsed.data.defaultDailyTarget
      if (parsed.data.maxDailyVisits !== undefined) policyPatch.maxDailyVisits = parsed.data.maxDailyVisits
      const policy = await gateway.updateTargetsPolicy(policyPatch, authContext.userId)
      return c.json({ policy })
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

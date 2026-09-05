import type {
  CustomerId,
  PlanEntry,
  PlanEntryId,
  PlanEntrySource,
  PlanningCycleId,
  RouteId,
  UserId,
  WorkspaceId,
} from '@fieldrep/domain'
import { Hono, type Context } from 'hono'
import { z } from 'zod'

import {
  attachAuthContext,
  requireWorkspacePermission,
  type AuthContextResolver,
  type AuthorizationEnv,
} from '../middleware/authorization'

export interface CreatePlanInput {
  id: PlanEntryId
  ownerUserId: UserId
  planningCycleId: PlanningCycleId
  customerId: CustomerId
  planDate: string
  routeId?: RouteId
  source?: PlanEntrySource
}

export interface UpdatePlanInput {
  planningCycleId?: PlanningCycleId
  customerId?: CustomerId
  planDate?: string
  routeId?: RouteId | null
}

export interface PlanApiRepository {
  listEntries(
    ownerUserId: UserId,
    fromDate: string,
    toDate: string,
    planningCycleId?: PlanningCycleId,
  ): Promise<PlanEntry[]>
  getEntry(ownerUserId: UserId, planEntryId: PlanEntryId): Promise<PlanEntry | null>
  createEntry(input: CreatePlanInput): Promise<PlanEntry>
  updateEntry(
    ownerUserId: UserId,
    planEntryId: PlanEntryId,
    patch: UpdatePlanInput,
  ): Promise<PlanEntry | null>
  cancelEntry(ownerUserId: UserId, planEntryId: PlanEntryId): Promise<boolean>
}

export interface PlanApiDependencies {
  authContextResolver: AuthContextResolver
  repositoryForWorkspace(workspaceId: WorkspaceId): Promise<PlanApiRepository>
}

const canonicalDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine(isCanonicalDate)

const planRangeSchema = z.object({
  from: canonicalDateSchema,
  to: canonicalDateSchema,
  cycleId: z.string().min(1).optional(),
})

const createPlanSchema = z.object({
  id: z.string().min(1),
  planningCycleId: z.string().min(1),
  customerId: z.string().min(1),
  planDate: canonicalDateSchema,
  routeId: z.string().min(1).optional(),
  source: z.enum(['manual', 'suggested', 'imported']).optional(),
})

const updatePlanSchema = z
  .object({
    planningCycleId: z.string().min(1).optional(),
    customerId: z.string().min(1).optional(),
    planDate: canonicalDateSchema.optional(),
    routeId: z.string().min(1).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0)

export function createPlanApi(dependencies: PlanApiDependencies) {
  const app = new Hono<AuthorizationEnv>()

  app.use('/workspaces/*', attachAuthContext(dependencies.authContextResolver))

  app.get(
    '/workspaces/:workspaceId/plans',
    requireWorkspacePermission('plans.read.own'),
    async (c) => {
      const parsed = planRangeSchema.safeParse(c.req.query())
      if (!parsed.success || parsed.data.from > parsed.data.to) {
        return c.json({ error: 'invalid_plan_range' }, 400)
      }

      const authContext = c.get('authContext')
      const repository = await dependencies.repositoryForWorkspace(c.req.param('workspaceId'))
      const entries = await repository.listEntries(
        authContext.userId,
        parsed.data.from,
        parsed.data.to,
        parsed.data.cycleId,
      )
      return c.json({ entries })
    },
  )

  app.post(
    '/workspaces/:workspaceId/plans',
    requireWorkspacePermission('plans.create.own'),
    async (c) => {
      const parsed = createPlanSchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) {
        return c.json({ error: 'invalid_plan_entry' }, 400)
      }

      const authContext = c.get('authContext')
      const repository = await dependencies.repositoryForWorkspace(c.req.param('workspaceId'))

      try {
        const entry = await repository.createEntry({
          ...parsed.data,
          ownerUserId: authContext.userId,
        })
        return c.json({ entry }, 201)
      } catch (error) {
        return planWriteError(c, error)
      }
    },
  )

  app.patch(
    '/workspaces/:workspaceId/plans/:planEntryId',
    requireWorkspacePermission('plans.update.own'),
    async (c) => {
      const parsed = updatePlanSchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) {
        return c.json({ error: 'invalid_plan_entry' }, 400)
      }

      const authContext = c.get('authContext')
      const repository = await dependencies.repositoryForWorkspace(c.req.param('workspaceId'))

      try {
        const entry = await repository.updateEntry(
          authContext.userId,
          c.req.param('planEntryId'),
          parsed.data,
        )
        if (entry === null) return c.json({ error: 'plan_entry_not_found' }, 404)
        return c.json({ entry })
      } catch (error) {
        return planWriteError(c, error)
      }
    },
  )

  app.delete(
    '/workspaces/:workspaceId/plans/:planEntryId',
    requireWorkspacePermission('plans.delete.own'),
    async (c) => {
      const authContext = c.get('authContext')
      const repository = await dependencies.repositoryForWorkspace(c.req.param('workspaceId'))
      const cancelled = await repository.cancelEntry(authContext.userId, c.req.param('planEntryId'))
      if (!cancelled) return c.json({ error: 'plan_entry_not_found' }, 404)
      return c.body(null, 204)
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

function isCanonicalDate(value: string): boolean {
  const parsed = Date.parse(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed) && new Date(parsed).toISOString().slice(0, 10) === value
}

function planWriteError(c: Context<AuthorizationEnv>, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)

  if (message.includes('plan_cycle_mismatch')) {
    return c.json({ error: 'outside_planning_cycle' }, 422)
  }
  if (message.includes('plan_customer_scope_mismatch')) {
    return c.json({ error: 'customer_not_found' }, 404)
  }
  if (message.includes('plan_route_workspace_mismatch')) {
    return c.json({ error: 'invalid_route' }, 422)
  }
  if (
    message.includes('plan_entries_same_day_active_unique_idx') ||
    message.includes('UNIQUE constraint failed: plan_entries.workspace_id')
  ) {
    return c.json({ error: 'duplicate_same_day' }, 409)
  }

  throw error
}

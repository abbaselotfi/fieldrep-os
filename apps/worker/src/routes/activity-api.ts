import type {
  Activity,
  ActivityId,
  CalendarEventId,
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

export interface CreateOwnActivityInput {
  id: ActivityId
  calendarEventId: CalendarEventId
  createdByUserId: UserId
  ownerUserId: UserId
  type: Activity['type']
  title: string
  description: string | null
  startsAt: number
  endsAt: number
  localStartDate: string
  localEndDate: string
  allDay: boolean
  scope: { type: 'user'; id: UserId }
  attendeeUserIds: readonly UserId[]
  blocksPlanning: boolean
  countsAsWorkingActivity: boolean
  appearsInReport: boolean
  status: Activity['status']
  locationText: string | null
}

export interface UpdateOwnActivityInput {
  title?: string
  description?: string | null
  startsAt?: number
  endsAt?: number
  localStartDate?: string
  localEndDate?: string
  allDay?: boolean
  blocksPlanning?: boolean
  countsAsWorkingActivity?: boolean
  appearsInReport?: boolean
  status?: Activity['status']
  locationText?: string | null
}

export interface ActivityApiRepository {
  listOwnActivities(ownerUserId: UserId, fromDate: string, toDate: string): Promise<Activity[]>
  getOwnActivity(ownerUserId: UserId, activityId: ActivityId): Promise<Activity | null>
  createActivity(input: CreateOwnActivityInput): Promise<Activity>
  updateOwnActivity(
    ownerUserId: UserId,
    activityId: ActivityId,
    patch: UpdateOwnActivityInput,
  ): Promise<Activity | null>
  cancelOwnActivity(ownerUserId: UserId, activityId: ActivityId): Promise<boolean>
}

export interface ActivityApiDependencies {
  authContextResolver: AuthContextResolver
  repositoryForWorkspace(workspaceId: WorkspaceId): Promise<ActivityApiRepository>
}

const canonicalDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine(isCanonicalDate)
const timestampSchema = z.number().int().safe()

const rangeSchema = z.object({
  from: canonicalDateSchema,
  to: canonicalDateSchema,
})

const ownActivityTypeSchema = z.enum(['internal_meeting', 'custom_activity'])

const createActivitySchema = z.object({
  id: z.string().min(1),
  calendarEventId: z.string().min(1),
  type: ownActivityTypeSchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(4000).nullable().optional(),
  startsAt: timestampSchema,
  endsAt: timestampSchema,
  localStartDate: canonicalDateSchema,
  localEndDate: canonicalDateSchema,
  allDay: z.boolean().default(false),
  blocksPlanning: z.boolean().default(false),
  countsAsWorkingActivity: z.boolean().default(true),
  appearsInReport: z.boolean().default(true),
  locationText: z.string().trim().max(500).nullable().optional(),
})

const updateActivitySchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(4000).nullable().optional(),
    startsAt: timestampSchema.optional(),
    endsAt: timestampSchema.optional(),
    localStartDate: canonicalDateSchema.optional(),
    localEndDate: canonicalDateSchema.optional(),
    allDay: z.boolean().optional(),
    blocksPlanning: z.boolean().optional(),
    countsAsWorkingActivity: z.boolean().optional(),
    appearsInReport: z.boolean().optional(),
    status: z.enum(['draft', 'scheduled', 'completed']).optional(),
    locationText: z.string().trim().max(500).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0)

export function createActivityApi(dependencies: ActivityApiDependencies) {
  const app = new Hono<AuthorizationEnv>()

  app.use('/workspaces/*', attachAuthContext(dependencies.authContextResolver))

  app.get(
    '/workspaces/:workspaceId/activities',
    requireWorkspacePermission('activities.read.own'),
    async (c) => {
      const parsed = rangeSchema.safeParse(c.req.query())
      if (!parsed.success || parsed.data.from > parsed.data.to) {
        return c.json({ error: 'invalid_activity_range' }, 400)
      }

      const authContext = c.get('authContext')
      const repository = await dependencies.repositoryForWorkspace(c.req.param('workspaceId'))
      const activities = await repository.listOwnActivities(
        authContext.userId,
        parsed.data.from,
        parsed.data.to,
      )
      return c.json({ activities })
    },
  )

  app.get(
    '/workspaces/:workspaceId/activities/:activityId',
    requireWorkspacePermission('activities.read.own'),
    async (c) => {
      const authContext = c.get('authContext')
      const repository = await dependencies.repositoryForWorkspace(c.req.param('workspaceId'))
      const activity = await repository.getOwnActivity(
        authContext.userId,
        c.req.param('activityId'),
      )
      if (activity === null) return c.json({ error: 'activity_not_found' }, 404)
      return c.json({ activity })
    },
  )

  app.post(
    '/workspaces/:workspaceId/activities',
    requireWorkspacePermission('activities.create.own'),
    async (c) => {
      const parsed = createActivitySchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success || parsed.data.endsAt < parsed.data.startsAt || parsed.data.localEndDate < parsed.data.localStartDate) {
        return c.json({ error: 'invalid_activity' }, 400)
      }

      const authContext = c.get('authContext')
      const repository = await dependencies.repositoryForWorkspace(c.req.param('workspaceId'))
      const input: CreateOwnActivityInput = {
        id: parsed.data.id,
        calendarEventId: parsed.data.calendarEventId,
        createdByUserId: authContext.userId,
        ownerUserId: authContext.userId,
        type: parsed.data.type,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        startsAt: parsed.data.startsAt,
        endsAt: parsed.data.endsAt,
        localStartDate: parsed.data.localStartDate,
        localEndDate: parsed.data.localEndDate,
        allDay: parsed.data.allDay,
        scope: { type: 'user', id: authContext.userId },
        attendeeUserIds: [],
        blocksPlanning: parsed.data.blocksPlanning,
        countsAsWorkingActivity: parsed.data.countsAsWorkingActivity,
        appearsInReport: parsed.data.appearsInReport,
        status: 'scheduled',
        locationText: parsed.data.locationText ?? null,
      }

      try {
        const activity = await repository.createActivity(input)
        return c.json({ activity }, 201)
      } catch (error) {
        return activityWriteError(c, error)
      }
    },
  )

  app.patch(
    '/workspaces/:workspaceId/activities/:activityId',
    requireWorkspacePermission('activities.update.own'),
    async (c) => {
      const parsed = updateActivitySchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) return c.json({ error: 'invalid_activity' }, 400)

      const authContext = c.get('authContext')
      const repository = await dependencies.repositoryForWorkspace(c.req.param('workspaceId'))
      const patch: UpdateOwnActivityInput = {}
      for (const key of [
        'title',
        'description',
        'startsAt',
        'endsAt',
        'localStartDate',
        'localEndDate',
        'allDay',
        'blocksPlanning',
        'countsAsWorkingActivity',
        'appearsInReport',
        'status',
        'locationText',
      ] as const) {
        if (Object.hasOwn(parsed.data, key)) {
          Object.assign(patch, { [key]: parsed.data[key] })
        }
      }

      try {
        const activity = await repository.updateOwnActivity(
          authContext.userId,
          c.req.param('activityId'),
          patch,
        )
        if (activity === null) return c.json({ error: 'activity_not_found' }, 404)
        return c.json({ activity })
      } catch (error) {
        return activityWriteError(c, error)
      }
    },
  )

  app.delete(
    '/workspaces/:workspaceId/activities/:activityId',
    requireWorkspacePermission('activities.cancel.own'),
    async (c) => {
      const authContext = c.get('authContext')
      const repository = await dependencies.repositoryForWorkspace(c.req.param('workspaceId'))
      const cancelled = await repository.cancelOwnActivity(
        authContext.userId,
        c.req.param('activityId'),
      )
      if (!cancelled) return c.json({ error: 'activity_not_found' }, 404)
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

function activityWriteError(c: Context<AuthorizationEnv>, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)

  if (
    message.includes('calendar end must not precede start') ||
    message.includes('calendar local end date must not precede local start date') ||
    message.includes('activity title is required')
  ) {
    return c.json({ error: 'invalid_activity' }, 422)
  }

  if (
    message.includes('UNIQUE constraint failed: activities.id') ||
    message.includes('UNIQUE constraint failed: calendar_events.id') ||
    message.includes('UNIQUE constraint failed: calendar_events.workspace_id')
  ) {
    return c.json({ error: 'activity_conflict' }, 409)
  }

  throw error
}

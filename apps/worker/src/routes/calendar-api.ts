import type {
  BusinessTrip,
  BusinessTripStatus,
  CalendarActivity,
  CalendarClosure,
  LeaveRequest,
  LeaveRequestStatus,
  LeaveRequestType,
  OfficialCalendarEvent,
  PlanEntry,
  WorkingDayContext,
  WorkspaceId,
} from '@fieldrep/domain'
import {
  buildCalendarProjection,
  evaluatePlanDayConflicts,
  resolveWorkingDayContext,
} from '@fieldrep/domain'
import { Hono, type Context } from 'hono'

import { z } from 'zod'

import {
  attachAuthContext,
  requireWorkspacePermission,
  type AuthContextResolver,
  type AuthorizationEnv,
} from '../middleware/authorization'

/** Working-week policy projection consumed from the calendar repository. */
export interface WorkingCalendarConfig {
  workspaceId: WorkspaceId
  timezone: string
  workingWeekdays: number[]
  updatedAt: string
}

export interface CalendarApiRepository {
  getWorkingCalendar(): Promise<WorkingCalendarConfig>
  listActivities(filter: { fromMs: number; toMs: number }): Promise<CalendarActivity[]>
  listLeaveRequests(filter: { userId?: string; fromMs?: number; toMs?: number }): Promise<LeaveRequest[]>
  createLeaveRequest(input: {
    id: string
    userId: string
    type: LeaveRequestType
    startsAt: string
    endsAt: string
    status?: LeaveRequestStatus
    reason?: string
  }): Promise<LeaveRequest>
  updateLeaveRequestStatus(
    leaveRequestId: string,
    patch: { status: LeaveRequestStatus; decidedByUserId?: string; decidedAt?: string },
  ): Promise<LeaveRequest | null>
  listBusinessTrips(filter: { userId?: string; fromMs?: number; toMs?: number }): Promise<BusinessTrip[]>
  createBusinessTrip(input: {
    id: string
    userId: string
    destination: { label: string; city?: string; province?: string }
    startsAt: string
    endsAt: string
    purpose?: string
    transport?: string
    status?: BusinessTripStatus
  }): Promise<BusinessTrip>
  updateBusinessTripStatus(tripId: string, status: BusinessTripStatus): Promise<BusinessTrip | null>
  listClosures(fromDate: string, toDate: string): Promise<CalendarClosure[]>
}

export interface CalendarApiDependencies {
  authContextResolver: AuthContextResolver
  repositoryForWorkspace(workspaceId: WorkspaceId): Promise<CalendarApiRepository>
  /** Annual verified official-holiday dataset events for the workspace locale. */
  officialEventsForWorkspace?(workspaceId: WorkspaceId): Promise<OfficialCalendarEvent[]>
  /** Optional plan source so the unified projection includes planned visits. */
  listPlanEntries?(
    workspaceId: WorkspaceId,
    ownerUserId: string,
    fromDate: string,
    toDate: string,
  ): Promise<PlanEntry[]>
  now?(): number
}

const canonicalDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .refine(isCanonicalDate)

const isoTimestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/u)

const calendarRangeSchema = z.object({
  from: canonicalDateSchema,
  to: canonicalDateSchema,
})

const createLeaveSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(['annual', 'sick', 'hourly', 'emergency', 'other']),
    startsAt: isoTimestampSchema,
    endsAt: isoTimestampSchema,
    reason: z.string().max(500).optional(),
  })
  .refine((value) => value.endsAt >= value.startsAt, { path: ['endsAt'] })

const cancelLeaveSchema = z.object({
  status: z.literal('cancelled'),
})

const createTripSchema = z
  .object({
    id: z.string().min(1),
    destination: z.object({
      label: z.string().min(1).max(120),
      city: z.string().max(80).optional(),
      province: z.string().max(80).optional(),
    }),
    startsAt: isoTimestampSchema,
    endsAt: isoTimestampSchema,
    purpose: z.string().max(300).optional(),
    transport: z.string().max(80).optional(),
  })
  .refine((value) => value.endsAt >= value.startsAt, { path: ['endsAt'] })

const cancelTripSchema = z.object({
  status: z.literal('cancelled'),
})

function isCanonicalDate(value: string): boolean {
  const parsed = Date.parse(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed) && new Date(parsed).toISOString().slice(0, 10) === value
}

function dayBoundsMs(canonicalDate: string): { fromMs: number; toMs: number } {
  const fromMs = Date.parse(`${canonicalDate}T00:00:00.000Z`)
  return { fromMs, toMs: fromMs + 86_400_000 - 1 }
}

function rangeBoundsMs(from: string, to: string): { fromMs: number; toMs: number } {
  return {
    fromMs: Date.parse(`${from}T00:00:00.000Z`),
    toMs: Date.parse(`${to}T23:59:59.999Z`),
  }
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

/**
 * P3-A2: secured operational-calendar APIs.
 *
 * Field-user self-service rules:
 * - Leave and trips are always written with the authenticated user as owner.
 * - Field users may only cancel their own draft/requested leave or planned
 *   trips; approval/rejection stays a supervisor/admin concern (P8/P9).
 * - The unified projection only exposes workspace-scope activities and the
 *   requesting user's own scoped records; other users' private items never
 *   leave the repository.
 */
export function createCalendarApi(dependencies: CalendarApiDependencies) {
  const app = new Hono<AuthorizationEnv>()

  app.use('/workspaces/*', attachAuthContext(dependencies.authContextResolver))

  app.get(
    '/workspaces/:workspaceId/calendar/items',
    requireWorkspacePermission('calendar.read.own'),
    async (c) => {
      const parsed = calendarRangeSchema.safeParse(c.req.query())
      if (!parsed.success || parsed.data.from > parsed.data.to) {
        return c.json({ error: 'invalid_calendar_range' }, 400)
      }

      const workspaceId = c.req.param('workspaceId') as WorkspaceId
      const authContext = c.get('authContext')
      const repository = await dependencies.repositoryForWorkspace(workspaceId)
      const { fromMs, toMs } = rangeBoundsMs(parsed.data.from, parsed.data.to)

      const [activities, leaves, trips, closures, officialEvents, planEntries] = await Promise.all([
        repository.listActivities({ fromMs, toMs }),
        repository.listLeaveRequests({ userId: authContext.userId, fromMs, toMs }),
        repository.listBusinessTrips({ userId: authContext.userId, fromMs, toMs }),
        repository.listClosures(parsed.data.from, parsed.data.to),
        dependencies.officialEventsForWorkspace?.(workspaceId) ?? Promise.resolve([]),
        dependencies.listPlanEntries?.(workspaceId, authContext.userId, parsed.data.from, parsed.data.to) ??
          Promise.resolve([]),
      ])

      const items = buildCalendarProjection({
        planEntries,
        activities: visibleActivitiesFor(activities, authContext.userId),
        leaveRequests: leaves,
        businessTrips: trips,
        closures,
        officialEvents,
        fromDate: parsed.data.from,
        toDate: parsed.data.to,
      })

      return c.json({ items })
    },
  )

  app.get(
    '/workspaces/:workspaceId/calendar/working-calendar',
    requireWorkspacePermission('calendar.read.own'),
    async (c) => {
      const workspaceId = c.req.param('workspaceId') as WorkspaceId
      const repository = await dependencies.repositoryForWorkspace(workspaceId)
      return c.json({ workingCalendar: await repository.getWorkingCalendar() })
    },
  )

  app.get(
    '/workspaces/:workspaceId/calendar/day/:date',
    requireWorkspacePermission('calendar.read.own'),
    async (c) => {
      const date = c.req.param('date')
      if (!canonicalDateSchema.safeParse(date).success) {
        return c.json({ error: 'invalid_calendar_date' }, 400)
      }

      const workspaceId = c.req.param('workspaceId') as WorkspaceId
      const authContext = c.get('authContext')
      const repository = await dependencies.repositoryForWorkspace(workspaceId)
      const { fromMs, toMs } = dayBoundsMs(date)

      const [workingCalendar, activities, leaves, trips, closures, officialEvents] = await Promise.all([
        repository.getWorkingCalendar(),
        repository.listActivities({ fromMs, toMs }),
        repository.listLeaveRequests({ userId: authContext.userId, fromMs, toMs }),
        repository.listBusinessTrips({ userId: authContext.userId, fromMs, toMs }),
        repository.listClosures(date, date),
        dependencies.officialEventsForWorkspace?.(workspaceId) ?? Promise.resolve([]),
      ])

      const projection = buildCalendarProjection({
        activities: visibleActivitiesFor(activities, authContext.userId),
        businessTrips: trips,
        fromDate: date,
        toDate: date,
      })

      const day: WorkingDayContext = resolveWorkingDayContext(date, {
        workingWeekdays: workingCalendar.workingWeekdays as never[],
        officialEvents,
        closures,
        leaveRequests: leaves,
        activityItems: projection.filter((item) => item.sourceType === 'calendar_activity'),
        tripItems: projection.filter((item) => item.sourceType === 'business_trip'),
      })

      return c.json({
        day,
        conflicts: evaluatePlanDayConflicts({ dayContext: day }),
      })
    },
  )

  app.get(
    '/workspaces/:workspaceId/calendar/leave-requests',
    requireWorkspacePermission('activities.read.own'),
    async (c) => {
      const workspaceId = c.req.param('workspaceId') as WorkspaceId
      const authContext = c.get('authContext')
      const repository = await dependencies.repositoryForWorkspace(workspaceId)
      const leaves = await repository.listLeaveRequests({ userId: authContext.userId })
      return c.json({ leaveRequests: leaves })
    },
  )

  app.post(
    '/workspaces/:workspaceId/calendar/leave-requests',
    requireWorkspacePermission('activities.create.own'),
    async (c) => {
      const parsed = createLeaveSchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) {
        return c.json({ error: 'invalid_leave_request' }, 400)
      }

      const workspaceId = c.req.param('workspaceId') as WorkspaceId
      const authContext = c.get('authContext')
      const repository = await dependencies.repositoryForWorkspace(workspaceId)

      const overlapping = await repository.listLeaveRequests({
        userId: authContext.userId,
        fromMs: Date.parse(parsed.data.startsAt),
        toMs: Date.parse(parsed.data.endsAt),
      })
      if (
        overlapping.some(
          (leave) =>
            leave.status !== 'cancelled' &&
            leave.status !== 'rejected' &&
            leave.startsAt <= parsed.data.endsAt &&
            leave.endsAt >= parsed.data.startsAt,
        )
      ) {
        return c.json({ error: 'leave_overlap' }, 409)
      }

      try {
        const leaveRequest = await repository.createLeaveRequest({
          id: parsed.data.id,
          userId: authContext.userId,
          type: parsed.data.type,
          startsAt: parsed.data.startsAt,
          endsAt: parsed.data.endsAt,
          status: 'requested',
          ...(parsed.data.reason === undefined ? {} : { reason: parsed.data.reason }),
        })
        return c.json({ leaveRequest }, 201)
      } catch (error) {
        return calendarWriteError(c, error)
      }
    },
  )

  app.patch(
    '/workspaces/:workspaceId/calendar/leave-requests/:leaveRequestId',
    requireWorkspacePermission('activities.update.own'),
    async (c) => {
      const parsed = cancelLeaveSchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) {
        return c.json({ error: 'invalid_leave_transition' }, 400)
      }

      const workspaceId = c.req.param('workspaceId') as WorkspaceId
      const authContext = c.get('authContext')
      const repository = await dependencies.repositoryForWorkspace(workspaceId)
      const leaveRequestId = c.req.param('leaveRequestId')

      const owned = await repository.listLeaveRequests({ userId: authContext.userId })
      const target = owned.find((leave) => leave.id === leaveRequestId)
      if (target === undefined) return c.json({ error: 'leave_request_not_found' }, 404)
      if (target.status !== 'draft' && target.status !== 'requested') {
        return c.json({ error: 'leave_request_not_cancellable' }, 409)
      }

      const updated = await repository.updateLeaveRequestStatus(leaveRequestId, {
        status: parsed.data.status,
        decidedByUserId: authContext.userId,
        decidedAt: new Date(dependencies.now?.() ?? Date.now()).toISOString(),
      })
      if (updated === null) return c.json({ error: 'leave_request_not_found' }, 404)
      return c.json({ leaveRequest: updated })
    },
  )

  app.get(
    '/workspaces/:workspaceId/calendar/business-trips',
    requireWorkspacePermission('activities.read.own'),
    async (c) => {
      const workspaceId = c.req.param('workspaceId') as WorkspaceId
      const authContext = c.get('authContext')
      const repository = await dependencies.repositoryForWorkspace(workspaceId)
      const trips = await repository.listBusinessTrips({ userId: authContext.userId })
      return c.json({ businessTrips: trips })
    },
  )

  app.post(
    '/workspaces/:workspaceId/calendar/business-trips',
    requireWorkspacePermission('activities.create.own'),
    async (c) => {
      const parsed = createTripSchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) {
        return c.json({ error: 'invalid_business_trip' }, 400)
      }

      const workspaceId = c.req.param('workspaceId') as WorkspaceId
      const authContext = c.get('authContext')
      const repository = await dependencies.repositoryForWorkspace(workspaceId)

      try {
        const trip = await repository.createBusinessTrip({
          id: parsed.data.id,
          userId: authContext.userId,
          destination: {
            label: parsed.data.destination.label,
            ...(parsed.data.destination.city === undefined
              ? {}
              : { city: parsed.data.destination.city }),
            ...(parsed.data.destination.province === undefined
              ? {}
              : { province: parsed.data.destination.province }),
          },
          startsAt: parsed.data.startsAt,
          endsAt: parsed.data.endsAt,
          ...(parsed.data.purpose === undefined ? {} : { purpose: parsed.data.purpose }),
          ...(parsed.data.transport === undefined ? {} : { transport: parsed.data.transport }),
          status: 'planned',
        })
        return c.json({ businessTrip: trip }, 201)
      } catch (error) {
        return calendarWriteError(c, error)
      }
    },
  )

  app.patch(
    '/workspaces/:workspaceId/calendar/business-trips/:tripId',
    requireWorkspacePermission('activities.update.own'),
    async (c) => {
      const parsed = cancelTripSchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) {
        return c.json({ error: 'invalid_trip_transition' }, 400)
      }

      const workspaceId = c.req.param('workspaceId') as WorkspaceId
      const authContext = c.get('authContext')
      const repository = await dependencies.repositoryForWorkspace(workspaceId)
      const tripId = c.req.param('tripId')

      const owned = await repository.listBusinessTrips({ userId: authContext.userId })
      if (!owned.some((trip) => trip.id === tripId)) {
        return c.json({ error: 'business_trip_not_found' }, 404)
      }

      const updated = await repository.updateBusinessTripStatus(tripId, parsed.data.status)
      if (updated === null) return c.json({ error: 'business_trip_not_found' }, 404)
      return c.json({ businessTrip: updated })
    },
  )

  app.get(
    '/workspaces/:workspaceId/calendar/closures',
    requireWorkspacePermission('calendar.read.own'),
    async (c) => {
      const parsed = calendarRangeSchema.safeParse(c.req.query())
      if (!parsed.success || parsed.data.from > parsed.data.to) {
        return c.json({ error: 'invalid_calendar_range' }, 400)
      }

      const workspaceId = c.req.param('workspaceId') as WorkspaceId
      const repository = await dependencies.repositoryForWorkspace(workspaceId)
      const closures = await repository.listClosures(parsed.data.from, parsed.data.to)
      return c.json({ closures })
    },
  )

  return app
}

function visibleActivitiesFor(activities: readonly CalendarActivity[], userId: string) {
  return activities.filter(
    (activity) =>
      activity.scope === 'workspace' ||
      (activity.scope === 'user' && activity.ownerUserId === userId) ||
      (activity.scope === 'selected_users' && activity.targetUserIds.includes(userId)),
  )
}

function calendarWriteError(c: Context, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)

  if (message.includes('UNIQUE constraint failed')) {
    return c.json({ error: 'duplicate_identifier' }, 409)
  }
  if (message.includes('workspace_mismatch') || message.includes('FOREIGN KEY constraint failed')) {
    return c.json({ error: 'invalid_reference' }, 422)
  }

  throw error
}

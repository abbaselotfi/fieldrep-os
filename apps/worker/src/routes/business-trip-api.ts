import {
  validateBusinessTrip,
  type BusinessTrip,
  type BusinessTripDestination,
  type BusinessTripId,
  type BusinessTripTransport,
  type UserId,
  type WorkspaceId,
} from '@fieldrep/domain'
import { Hono } from 'hono'
import { z } from 'zod'

import {
  attachAuthContext,
  requireWorkspacePermission,
  type AuthContextResolver,
  type AuthorizationEnv,
} from '../middleware/authorization'

export interface CreateOwnBusinessTripInput {
  id: BusinessTripId
  calendarEventId: string
  userId: UserId
  originCity: string
  originProvince?: string | null
  purpose: string
  transport: BusinessTripTransport
  startsAt: number
  endsAt: number
  localStartDate: string
  localEndDate: string
  allDay: boolean
  blocksPlanning: boolean
  destinations: readonly BusinessTripDestination[]
}

export interface BusinessTripApiRepository {
  listOwn(userId: UserId, fromDate: string, toDate: string): Promise<BusinessTrip[]>
  getOwn(userId: UserId, tripId: BusinessTripId): Promise<BusinessTrip | null>
  createDraft(input: CreateOwnBusinessTripInput): Promise<BusinessTrip>
  submitOwn(userId: UserId, tripId: BusinessTripId): Promise<BusinessTrip | null>
  cancelOwn(userId: UserId, tripId: BusinessTripId): Promise<boolean>
  completeOwn(userId: UserId, tripId: BusinessTripId): Promise<BusinessTrip | null>
}

export interface BusinessTripApiDependencies {
  authContextResolver: AuthContextResolver
  repositoryForWorkspace(workspaceId: WorkspaceId): Promise<BusinessTripApiRepository>
}

const canonicalDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine(isCanonicalDate)
const rangeSchema = z.object({ from: canonicalDateSchema, to: canonicalDateSchema })
const destinationSchema = z.object({
  id: z.string().min(1),
  sequence: z.number().int().min(1),
  city: z.string().trim().min(1).max(200),
  province: z.string().trim().max(200).nullable().optional(),
  address: z.string().trim().max(2000).nullable().optional(),
  startsAt: z.number().int().safe().nullable().optional(),
  endsAt: z.number().int().safe().nullable().optional(),
})
const createSchema = z.object({
  id: z.string().min(1),
  calendarEventId: z.string().min(1),
  originCity: z.string().trim().min(1).max(200),
  originProvince: z.string().trim().max(200).nullable().optional(),
  purpose: z.string().trim().min(1).max(4000),
  transport: z.enum(['car', 'train', 'airplane', 'bus', 'taxi', 'other']),
  startsAt: z.number().int().safe(),
  endsAt: z.number().int().safe(),
  localStartDate: canonicalDateSchema,
  localEndDate: canonicalDateSchema,
  allDay: z.boolean().default(false),
  blocksPlanning: z.boolean().default(false),
  destinations: z.array(destinationSchema).min(1).max(20),
})

export function createBusinessTripApi(dependencies: BusinessTripApiDependencies) {
  const app = new Hono<AuthorizationEnv>()
  app.use('/workspaces/*', attachAuthContext(dependencies.authContextResolver))

  app.get(
    '/workspaces/:workspaceId/business-trips',
    requireWorkspacePermission('business_trip.read.own'),
    async (c) => {
      const parsed = rangeSchema.safeParse(c.req.query())
      if (!parsed.success || parsed.data.from > parsed.data.to) {
        return c.json({ error: 'invalid_business_trip_range' }, 400)
      }
      const auth = c.get('authContext')
      const repository = await dependencies.repositoryForWorkspace(c.req.param('workspaceId'))
      return c.json({
        trips: await repository.listOwn(auth.userId, parsed.data.from, parsed.data.to),
      })
    },
  )

  app.get(
    '/workspaces/:workspaceId/business-trips/:tripId',
    requireWorkspacePermission('business_trip.read.own'),
    async (c) => {
      const auth = c.get('authContext')
      const repository = await dependencies.repositoryForWorkspace(c.req.param('workspaceId'))
      const trip = await repository.getOwn(auth.userId, c.req.param('tripId'))
      if (trip === null) return c.json({ error: 'business_trip_not_found' }, 404)
      return c.json({ trip })
    },
  )

  app.post(
    '/workspaces/:workspaceId/business-trips',
    requireWorkspacePermission('business_trip.create.own'),
    async (c) => {
      const parsed = createSchema.safeParse(await safeJson(c.req.raw))
      if (
        !parsed.success ||
        parsed.data.endsAt < parsed.data.startsAt ||
        parsed.data.localEndDate < parsed.data.localStartDate
      ) {
        return c.json({ error: 'invalid_business_trip' }, 400)
      }

      const auth = c.get('authContext')
      const workspaceId = c.req.param('workspaceId') as WorkspaceId
      const destinations: BusinessTripDestination[] = parsed.data.destinations.map((destination) => ({
        id: destination.id,
        sequence: destination.sequence,
        city: destination.city,
        province: destination.province ?? null,
        address: destination.address ?? null,
        startsAt: destination.startsAt ?? null,
        endsAt: destination.endsAt ?? null,
      }))

      try {
        validateBusinessTrip({
          id: parsed.data.id,
          workspaceId,
          userId: auth.userId,
          originCity: parsed.data.originCity,
          originProvince: parsed.data.originProvince ?? null,
          purpose: parsed.data.purpose,
          transport: parsed.data.transport,
          startsAt: parsed.data.startsAt,
          endsAt: parsed.data.endsAt,
          localStartDate: parsed.data.localStartDate,
          localEndDate: parsed.data.localEndDate,
          allDay: parsed.data.allDay,
          blocksPlanning: parsed.data.blocksPlanning,
          status: 'draft',
          destinations,
          decidedByUserId: null,
          decidedAt: null,
        })
      } catch (error) {
        if (error instanceof RangeError) return c.json({ error: 'invalid_business_trip' }, 400)
        throw error
      }

      const repository = await dependencies.repositoryForWorkspace(workspaceId)
      try {
        const trip = await repository.createDraft({
          id: parsed.data.id,
          calendarEventId: parsed.data.calendarEventId,
          userId: auth.userId,
          originCity: parsed.data.originCity,
          originProvince: parsed.data.originProvince ?? null,
          purpose: parsed.data.purpose,
          transport: parsed.data.transport,
          startsAt: parsed.data.startsAt,
          endsAt: parsed.data.endsAt,
          localStartDate: parsed.data.localStartDate,
          localEndDate: parsed.data.localEndDate,
          allDay: parsed.data.allDay,
          blocksPlanning: parsed.data.blocksPlanning,
          destinations,
        })
        return c.json({ trip }, 201)
      } catch (error) {
        if (error instanceof RangeError) return c.json({ error: 'invalid_business_trip' }, 400)
        if (isUniqueConflict(error)) return c.json({ error: 'business_trip_conflict' }, 409)
        throw error
      }
    },
  )

  app.post(
    '/workspaces/:workspaceId/business-trips/:tripId/request',
    requireWorkspacePermission('business_trip.request.own'),
    async (c) => {
      const auth = c.get('authContext')
      const repository = await dependencies.repositoryForWorkspace(c.req.param('workspaceId'))
      try {
        const trip = await repository.submitOwn(auth.userId, c.req.param('tripId'))
        if (trip === null) return c.json({ error: 'business_trip_not_found_or_not_draft' }, 404)
        return c.json({ trip })
      } catch (error) {
        if (error instanceof Error && error.message === 'only draft business trip can be requested') {
          return c.json({ error: 'business_trip_not_draft' }, 409)
        }
        throw error
      }
    },
  )

  app.post(
    '/workspaces/:workspaceId/business-trips/:tripId/complete',
    requireWorkspacePermission('business_trip.complete.own'),
    async (c) => {
      const auth = c.get('authContext')
      const repository = await dependencies.repositoryForWorkspace(c.req.param('workspaceId'))
      try {
        const trip = await repository.completeOwn(auth.userId, c.req.param('tripId'))
        if (trip === null) return c.json({ error: 'business_trip_not_found_or_not_approved' }, 404)
        return c.json({ trip })
      } catch (error) {
        if (error instanceof Error && error.message === 'only approved business trip can be completed') {
          return c.json({ error: 'business_trip_not_approved' }, 409)
        }
        throw error
      }
    },
  )

  app.delete(
    '/workspaces/:workspaceId/business-trips/:tripId',
    requireWorkspacePermission('business_trip.cancel.own'),
    async (c) => {
      const auth = c.get('authContext')
      const repository = await dependencies.repositoryForWorkspace(c.req.param('workspaceId'))
      try {
        const cancelled = await repository.cancelOwn(auth.userId, c.req.param('tripId'))
        if (!cancelled) return c.json({ error: 'business_trip_not_found_or_not_cancellable' }, 404)
        return c.body(null, 204)
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === 'only draft or requested business trip can be cancelled by owner'
        ) {
          return c.json({ error: 'business_trip_not_cancellable' }, 409)
        }
        throw error
      }
    },
  )

  return app
}

async function safeJson(request: Request): Promise<unknown> {
  try { return await request.json() } catch { return null }
}

function isCanonicalDate(value: string): boolean {
  const parsed = Date.parse(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed) && new Date(parsed).toISOString().slice(0, 10) === value
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed')
}

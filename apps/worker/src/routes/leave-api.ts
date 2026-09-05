import type {
  LeaveRequest,
  LeaveRequestId,
  LeaveType,
  UserId,
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

export interface CreateOwnLeaveInput {
  id: LeaveRequestId
  calendarEventId: string
  userId: UserId
  type: LeaveType
  startsAt: number
  endsAt: number
  localStartDate: string
  localEndDate: string
  allDay: boolean
  reason?: string | null
}

export interface LeaveApiRepository {
  listOwn(userId: UserId, fromDate: string, toDate: string): Promise<LeaveRequest[]>
  getOwn(userId: UserId, leaveId: LeaveRequestId): Promise<LeaveRequest | null>
  createDraft(input: CreateOwnLeaveInput): Promise<LeaveRequest>
  submitOwn(userId: UserId, leaveId: LeaveRequestId): Promise<LeaveRequest | null>
  cancelOwn(userId: UserId, leaveId: LeaveRequestId): Promise<boolean>
}

export interface LeaveApiDependencies {
  authContextResolver: AuthContextResolver
  repositoryForWorkspace(workspaceId: WorkspaceId): Promise<LeaveApiRepository>
}

const canonicalDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine(isCanonicalDate)
const rangeSchema = z.object({ from: canonicalDateSchema, to: canonicalDateSchema })
const createSchema = z.object({
  id: z.string().min(1),
  calendarEventId: z.string().min(1),
  type: z.enum(['annual', 'sick', 'hourly', 'emergency', 'other']),
  startsAt: z.number().int().safe(),
  endsAt: z.number().int().safe(),
  localStartDate: canonicalDateSchema,
  localEndDate: canonicalDateSchema,
  allDay: z.boolean().default(true),
  reason: z.string().trim().max(4000).nullable().optional(),
})

export function createLeaveApi(dependencies: LeaveApiDependencies) {
  const app = new Hono<AuthorizationEnv>()
  app.use('/workspaces/*', attachAuthContext(dependencies.authContextResolver))

  app.get(
    '/workspaces/:workspaceId/leaves',
    requireWorkspacePermission('leave.read.own'),
    async (c) => {
      const parsed = rangeSchema.safeParse(c.req.query())
      if (!parsed.success || parsed.data.from > parsed.data.to) {
        return c.json({ error: 'invalid_leave_range' }, 400)
      }
      const auth = c.get('authContext')
      const repository = await dependencies.repositoryForWorkspace(c.req.param('workspaceId'))
      return c.json({ leaves: await repository.listOwn(auth.userId, parsed.data.from, parsed.data.to) })
    },
  )

  app.get(
    '/workspaces/:workspaceId/leaves/:leaveId',
    requireWorkspacePermission('leave.read.own'),
    async (c) => {
      const auth = c.get('authContext')
      const repository = await dependencies.repositoryForWorkspace(c.req.param('workspaceId'))
      const leave = await repository.getOwn(auth.userId, c.req.param('leaveId'))
      if (leave === null) return c.json({ error: 'leave_not_found' }, 404)
      return c.json({ leave })
    },
  )

  app.post(
    '/workspaces/:workspaceId/leaves',
    requireWorkspacePermission('leave.create.own'),
    async (c) => {
      const parsed = createSchema.safeParse(await safeJson(c.req.raw))
      if (
        !parsed.success ||
        parsed.data.endsAt < parsed.data.startsAt ||
        parsed.data.localEndDate < parsed.data.localStartDate
      ) {
        return c.json({ error: 'invalid_leave' }, 400)
      }
      const auth = c.get('authContext')
      const repository = await dependencies.repositoryForWorkspace(c.req.param('workspaceId'))
      try {
        const leave = await repository.createDraft({
          id: parsed.data.id,
          calendarEventId: parsed.data.calendarEventId,
          userId: auth.userId,
          type: parsed.data.type,
          startsAt: parsed.data.startsAt,
          endsAt: parsed.data.endsAt,
          localStartDate: parsed.data.localStartDate,
          localEndDate: parsed.data.localEndDate,
          allDay: parsed.data.allDay,
          reason: parsed.data.reason ?? null,
        })
        return c.json({ leave }, 201)
      } catch (error) {
        if (isUniqueConflict(error)) return c.json({ error: 'leave_conflict' }, 409)
        throw error
      }
    },
  )

  app.post(
    '/workspaces/:workspaceId/leaves/:leaveId/request',
    requireWorkspacePermission('leave.request.own'),
    async (c) => {
      const auth = c.get('authContext')
      const repository = await dependencies.repositoryForWorkspace(c.req.param('workspaceId'))
      try {
        const leave = await repository.submitOwn(auth.userId, c.req.param('leaveId'))
        if (leave === null) return c.json({ error: 'leave_not_found_or_not_draft' }, 404)
        return c.json({ leave })
      } catch (error) {
        if (error instanceof Error && error.message === 'only draft leave can be requested') {
          return c.json({ error: 'leave_not_draft' }, 409)
        }
        throw error
      }
    },
  )

  app.delete(
    '/workspaces/:workspaceId/leaves/:leaveId',
    requireWorkspacePermission('leave.cancel.own'),
    async (c) => {
      const auth = c.get('authContext')
      const repository = await dependencies.repositoryForWorkspace(c.req.param('workspaceId'))
      try {
        const cancelled = await repository.cancelOwn(auth.userId, c.req.param('leaveId'))
        if (!cancelled) return c.json({ error: 'leave_not_found_or_not_cancellable' }, 404)
        return c.body(null, 204)
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === 'only draft or requested leave can be cancelled by owner'
        ) {
          return c.json({ error: 'leave_not_cancellable' }, 409)
        }
        throw error
      }
    },
  )

  return app
}

async function safeJson(request: Request): Promise<unknown> {
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

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed')
}

import type { AuthContext } from '@fieldrep/domain'
import { describe, expect, it } from 'vitest'

import {
  createCalendarApi,
  type CalendarApiDependencies,
  type CalendarApiRepository,
} from './calendar-api'

function authContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    membershipId: 'membership-1',
    companyId: 'company-1',
    workspaceId: 'workspace-a',
    roleKeys: ['user'],
    permissions: [
      'calendar.read.own',
      'activities.read.own',
      'activities.create.own',
      'activities.update.own',
    ],
    scopes: [{ type: 'self' }],
    ...overrides,
  }
}

const leave = {
  id: 'leave-1',
  workspaceId: 'workspace-a',
  userId: 'user-1',
  type: 'annual' as const,
  startsAt: '2026-09-08T00:00:00.000Z',
  endsAt: '2026-09-09T23:59:59.999Z',
  status: 'requested' as const,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
}

const trip = {
  id: 'trip-1',
  workspaceId: 'workspace-a',
  userId: 'user-1',
  destination: { label: 'بجنورد', city: 'بجنورد' },
  startsAt: '2026-09-12T00:00:00.000Z',
  endsAt: '2026-09-13T23:59:59.999Z',
  status: 'planned' as const,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
}

const workspaceActivity = {
  id: 'meeting-1',
  workspaceId: 'workspace-a',
  activityType: 'internal_meeting' as const,
  title: 'Cycle meeting',
  scope: 'workspace' as const,
  targetUserIds: [] as string[],
  startsAt: '2026-09-07T08:00:00.000Z',
  endsAt: '2026-09-07T10:00:00.000Z',
  allDay: false,
  blocksPlanning: true,
  countsAsWorkingActivity: true,
  appearsInReport: true,
  status: 'confirmed' as const,
  createdByUserId: 'supervisor-1',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
}

const otherUsersPrivateActivity = {
  ...workspaceActivity,
  id: 'meeting-private',
  title: 'Private 1:1',
  scope: 'user' as const,
  ownerUserId: 'user-2',
}

function repository(overrides: Partial<CalendarApiRepository> = {}): CalendarApiRepository {
  return {
    getWorkingCalendar: async () => ({
      workspaceId: 'workspace-a',
      timezone: 'Asia/Tehran',
      workingWeekdays: [0, 1, 2, 3, 4, 5],
      updatedAt: '2026-09-01T00:00:00.000Z',
    }),
    listActivities: async () => [],
    listLeaveRequests: async () => [],
    createLeaveRequest: async (input) => ({
      ...leave,
      id: input.id,
      userId: input.userId,
      type: input.type,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      status: 'requested',
      ...(input.reason === undefined ? {} : { reason: input.reason }),
    }),
    updateLeaveRequestStatus: async (leaveRequestId, patch) =>
      leaveRequestId === 'leave-1' ? { ...leave, status: patch.status } : null,
    listBusinessTrips: async () => [],
    createBusinessTrip: async (input) => ({
      ...trip,
      id: input.id,
      userId: input.userId,
      destination: input.destination,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    }),
    updateBusinessTripStatus: async (tripId, status) =>
      tripId === 'trip-1' ? { ...trip, status } : null,
    listClosures: async () => [],
    ...overrides,
  }
}

function dependencies(
  repo: CalendarApiRepository,
  context: AuthContext | null = authContext(),
  extra: Partial<CalendarApiDependencies> = {},
): CalendarApiDependencies {
  return {
    authContextResolver: { resolve: async () => context },
    repositoryForWorkspace: async (workspaceId) => {
      expect(workspaceId).toBe('workspace-a')
      return repo
    },
    ...extra,
  }
}

describe('calendar API', () => {
  it('requires authentication before calendar access', async () => {
    const app = createCalendarApi(dependencies(repository(), null))
    const response = await app.request(
      '/workspaces/workspace-a/calendar/items?from=2026-09-01&to=2026-09-30',
    )
    expect(response.status).toBe(401)
  })

  it('rejects cross-workspace calendar access before repository resolution', async () => {
    let repositoryResolved = false
    const app = createCalendarApi({
      authContextResolver: { resolve: async () => authContext() },
      repositoryForWorkspace: async () => {
        repositoryResolved = true
        return repository()
      },
    })

    const response = await app.request(
      '/workspaces/workspace-b/calendar/items?from=2026-09-01&to=2026-09-30',
    )
    expect(response.status).toBe(403)
    expect(repositoryResolved).toBe(false)
  })

  it('rejects a caller without calendar read permission', async () => {
    const app = createCalendarApi(dependencies(repository(), authContext({ permissions: [] })))
    const response = await app.request(
      '/workspaces/workspace-a/calendar/items?from=2026-09-01&to=2026-09-30',
    )
    expect(response.status).toBe(403)
  })

  it('validates the requested range', async () => {
    const app = createCalendarApi(dependencies(repository()))
    const response = await app.request('/workspaces/workspace-a/calendar/items?from=bad&to=also-bad')
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'invalid_calendar_range' })
  })

  it('projects workspace activities plus the caller-owned records only', async () => {
    const app = createCalendarApi(
      dependencies(
        repository({
          listActivities: async () => [workspaceActivity, otherUsersPrivateActivity],
          listLeaveRequests: async (filter) => (filter.userId === 'user-1' ? [leave] : []),
          listBusinessTrips: async (filter) => (filter.userId === 'user-1' ? [trip] : []),
        }),
        authContext(),
        {
          listPlanEntries: async (_workspaceId, ownerUserId, from, to) => {
            expect(ownerUserId).toBe('user-1')
            expect(from).toBe('2026-09-01')
            expect(to).toBe('2026-09-30')
            return [
              {
                id: 'plan-1',
                workspaceId: 'workspace-a',
                ownerUserId: 'user-1',
                customerId: 'doctor-1',
                planDate: '2026-09-06',
                status: 'planned',
                source: 'manual',
              },
            ]
          },
        },
      ),
    )

    const response = await app.request(
      '/workspaces/workspace-a/calendar/items?from=2026-09-01&to=2026-09-30',
    )
    expect(response.status).toBe(200)
    const payload = (await response.json()) as { items: { type: string; sourceId: string }[] }
    const types = payload.items.map((item) => item.type)
    expect(types).toContain('visit')
    expect(types).toContain('internal_meeting')
    expect(types).toContain('leave')
    expect(types).toContain('business_trip')
    // Another user's private activity must never be projected.
    expect(payload.items.some((item) => item.sourceId === 'meeting-private')).toBe(false)
  })

  it('reports a Friday as a non-working day with blocking conflicts', async () => {
    const app = createCalendarApi(dependencies(repository()))
    const response = await app.request('/workspaces/workspace-a/calendar/day/2026-09-11')

    expect(response.status).toBe(200)
    const payload = (await response.json()) as {
      day: { planningAllowed: boolean; reasons: string[] }
      conflicts: { code: string; severity: string }[]
    }
    expect(payload.day.planningAllowed).toBe(false)
    expect(payload.day.reasons).toContain('non_working_weekday')
    expect(payload.conflicts.some((conflict) => conflict.code === 'non_working_day')).toBe(true)
    expect(payload.conflicts.some((conflict) => conflict.severity === 'block')).toBe(true)
  })

  it('creates leave requests for the authenticated user only', async () => {
    let capturedUserId = ''
    const app = createCalendarApi(
      dependencies(
        repository({
          listLeaveRequests: async () => [],
          createLeaveRequest: async (input) => {
            capturedUserId = input.userId
            return {
              ...leave,
              id: input.id,
              userId: input.userId,
              startsAt: input.startsAt,
              endsAt: input.endsAt,
            }
          },
        }),
      ),
    )

    const response = await app.request('/workspaces/workspace-a/calendar/leave-requests', {
      method: 'POST',
      body: JSON.stringify({
        id: 'leave-new',
        type: 'annual',
        startsAt: '2026-10-01T00:00:00.000Z',
        endsAt: '2026-10-03T23:59:59.999Z',
        reason: 'خانوادگی',
      }),
      headers: { 'content-type': 'application/json' },
    })

    expect(response.status).toBe(201)
    expect(capturedUserId).toBe('user-1')
    const payload = (await response.json()) as { leaveRequest: { status: string; userId: string } }
    expect(payload.leaveRequest.status).toBe('requested')
    expect(payload.leaveRequest.userId).toBe('user-1')
  })

  it('rejects overlapping leave requests', async () => {
    const app = createCalendarApi(
      dependencies(
        repository({
          listLeaveRequests: async () => [leave],
        }),
      ),
    )

    const response = await app.request('/workspaces/workspace-a/calendar/leave-requests', {
      method: 'POST',
      body: JSON.stringify({
        id: 'leave-new',
        type: 'annual',
        startsAt: '2026-09-09T00:00:00.000Z',
        endsAt: '2026-09-10T00:00:00.000Z',
      }),
      headers: { 'content-type': 'application/json' },
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: 'leave_overlap' })
  })

  it('allows cancelling an owned requested leave but not an approved one', async () => {
    const app = createCalendarApi(
      dependencies(
        repository({
          listLeaveRequests: async () => [
            leave,
            { ...leave, id: 'leave-approved', status: 'approved' as const },
          ],
        }),
      ),
    )

    const ok = await app.request('/workspaces/workspace-a/calendar/leave-requests/leave-1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'cancelled' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(ok.status).toBe(200)

    const blocked = await app.request(
      '/workspaces/workspace-a/calendar/leave-requests/leave-approved',
      {
        method: 'PATCH',
        body: JSON.stringify({ status: 'cancelled' }),
        headers: { 'content-type': 'application/json' },
      },
    )
    expect(blocked.status).toBe(409)
    expect(await blocked.json()).toMatchObject({ error: 'leave_request_not_cancellable' })

    const foreign = await app.request('/workspaces/workspace-a/calendar/leave-requests/leave-other', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'cancelled' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(foreign.status).toBe(404)
  })

  it('creates and cancels business trips for the authenticated user', async () => {
    const app = createCalendarApi(
      dependencies(
        repository({
          listBusinessTrips: async () => [trip],
        }),
      ),
    )

    const created = await app.request('/workspaces/workspace-a/calendar/business-trips', {
      method: 'POST',
      body: JSON.stringify({
        id: 'trip-new',
        destination: { label: 'بجنورد', city: 'بجنورد' },
        startsAt: '2026-09-20T00:00:00.000Z',
        endsAt: '2026-09-21T23:59:59.999Z',
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(created.status).toBe(201)
    const createdPayload = (await created.json()) as { businessTrip: { userId: string; status: string } }
    expect(createdPayload.businessTrip.userId).toBe('user-1')
    expect(createdPayload.businessTrip.status).toBe('planned')

    const cancelled = await app.request('/workspaces/workspace-a/calendar/business-trips/trip-1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'cancelled' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(cancelled.status).toBe(200)
  })
})

import type { Activity, AuthContext } from '@fieldrep/domain'
import { describe, expect, it } from 'vitest'

import {
  createActivityApi,
  type ActivityApiDependencies,
  type ActivityApiRepository,
} from './activity-api'

function authContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    membershipId: 'membership-1',
    companyId: 'company-1',
    workspaceId: 'workspace-a',
    roleKeys: ['user'],
    permissions: [
      'activities.read.own',
      'activities.create.own',
      'activities.update.own',
      'activities.cancel.own',
    ],
    scopes: [{ type: 'self' }],
    ...overrides,
  }
}

const activity: Activity = {
  id: 'activity-1',
  workspaceId: 'workspace-a',
  createdByUserId: 'user-1',
  ownerUserId: 'user-1',
  type: 'internal_meeting',
  title: 'جلسه داخلی',
  description: null,
  startsAt: Date.UTC(2026, 8, 5, 9),
  endsAt: Date.UTC(2026, 8, 5, 10),
  localStartDate: '2026-09-05',
  localEndDate: '2026-09-05',
  allDay: false,
  scope: { type: 'user', id: 'user-1' },
  attendeeUserIds: [],
  blocksPlanning: true,
  countsAsWorkingActivity: true,
  appearsInReport: true,
  status: 'scheduled',
  locationText: 'دفتر',
}

function repository(overrides: Partial<ActivityApiRepository> = {}): ActivityApiRepository {
  return {
    listOwnActivities: async () => [],
    getOwnActivity: async () => null,
    createActivity: async () => activity,
    updateOwnActivity: async () => activity,
    cancelOwnActivity: async () => true,
    ...overrides,
  }
}

function dependencies(
  repo: ActivityApiRepository,
  context: AuthContext | null = authContext(),
): ActivityApiDependencies {
  return {
    authContextResolver: { resolve: async () => context },
    repositoryForWorkspace: async (workspaceId) => {
      expect(workspaceId).toBe('workspace-a')
      return repo
    },
  }
}

const validCreateBody = {
  id: 'activity-1',
  calendarEventId: 'calendar-1',
  type: 'internal_meeting',
  title: 'جلسه داخلی',
  description: null,
  startsAt: Date.UTC(2026, 8, 5, 9),
  endsAt: Date.UTC(2026, 8, 5, 10),
  localStartDate: '2026-09-05',
  localEndDate: '2026-09-05',
  allDay: false,
  blocksPlanning: true,
  countsAsWorkingActivity: true,
  appearsInReport: true,
  locationText: 'دفتر',
}

describe('activity API', () => {
  it('requires authentication before activity access', async () => {
    const app = createActivityApi(dependencies(repository(), null))
    const response = await app.request(
      '/workspaces/workspace-a/activities?from=2026-09-01&to=2026-09-30',
    )

    expect(response.status).toBe(401)
  })

  it('rejects cross-workspace access before repository resolution', async () => {
    let repositoryResolved = false
    const app = createActivityApi({
      authContextResolver: { resolve: async () => authContext() },
      repositoryForWorkspace: async () => {
        repositoryResolved = true
        return repository()
      },
    })

    const response = await app.request(
      '/workspaces/workspace-b/activities?from=2026-09-01&to=2026-09-30',
    )

    expect(response.status).toBe(403)
    expect(repositoryResolved).toBe(false)
  })

  it('lists only the authenticated owner range', async () => {
    const app = createActivityApi(
      dependencies(
        repository({
          listOwnActivities: async (ownerUserId, fromDate, toDate) => {
            expect(ownerUserId).toBe('user-1')
            expect(fromDate).toBe('2026-09-01')
            expect(toDate).toBe('2026-09-30')
            return [activity]
          },
        }),
      ),
    )

    const response = await app.request(
      '/workspaces/workspace-a/activities?from=2026-09-01&to=2026-09-30',
    )

    expect(response.status).toBe(200)
    const payload = (await response.json()) as { activities: Activity[] }
    expect(payload.activities).toEqual([activity])
  })

  it('injects creator, owner and self scope instead of trusting client identity fields', async () => {
    const app = createActivityApi(
      dependencies(
        repository({
          createActivity: async (input) => {
            expect(input.createdByUserId).toBe('user-1')
            expect(input.ownerUserId).toBe('user-1')
            expect(input.scope).toEqual({ type: 'user', id: 'user-1' })
            expect(input.attendeeUserIds).toEqual([])
            return activity
          },
        }),
      ),
    )

    const response = await app.request('/workspaces/workspace-a/activities', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...validCreateBody,
        workspaceId: 'workspace-b',
        ownerUserId: 'attacker',
        createdByUserId: 'attacker',
        scope: { type: 'workspace', id: 'workspace-b' },
        attendeeUserIds: ['attacker'],
      }),
    })

    expect(response.status).toBe(201)
  })

  it('does not let the own endpoint create company or doctor programs', async () => {
    let called = false
    const app = createActivityApi(
      dependencies(
        repository({
          createActivity: async () => {
            called = true
            return activity
          },
        }),
      ),
    )

    const response = await app.request('/workspaces/workspace-a/activities', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...validCreateBody, type: 'company_program' }),
    })

    expect(response.status).toBe(400)
    expect(called).toBe(false)
  })

  it('rejects impossible dates and inverted timestamp ranges before persistence', async () => {
    let called = false
    const app = createActivityApi(
      dependencies(
        repository({
          createActivity: async () => {
            called = true
            return activity
          },
        }),
      ),
    )

    const response = await app.request('/workspaces/workspace-a/activities', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...validCreateBody,
        localStartDate: '2026-02-31',
        endsAt: Date.UTC(2026, 8, 5, 8),
      }),
    })

    expect(response.status).toBe(400)
    expect(called).toBe(false)
  })

  it('requires the specific update permission', async () => {
    const app = createActivityApi(
      dependencies(
        repository(),
        authContext({ permissions: ['activities.read.own', 'activities.create.own'] }),
      ),
    )

    const response = await app.request('/workspaces/workspace-a/activities/activity-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'عنوان جدید' }),
    })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'permission_denied',
      permission: 'activities.update.own',
    })
  })

  it('updates only through the authenticated owner boundary', async () => {
    const app = createActivityApi(
      dependencies(
        repository({
          updateOwnActivity: async (ownerUserId, activityId, patch) => {
            expect(ownerUserId).toBe('user-1')
            expect(activityId).toBe('activity-1')
            expect(patch).toEqual({ title: 'عنوان جدید', blocksPlanning: false })
            return { ...activity, title: 'عنوان جدید', blocksPlanning: false }
          },
        }),
      ),
    )

    const response = await app.request('/workspaces/workspace-a/activities/activity-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'عنوان جدید',
        blocksPlanning: false,
        ownerUserId: 'attacker',
        scope: { type: 'workspace', id: 'workspace-a' },
      }),
    })

    expect(response.status).toBe(200)
  })

  it('soft-cancels with its own permission and authenticated owner', async () => {
    const app = createActivityApi(
      dependencies(
        repository({
          cancelOwnActivity: async (ownerUserId, activityId) => {
            expect(ownerUserId).toBe('user-1')
            expect(activityId).toBe('activity-1')
            return true
          },
        }),
      ),
    )

    const response = await app.request('/workspaces/workspace-a/activities/activity-1', {
      method: 'DELETE',
    })

    expect(response.status).toBe(204)
  })
})

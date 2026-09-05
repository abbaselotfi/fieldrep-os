import type { AuthContext, LeaveRequest } from '@fieldrep/domain'
import { describe, expect, it } from 'vitest'

import {
  createLeaveApi,
  type LeaveApiDependencies,
  type LeaveApiRepository,
} from './leave-api'

function authContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    membershipId: 'membership-1',
    companyId: 'company-1',
    workspaceId: 'workspace-a',
    roleKeys: ['user'],
    permissions: [
      'leave.read.own',
      'leave.create.own',
      'leave.request.own',
      'leave.cancel.own',
    ],
    scopes: [{ type: 'self' }],
    ...overrides,
  }
}

const leave: LeaveRequest = {
  id: 'leave-1',
  workspaceId: 'workspace-a',
  userId: 'user-1',
  type: 'annual',
  startsAt: Date.UTC(2026, 8, 6),
  endsAt: Date.UTC(2026, 8, 7),
  localStartDate: '2026-09-06',
  localEndDate: '2026-09-07',
  allDay: true,
  reason: 'استراحت',
  status: 'draft',
  decidedByUserId: null,
  decidedAt: null,
}

function repository(overrides: Partial<LeaveApiRepository> = {}): LeaveApiRepository {
  return {
    listOwn: async () => [],
    getOwn: async () => null,
    createDraft: async () => leave,
    submitOwn: async () => ({ ...leave, status: 'requested' }),
    cancelOwn: async () => true,
    ...overrides,
  }
}

function dependencies(
  repo: LeaveApiRepository,
  context: AuthContext | null = authContext(),
): LeaveApiDependencies {
  return {
    authContextResolver: { resolve: async () => context },
    repositoryForWorkspace: async (workspaceId) => {
      expect(workspaceId).toBe('workspace-a')
      return repo
    },
  }
}

const validCreateBody = {
  id: 'leave-1',
  calendarEventId: 'calendar-leave-1',
  type: 'annual',
  startsAt: Date.UTC(2026, 8, 6),
  endsAt: Date.UTC(2026, 8, 7),
  localStartDate: '2026-09-06',
  localEndDate: '2026-09-07',
  allDay: true,
  reason: 'استراحت',
}

describe('leave API', () => {
  it('requires authentication', async () => {
    const app = createLeaveApi(dependencies(repository(), null))
    const response = await app.request(
      '/workspaces/workspace-a/leaves?from=2026-09-01&to=2026-09-30',
    )
    expect(response.status).toBe(401)
  })

  it('blocks cross-workspace access before repository resolution', async () => {
    let repositoryResolved = false
    const app = createLeaveApi({
      authContextResolver: { resolve: async () => authContext() },
      repositoryForWorkspace: async () => {
        repositoryResolved = true
        return repository()
      },
    })

    const response = await app.request(
      '/workspaces/workspace-b/leaves?from=2026-09-01&to=2026-09-30',
    )

    expect(response.status).toBe(403)
    expect(repositoryResolved).toBe(false)
  })

  it('lists only the authenticated owner', async () => {
    const app = createLeaveApi(dependencies(repository({
      listOwn: async (userId, from, to) => {
        expect(userId).toBe('user-1')
        expect(from).toBe('2026-09-01')
        expect(to).toBe('2026-09-30')
        return [leave]
      },
    })))

    const response = await app.request(
      '/workspaces/workspace-a/leaves?from=2026-09-01&to=2026-09-30',
    )

    expect(response.status).toBe(200)
    const payload = (await response.json()) as { leaves: LeaveRequest[] }
    expect(payload.leaves).toEqual([leave])
  })

  it('injects the authenticated user instead of trusting client identity fields', async () => {
    const app = createLeaveApi(dependencies(repository({
      createDraft: async (input) => {
        expect(input.userId).toBe('user-1')
        expect(input.id).toBe('leave-1')
        return leave
      },
    })))

    const response = await app.request('/workspaces/workspace-a/leaves', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...validCreateBody,
        workspaceId: 'workspace-b',
        userId: 'attacker',
        status: 'approved',
        decidedByUserId: 'attacker',
        decidedAt: 123,
      }),
    })

    expect(response.status).toBe(201)
    const payload = (await response.json()) as { leave: LeaveRequest }
    expect(payload.leave.status).toBe('draft')
  })

  it('rejects invalid dates and inverted ranges before persistence', async () => {
    let called = false
    const app = createLeaveApi(dependencies(repository({
      createDraft: async () => {
        called = true
        return leave
      },
    })))

    const response = await app.request('/workspaces/workspace-a/leaves', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...validCreateBody,
        localStartDate: '2026-02-31',
        endsAt: Date.UTC(2026, 8, 5),
      }),
    })

    expect(response.status).toBe(400)
    expect(called).toBe(false)
  })

  it('submits only the authenticated owner draft', async () => {
    const app = createLeaveApi(dependencies(repository({
      submitOwn: async (userId, leaveId) => {
        expect(userId).toBe('user-1')
        expect(leaveId).toBe('leave-1')
        return { ...leave, status: 'requested' }
      },
    })))

    const response = await app.request('/workspaces/workspace-a/leaves/leave-1/request', {
      method: 'POST',
    })

    expect(response.status).toBe(200)
    const payload = (await response.json()) as { leave: LeaveRequest }
    expect(payload.leave.status).toBe('requested')
  })

  it('soft-cancels only the authenticated owner leave', async () => {
    const app = createLeaveApi(dependencies(repository({
      cancelOwn: async (userId, leaveId) => {
        expect(userId).toBe('user-1')
        expect(leaveId).toBe('leave-1')
        return true
      },
    })))

    const response = await app.request('/workspaces/workspace-a/leaves/leave-1', {
      method: 'DELETE',
    })

    expect(response.status).toBe(204)
  })

  it('has no owner endpoint capable of approving leave', async () => {
    const app = createLeaveApi(dependencies(repository()))
    const response = await app.request('/workspaces/workspace-a/leaves/leave-1/approve', {
      method: 'POST',
    })
    expect(response.status).toBe(404)
  })
})

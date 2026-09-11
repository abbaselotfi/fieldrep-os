import type { AuthContext } from '@fieldrep/domain'
import { describe, expect, it } from 'vitest'

import {
  createCalendarAdminApi,
  type CalendarAdminDependencies,
  type CalendarAdminGateway,
} from './calendar-admin-api'

function authContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'admin-1',
    membershipId: 'membership-a1',
    companyId: 'company-1',
    workspaceId: 'workspace-a',
    roleKeys: ['workspace_admin'],
    permissions: [
      'calendar.manage.workspace',
      'holidays.manage.workspace',
      'targets.manage.workspace',
    ],
    scopes: [{ type: 'workspace', id: 'workspace-a' }],
    ...overrides,
  }
}

function gateway(overrides: Partial<CalendarAdminGateway> = {}): CalendarAdminGateway {
  return {
    getWorkingCalendar: async () => ({
      timezone: 'Asia/Tehran',
      workingWeekdays: [0, 1, 2, 3, 4, 5],
      updatedAt: '2026-09-11T00:00:00.000Z',
    }),
    updateWorkingCalendar: async (patch) => ({
      timezone: patch.timezone ?? 'Asia/Tehran',
      workingWeekdays: patch.workingWeekdays ?? [0, 1, 2, 3, 4, 5],
      updatedAt: '2026-09-11T01:00:00.000Z',
    }),
    listClosures: async () => [
      {
        id: 'cl-1',
        workspaceId: 'workspace-a',
        level: 'workspace',
        canonicalDate: '2026-09-20',
        label: 'Holiday',
        createdAt: '2026-09-11T00:00:00.000Z',
      },
    ],
    createClosure: async (input) => ({
      id: input.id,
      workspaceId: 'workspace-a',
      level: input.level,
      canonicalDate: input.canonicalDate,
      label: input.label,
      createdAt: '2026-09-11T00:00:00.000Z',
    }),
    deleteClosure: async () => true,
    getTargetsPolicy: async () => ({
      classFrequency: { A: 4, B: 2 },
      defaultDailyTarget: 6,
      maxDailyVisits: 10,
    }),
    updateTargetsPolicy: async (patch, userId) => {
      expect(userId).toBe('admin-1')
      return {
        classFrequency: { A: 4, B: 2 },
        defaultDailyTarget: patch.defaultDailyTarget ?? 6,
        maxDailyVisits: patch.maxDailyVisits ?? 10,
      }
    },
    ...overrides,
  }
}

function dependencies(
  gw: CalendarAdminGateway,
  context: AuthContext | null = authContext(),
): CalendarAdminDependencies {
  return {
    authContextResolver: { resolve: async () => context },
    adminForWorkspace: async (workspaceId) => {
      expect(workspaceId).toBe('workspace-a')
      return gw
    },
  }
}

describe('calendar-admin API', () => {
  it('requires authentication before reading calendar config', async () => {
    const app = createCalendarAdminApi(dependencies(gateway(), null))
    const response = await app.request('/workspaces/workspace-a/calendar-config')
    expect(response.status).toBe(401)
  })

  it('requires calendar.manage permission for config', async () => {
    const app = createCalendarAdminApi(
      dependencies(gateway(), authContext({ permissions: ['plans.read.own'] })),
    )
    const response = await app.request('/workspaces/workspace-a/calendar-config')
    expect(response.status).toBe(403)
  })

  it('rejects cross-workspace access before gateway resolution', async () => {
    let resolved = false
    const app = createCalendarAdminApi({
      authContextResolver: { resolve: async () => authContext() },
      adminForWorkspace: async () => {
        resolved = true
        return gateway()
      },
    })
    const response = await app.request('/workspaces/workspace-b/calendar-config')
    expect(response.status).toBe(403)
    expect(resolved).toBe(false)
  })

  it('reads the working calendar config', async () => {
    const app = createCalendarAdminApi(dependencies(gateway()))
    const response = await app.request('/workspaces/workspace-a/calendar-config')
    expect(response.status).toBe(200)
    const body = (await response.json()) as { config: { timezone: string; workingWeekdays: number[] } }
    expect(body.config.timezone).toBe('Asia/Tehran')
    expect(body.config.workingWeekdays).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('updates the working calendar config', async () => {
    let applied: { timezone?: string | undefined; workingWeekdays?: readonly number[] | undefined } | null = null
    const gw = gateway({
      updateWorkingCalendar: async (patch) => {
        applied = { timezone: patch.timezone, workingWeekdays: patch.workingWeekdays }
        return {
          timezone: patch.timezone ?? 'Asia/Tehran',
          workingWeekdays: patch.workingWeekdays ?? [0, 1],
          updatedAt: '2026-09-11T02:00:00.000Z',
        }
      },
    })
    const app = createCalendarAdminApi(dependencies(gw))
    const response = await app.request('/workspaces/workspace-a/calendar-config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ timezone: 'Asia/Dubai', workingWeekdays: [0, 1, 2] }),
    })
    expect(response.status).toBe(200)
    expect(applied).toEqual({ timezone: 'Asia/Dubai', workingWeekdays: [0, 1, 2] })
  })

  it('rejects an empty calendar config patch', async () => {
    const app = createCalendarAdminApi(dependencies(gateway()))
    const response = await app.request('/workspaces/workspace-a/calendar-config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(response.status).toBe(400)
  })

  it('lists closures within a valid range', async () => {
    const app = createCalendarAdminApi(dependencies(gateway()))
    const response = await app.request(
      '/workspaces/workspace-a/closures?from=2026-09-01&to=2026-09-30',
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as { closures: readonly { id: string }[] }
    expect(body.closures).toHaveLength(1)
  })

  it('rejects an inverted closure range', async () => {
    const app = createCalendarAdminApi(dependencies(gateway()))
    const response = await app.request(
      '/workspaces/workspace-a/closures?from=2026-09-30&to=2026-09-01',
    )
    expect(response.status).toBe(400)
  })

  it('creates a closure with holidays.manage permission', async () => {
    const app = createCalendarAdminApi(dependencies(gateway()))
    const response = await app.request('/workspaces/workspace-a/closures', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'cl-2',
        level: 'workspace',
        canonicalDate: '2026-09-25',
        label: 'Company holiday',
      }),
    })
    expect(response.status).toBe(201)
    const body = (await response.json()) as { closure: { id: string } }
    expect(body.closure.id).toBe('cl-2')
  })

  it('rejects a malformed closure date', async () => {
    const app = createCalendarAdminApi(dependencies(gateway()))
    const response = await app.request('/workspaces/workspace-a/closures', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'cl-3', level: 'workspace', canonicalDate: '09-25-2026', label: 'X' }),
    })
    expect(response.status).toBe(400)
  })

  it('deletes a closure', async () => {
    const app = createCalendarAdminApi(dependencies(gateway()))
    const response = await app.request('/workspaces/workspace-a/closures/cl-1', {
      method: 'DELETE',
    })
    expect(response.status).toBe(204)
  })

  it('returns 404 when deleting an unknown closure', async () => {
    const gw = gateway({ deleteClosure: async () => false })
    const app = createCalendarAdminApi(dependencies(gw))
    const response = await app.request('/workspaces/workspace-a/closures/missing', {
      method: 'DELETE',
    })
    expect(response.status).toBe(404)
  })

  it('requires targets.manage permission for targets policy', async () => {
    const app = createCalendarAdminApi(
      dependencies(gateway(), authContext({ permissions: ['calendar.manage.workspace'] })),
    )
    const response = await app.request('/workspaces/workspace-a/targets-policy')
    expect(response.status).toBe(403)
  })

  it('reads and updates the targets policy', async () => {
    const app = createCalendarAdminApi(dependencies(gateway()))
    const read = await app.request('/workspaces/workspace-a/targets-policy')
    expect(read.status).toBe(200)
    const readBody = (await read.json()) as { policy: { defaultDailyTarget: number } }
    expect(readBody.policy.defaultDailyTarget).toBe(6)

    const update = await app.request('/workspaces/workspace-a/targets-policy', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ defaultDailyTarget: 8 }),
    })
    expect(update.status).toBe(200)
    const updateBody = (await update.json()) as { policy: { defaultDailyTarget: number } }
    expect(updateBody.policy.defaultDailyTarget).toBe(8)
  })

  it('rejects an empty targets policy patch', async () => {
    const app = createCalendarAdminApi(dependencies(gateway()))
    const response = await app.request('/workspaces/workspace-a/targets-policy', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(response.status).toBe(400)
  })
})

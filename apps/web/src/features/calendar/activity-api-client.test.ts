import { describe, expect, it } from 'vitest'

import {
  OwnActivityHttpClient,
  type ActivityApiEntry,
} from './activity-api-client'

const activity: ActivityApiEntry = {
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
  locationText: null,
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('OwnActivityHttpClient', () => {
  it('lists a date range with cookie credentials and an encoded workspace', async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), init })
      return jsonResponse({ activities: [activity] })
    }
    const client = new OwnActivityHttpClient('workspace/a', '/api/v1/', fetchImpl)

    await expect(client.list('2026-09-01', '2026-09-30')).resolves.toEqual([activity])
    expect(calls[0]?.url).toBe(
      '/api/v1/workspaces/workspace%2Fa/activities?from=2026-09-01&to=2026-09-30',
    )
    expect(calls[0]?.init?.credentials).toBe('include')
  })

  it('creates only the public own-activity request shape', async () => {
    let body: unknown = null
    const fetchImpl: typeof fetch = async (_input, init) => {
      body = JSON.parse(String(init?.body))
      return jsonResponse({ activity }, 201)
    }
    const client = new OwnActivityHttpClient('workspace-a', '/api/v1', fetchImpl)

    await client.create({
      id: 'activity-1',
      calendarEventId: 'calendar-1',
      type: 'internal_meeting',
      title: 'جلسه داخلی',
      startsAt: activity.startsAt,
      endsAt: activity.endsAt,
      localStartDate: activity.localStartDate,
      localEndDate: activity.localEndDate,
      blocksPlanning: true,
    })

    expect(body).toMatchObject({
      id: 'activity-1',
      calendarEventId: 'calendar-1',
      type: 'internal_meeting',
    })
    expect(body).not.toHaveProperty('ownerUserId')
    expect(body).not.toHaveProperty('scope')
    expect(body).not.toHaveProperty('workspaceId')
  })

  it('updates and encodes the activity identifier', async () => {
    let seenUrl = ''
    let seenMethod = ''
    const fetchImpl: typeof fetch = async (input, init) => {
      seenUrl = String(input)
      seenMethod = init?.method ?? ''
      return jsonResponse({ activity: { ...activity, title: 'عنوان جدید' } })
    }
    const client = new OwnActivityHttpClient('workspace-a', '/api/v1', fetchImpl)

    const updated = await client.update('activity/1', { title: 'عنوان جدید' })

    expect(seenUrl).toBe('/api/v1/workspaces/workspace-a/activities/activity%2F1')
    expect(seenMethod).toBe('PATCH')
    expect(updated.title).toBe('عنوان جدید')
  })

  it('handles a 204 soft cancellation without parsing JSON', async () => {
    const fetchImpl: typeof fetch = async () => new Response(null, { status: 204 })
    const client = new OwnActivityHttpClient('workspace-a', '/api/v1', fetchImpl)

    await expect(client.cancel('activity-1')).resolves.toBeUndefined()
  })

  it('surfaces the stable backend error code', async () => {
    const fetchImpl: typeof fetch = async () => jsonResponse({ error: 'activity_not_found' }, 404)
    const client = new OwnActivityHttpClient('workspace-a', '/api/v1', fetchImpl)

    await expect(client.get('missing')).rejects.toMatchObject({
      name: 'ActivityApiError',
      status: 404,
      code: 'activity_not_found',
    })
  })
})

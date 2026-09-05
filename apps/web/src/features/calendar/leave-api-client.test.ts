import { describe, expect, it } from 'vitest'

import {
  LeaveApiError,
  OwnLeaveHttpClient,
  type LeaveApiEntry,
} from './leave-api-client'

const leave: LeaveApiEntry = {
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

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('OwnLeaveHttpClient', () => {
  it('lists own leave with cookie credentials and encoded workspace', async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), init })
      return jsonResponse({ leaves: [leave] })
    }
    const client = new OwnLeaveHttpClient('workspace/a', '/api/v1/', fetchImpl)

    await expect(client.list('2026-09-01', '2026-09-30')).resolves.toEqual([leave])
    expect(calls[0]?.url).toBe(
      '/api/v1/workspaces/workspace%2Fa/leaves?from=2026-09-01&to=2026-09-30',
    )
    expect(calls[0]?.init?.credentials).toBe('include')
  })

  it('does not send owner or approval fields in create shape', async () => {
    let body: Record<string, unknown> = {}
    const fetchImpl: typeof fetch = async (_input, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>
      return jsonResponse({ leave }, 201)
    }
    const client = new OwnLeaveHttpClient('workspace-a', '/api/v1', fetchImpl)

    await client.createDraft({
      id: 'leave-1',
      calendarEventId: 'calendar-leave-1',
      type: 'annual',
      startsAt: leave.startsAt,
      endsAt: leave.endsAt,
      localStartDate: leave.localStartDate,
      localEndDate: leave.localEndDate,
      allDay: true,
      reason: 'استراحت',
    })

    expect(body).toMatchObject({ id: 'leave-1', type: 'annual' })
    expect(body).not.toHaveProperty('userId')
    expect(body).not.toHaveProperty('workspaceId')
    expect(body).not.toHaveProperty('status')
    expect(body).not.toHaveProperty('decidedByUserId')
  })

  it('uses the explicit request transition endpoint', async () => {
    let url = ''
    let method = ''
    const fetchImpl: typeof fetch = async (input, init) => {
      url = String(input)
      method = init?.method ?? ''
      return jsonResponse({ leave: { ...leave, status: 'requested' } })
    }
    const client = new OwnLeaveHttpClient('workspace-a', '/api/v1', fetchImpl)

    const requested = await client.requestLeave('leave/1')

    expect(url).toBe('/api/v1/workspaces/workspace-a/leaves/leave%2F1/request')
    expect(method).toBe('POST')
    expect(requested.status).toBe('requested')
  })

  it('handles cancellation without parsing a body', async () => {
    const fetchImpl: typeof fetch = async () => new Response(null, { status: 204 })
    const client = new OwnLeaveHttpClient('workspace-a', '/api/v1', fetchImpl)
    await expect(client.cancel('leave-1')).resolves.toBeUndefined()
  })

  it('surfaces stable backend error details', async () => {
    const fetchImpl: typeof fetch = async () => jsonResponse({ error: 'leave_not_found' }, 404)
    const client = new OwnLeaveHttpClient('workspace-a', '/api/v1', fetchImpl)

    const promise = client.get('missing')
    await expect(promise).rejects.toBeInstanceOf(LeaveApiError)
    await expect(promise).rejects.toMatchObject({ status: 404, code: 'leave_not_found' })
  })
})

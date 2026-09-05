import { describe, expect, it } from 'vitest'

import {
  BusinessTripApiError,
  OwnBusinessTripHttpClient,
  type BusinessTripApiEntry,
} from './business-trip-api-client'

const trip: BusinessTripApiEntry = {
  id: 'trip-1', workspaceId: 'workspace-a', userId: 'user-1', originCity: 'مشهد',
  originProvince: 'خراسان رضوی', purpose: 'ویزیت منطقه‌ای', transport: 'car',
  startsAt: Date.UTC(2026, 8, 10, 4), endsAt: Date.UTC(2026, 8, 12, 18),
  localStartDate: '2026-09-10', localEndDate: '2026-09-12', allDay: false,
  blocksPlanning: false, status: 'draft',
  destinations: [{ id: 'destination-1', sequence: 1, city: 'بجنورد', province: 'خراسان شمالی', address: null, startsAt: null, endsAt: null }],
  decidedByUserId: null, decidedAt: null,
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } })
}

describe('OwnBusinessTripHttpClient', () => {
  it('lists trips with cookie credentials', async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), init })
      return jsonResponse({ trips: [trip] })
    }
    const client = new OwnBusinessTripHttpClient('workspace/a', '/api/v1/', fetchImpl)
    await expect(client.list('2026-09-01', '2026-09-30')).resolves.toEqual([trip])
    expect(calls[0]?.url).toBe('/api/v1/workspaces/workspace%2Fa/business-trips?from=2026-09-01&to=2026-09-30')
    expect(calls[0]?.init?.credentials).toBe('include')
  })

  it('create shape contains no owner/approval identity fields', async () => {
    let body: Record<string, unknown> = {}
    const fetchImpl: typeof fetch = async (_input, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>
      return jsonResponse({ trip }, 201)
    }
    const client = new OwnBusinessTripHttpClient('workspace-a', '/api/v1', fetchImpl)
    await client.createDraft({
      id: 'trip-1', calendarEventId: 'calendar-trip-1', originCity: 'مشهد',
      purpose: 'ویزیت منطقه‌ای', transport: 'car', startsAt: trip.startsAt, endsAt: trip.endsAt,
      localStartDate: trip.localStartDate, localEndDate: trip.localEndDate,
      destinations: trip.destinations,
    })
    expect(body).not.toHaveProperty('userId')
    expect(body).not.toHaveProperty('workspaceId')
    expect(body).not.toHaveProperty('status')
    expect(body).not.toHaveProperty('decidedByUserId')
  })

  it('uses explicit request and complete transitions', async () => {
    const calls: string[] = []
    const fetchImpl: typeof fetch = async (input) => {
      calls.push(String(input))
      return jsonResponse({ trip: { ...trip, status: calls.length === 1 ? 'requested' : 'completed' } })
    }
    const client = new OwnBusinessTripHttpClient('workspace-a', '/api/v1', fetchImpl)
    await client.requestTrip('trip/1')
    await client.complete('trip/1')
    expect(calls).toEqual([
      '/api/v1/workspaces/workspace-a/business-trips/trip%2F1/request',
      '/api/v1/workspaces/workspace-a/business-trips/trip%2F1/complete',
    ])
  })

  it('surfaces backend errors', async () => {
    const fetchImpl: typeof fetch = async () => jsonResponse({ error: 'business_trip_not_found' }, 404)
    const client = new OwnBusinessTripHttpClient('workspace-a', '/api/v1', fetchImpl)
    const promise = client.get('missing')
    await expect(promise).rejects.toBeInstanceOf(BusinessTripApiError)
    await expect(promise).rejects.toMatchObject({ status: 404, code: 'business_trip_not_found' })
  })
})

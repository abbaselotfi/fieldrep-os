import type { AuthContext, BusinessTrip } from '@fieldrep/domain'
import { describe, expect, it } from 'vitest'

import {
  createBusinessTripApi,
  type BusinessTripApiDependencies,
  type BusinessTripApiRepository,
} from './business-trip-api'

function authContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1', membershipId: 'membership-1', companyId: 'company-1', workspaceId: 'workspace-a',
    roleKeys: ['user'],
    permissions: [
      'business_trip.read.own', 'business_trip.create.own', 'business_trip.request.own',
      'business_trip.cancel.own', 'business_trip.complete.own',
    ],
    scopes: [{ type: 'self' }],
    ...overrides,
  }
}

const trip: BusinessTrip = {
  id: 'trip-1', workspaceId: 'workspace-a', userId: 'user-1', originCity: 'مشهد',
  originProvince: 'خراسان رضوی', purpose: 'ویزیت منطقه‌ای', transport: 'car',
  startsAt: Date.UTC(2026, 8, 10, 4), endsAt: Date.UTC(2026, 8, 12, 18),
  localStartDate: '2026-09-10', localEndDate: '2026-09-12', allDay: false,
  blocksPlanning: false, status: 'draft',
  destinations: [{
    id: 'destination-1', sequence: 1, city: 'بجنورد', province: 'خراسان شمالی', address: null,
    startsAt: Date.UTC(2026, 8, 10, 8), endsAt: Date.UTC(2026, 8, 12, 16),
  }],
  decidedByUserId: null, decidedAt: null,
}

function repository(overrides: Partial<BusinessTripApiRepository> = {}): BusinessTripApiRepository {
  return {
    listOwn: async () => [], getOwn: async () => null, createDraft: async () => trip,
    submitOwn: async () => ({ ...trip, status: 'requested' }), cancelOwn: async () => true,
    completeOwn: async () => null,
    ...overrides,
  }
}

function dependencies(repo: BusinessTripApiRepository, context: AuthContext | null = authContext()): BusinessTripApiDependencies {
  return {
    authContextResolver: { resolve: async () => context },
    repositoryForWorkspace: async (workspaceId) => {
      expect(workspaceId).toBe('workspace-a')
      return repo
    },
  }
}

const createBody = {
  id: 'trip-1', calendarEventId: 'calendar-trip-1', originCity: 'مشهد',
  originProvince: 'خراسان رضوی', purpose: 'ویزیت منطقه‌ای', transport: 'car',
  startsAt: trip.startsAt, endsAt: trip.endsAt, localStartDate: trip.localStartDate,
  localEndDate: trip.localEndDate, allDay: false, blocksPlanning: false,
  destinations: trip.destinations,
}

describe('business trip API', () => {
  it('requires authentication and blocks cross-workspace access', async () => {
    const unauthenticated = createBusinessTripApi(dependencies(repository(), null))
    expect((await unauthenticated.request(
      '/workspaces/workspace-a/business-trips?from=2026-09-01&to=2026-09-30',
    )).status).toBe(401)

    let resolved = false
    const cross = createBusinessTripApi({
      authContextResolver: { resolve: async () => authContext() },
      repositoryForWorkspace: async () => { resolved = true; return repository() },
    })
    expect((await cross.request(
      '/workspaces/workspace-b/business-trips?from=2026-09-01&to=2026-09-30',
    )).status).toBe(403)
    expect(resolved).toBe(false)
  })

  it('injects authenticated ownership and ignores attempted approval fields', async () => {
    const app = createBusinessTripApi(dependencies(repository({
      createDraft: async (input) => {
        expect(input.userId).toBe('user-1')
        expect(input.destinations[0]?.city).toBe('بجنورد')
        return trip
      },
    })))
    const response = await app.request('/workspaces/workspace-a/business-trips', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...createBody, userId: 'attacker', workspaceId: 'workspace-b', status: 'approved', decidedByUserId: 'attacker' }),
    })
    expect(response.status).toBe(201)
    const payload = (await response.json()) as { trip: BusinessTrip }
    expect(payload.trip.status).toBe('draft')
  })

  it('rejects a destination interval outside the trip before accepting the draft', async () => {
    let called = false
    const app = createBusinessTripApi(dependencies(repository({
      createDraft: async () => { called = true; return trip },
    })))
    const response = await app.request('/workspaces/workspace-a/business-trips', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...createBody, destinations: [{ ...trip.destinations[0], startsAt: trip.startsAt - 1 }] }),
    })
    expect(response.status).toBe(400)
    expect(called).toBe(false)
  })

  it('exposes request, completion and cancellation as explicit owner transitions', async () => {
    const app = createBusinessTripApi(dependencies(repository({
      submitOwn: async (userId, tripId) => {
        expect([userId, tripId]).toEqual(['user-1', 'trip-1'])
        return { ...trip, status: 'requested' }
      },
      completeOwn: async () => ({
        ...trip, status: 'completed', decidedByUserId: 'supervisor-1', decidedAt: 1_780_000_000_000,
      }),
      cancelOwn: async () => true,
    })))

    expect((await app.request('/workspaces/workspace-a/business-trips/trip-1/request', { method: 'POST' })).status).toBe(200)
    expect((await app.request('/workspaces/workspace-a/business-trips/trip-1/complete', { method: 'POST' })).status).toBe(200)
    expect((await app.request('/workspaces/workspace-a/business-trips/trip-1', { method: 'DELETE' })).status).toBe(204)
  })

  it('has no own approval endpoint', async () => {
    const app = createBusinessTripApi(dependencies(repository()))
    const response = await app.request('/workspaces/workspace-a/business-trips/trip-1/approve', { method: 'POST' })
    expect(response.status).toBe(404)
  })
})

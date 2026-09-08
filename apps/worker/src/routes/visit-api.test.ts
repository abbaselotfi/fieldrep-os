import type {
  AuthContext,
  CustomerVisitCounters,
  ProductSummary,
  VisitActual,
} from '@fieldrep/domain'
import { describe, expect, it } from 'vitest'

import {
  createVisitApi,
  type VisitApiDependencies,
  type VisitApiRepository,
} from './visit-api'

function authContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    membershipId: 'membership-1',
    companyId: 'company-1',
    workspaceId: 'workspace-a',
    roleKeys: ['user'],
    permissions: ['visits.read.own', 'visits.create.own', 'visits.update.own'],
    scopes: [{ type: 'self' }],
    ...overrides,
  }
}

const product: ProductSummary = {
  id: 'product-1',
  workspaceId: 'workspace-a',
  code: 'TJO',
  name: 'Toujeo',
  status: 'active',
  sortOrder: 1,
}

const visit: VisitActual = {
  id: 'visit-1',
  workspaceId: 'workspace-a',
  ownerUserId: 'user-1',
  customerId: 'doctor-1',
  planEntryId: 'plan-1',
  visitDate: '2026-09-06',
  occurredAt: 1_788_680_400_000,
  status: 'completed',
  source: 'planned',
  productCalls: [{ productId: 'product-1', callCount: 1 }],
}

const counters: CustomerVisitCounters = {
  customerId: 'doctor-1',
  completedVisitRecords: 4,
  totalProductCalls: 7,
  byProduct: [{ productId: 'product-1', callCount: 7 }],
}

const evidence = {
  id: 'evidence-1',
  workspaceId: 'workspace-a',
  visitId: 'visit-1',
  ownerUserId: 'user-1',
  coordinates: { latitude: 35.6892, longitude: 51.389, accuracy: 12 },
  altitude: 1200,
  captureMode: 'gps' as const,
  capturedAt: 1_788_000_000_000,
  clientOccurredAt: '2026-09-06T10:00:00.000Z',
  serverReceivedAt: 1_788_000_060_000,
}

function repository(overrides: Partial<VisitApiRepository> = {}): VisitApiRepository {
  return {
    listProducts: async () => [product],
    listVisits: async () => [],
    createCompletedVisit: async () => visit,
    cancelVisit: async () => true,
    getCustomerCounters: async () => counters,
    recordLocationEvidence: async () => evidence,
    getLocationEvidence: async () => null,
    ...overrides,
  }
}

function dependencies(
  repo: VisitApiRepository,
  context: AuthContext | null = authContext(),
): VisitApiDependencies {
  return {
    authContextResolver: { resolve: async () => context },
    repositoryForWorkspace: async (workspaceId) => {
      expect(workspaceId).toBe('workspace-a')
      return repo
    },
  }
}

describe('visit API', () => {
  it('requires authentication before visit access', async () => {
    const app = createVisitApi(dependencies(repository(), null))
    const response = await app.request(
      '/workspaces/workspace-a/visits?from=2026-09-01&to=2026-09-30',
    )

    expect(response.status).toBe(401)
  })

  it('rejects cross-workspace access before repository resolution', async () => {
    let repositoryResolved = false
    const app = createVisitApi({
      authContextResolver: { resolve: async () => authContext() },
      repositoryForWorkspace: async () => {
        repositoryResolved = true
        return repository()
      },
    })

    const response = await app.request(
      '/workspaces/workspace-b/visits?from=2026-09-01&to=2026-09-30',
    )

    expect(response.status).toBe(403)
    expect(repositoryResolved).toBe(false)
  })

  it('returns visit-form products under create permission', async () => {
    const app = createVisitApi(dependencies(repository()))
    const response = await app.request('/workspaces/workspace-a/visit-products')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ products: [product] })
  })

  it('returns authenticated-user customer counters for a valid range', async () => {
    const app = createVisitApi(
      dependencies(
        repository({
          getCustomerCounters: async (ownerUserId, customerId, fromDate, toDate) => {
            expect(ownerUserId).toBe('user-1')
            expect(customerId).toBe('doctor-1')
            expect(fromDate).toBe('2026-09-01')
            expect(toDate).toBe('2026-09-30')
            return counters
          },
        }),
      ),
    )

    const response = await app.request(
      '/workspaces/workspace-a/visit-counters/doctor-1?from=2026-09-01&to=2026-09-30',
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ counters })
  })

  it('rejects invalid counter date ranges before repository access', async () => {
    let called = false
    const app = createVisitApi(
      dependencies(
        repository({
          getCustomerCounters: async () => {
            called = true
            return counters
          },
        }),
      ),
    )

    const response = await app.request(
      '/workspaces/workspace-a/visit-counters/doctor-1?from=2026-09-30&to=2026-09-01',
    )

    expect(response.status).toBe(400)
    expect(called).toBe(false)
  })

  it('injects authenticated ownership and accepts planned actuals', async () => {
    const app = createVisitApi(
      dependencies(
        repository({
          createCompletedVisit: async (input) => {
            expect(input.ownerUserId).toBe('user-1')
            expect(input.planEntryId).toBe('plan-1')
            expect(input.productCalls).toEqual([{ productId: 'product-1', callCount: 1 }])
            return visit
          },
        }),
      ),
    )

    const response = await app.request('/workspaces/workspace-a/visits', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'visit-1',
        ownerUserId: 'attacker-controlled',
        customerId: 'doctor-1',
        planEntryId: 'plan-1',
        visitDate: '2026-09-06',
        occurredAt: 1_788_680_400_000,
        productCalls: [{ productId: 'product-1', callCount: 1 }],
      }),
    })

    expect(response.status).toBe(201)
  })

  it('rejects impossible canonical dates before repository access', async () => {
    let called = false
    const app = createVisitApi(
      dependencies(
        repository({
          createCompletedVisit: async () => {
            called = true
            return visit
          },
        }),
      ),
    )

    const response = await app.request('/workspaces/workspace-a/visits', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'visit-1',
        customerId: 'doctor-1',
        visitDate: '2026-02-31',
        occurredAt: 1,
        productCalls: [],
      }),
    })

    expect(response.status).toBe(400)
    expect(called).toBe(false)
  })

  it('maps an already-completed plan to a stable conflict', async () => {
    const app = createVisitApi(
      dependencies(
        repository({
          createCompletedVisit: async () => {
            throw new Error('UNIQUE constraint failed: visits.plan_entry_id')
          },
        }),
      ),
    )

    const response = await app.request('/workspaces/workspace-a/visits', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'visit-2',
        customerId: 'doctor-1',
        planEntryId: 'plan-1',
        visitDate: '2026-09-06',
        occurredAt: 1_788_680_400_000,
        productCalls: [],
      }),
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ error: 'plan_already_completed' })
  })

  it('requires update permission to cancel an actual visit', async () => {
    const app = createVisitApi(
      dependencies(
        repository(),
        authContext({ permissions: ['visits.read.own', 'visits.create.own'] }),
      ),
    )

    const response = await app.request('/workspaces/workspace-a/visits/visit-1/cancel', {
      method: 'POST',
    })

    expect(response.status).toBe(403)
  })

  it('records location evidence with injected ownership and receipt time', async () => {
    let received: Record<string, unknown> | undefined
    const app = createVisitApi(
      dependencies(
        repository({
          recordLocationEvidence: async (input) => {
            received = { ...input }
            return evidence
          },
        }),
      ),
    )

    const response = await app.request(
      '/workspaces/workspace-a/visits/visit-1/location-evidence',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 'evidence-1',
          latitude: 35.6892,
          longitude: 51.389,
          accuracyMeters: 12,
          altitudeMeters: 1200,
          captureMode: 'gps',
          capturedAt: 1_788_000_000_000,
          clientOccurredAt: '2026-09-06T10:00:00.000Z',
        }),
      },
    )

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ evidence })
    expect(received).toMatchObject({ visitId: 'visit-1', ownerUserId: 'user-1' })
  })

  it('rejects malformed location evidence payloads', async () => {
    const app = createVisitApi(dependencies(repository()))

    const response = await app.request(
      '/workspaces/workspace-a/visits/visit-1/location-evidence',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'evidence-1', latitude: 999, longitude: 0 }),
      },
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'invalid_location_evidence' })
  })

  it('maps unknown visits on evidence push to a stable 404', async () => {
    const app = createVisitApi(
      dependencies(
        repository({
          recordLocationEvidence: async () => {
            throw new Error('location_evidence_visit_not_found')
          },
        }),
      ),
    )

    const response = await app.request(
      '/workspaces/workspace-a/visits/visit-missing/location-evidence',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 'evidence-1',
          latitude: 35.6892,
          longitude: 51.389,
          accuracyMeters: 12,
          altitudeMeters: null,
          captureMode: 'offline',
          capturedAt: 1_788_000_000_000,
          clientOccurredAt: '2026-09-06T10:00:00.000Z',
        }),
      },
    )

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'visit_not_found' })
  })

  it('maps duplicate evidence pushes to a stable conflict', async () => {
    const app = createVisitApi(
      dependencies(
        repository({
          recordLocationEvidence: async () => {
            throw new Error('location_evidence_conflict')
          },
        }),
      ),
    )

    const response = await app.request(
      '/workspaces/workspace-a/visits/visit-1/location-evidence',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 'evidence-2',
          latitude: 35.6892,
          longitude: 51.389,
          accuracyMeters: 12,
          altitudeMeters: null,
          captureMode: 'gps',
          capturedAt: 1_788_000_000_000,
          clientOccurredAt: '2026-09-06T10:00:00.000Z',
        }),
      },
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'location_evidence_conflict' })
  })

  it('returns stored evidence under read permission', async () => {
    const app = createVisitApi(
      dependencies(repository({ getLocationEvidence: async () => evidence })),
    )

    const response = await app.request(
      '/workspaces/workspace-a/visits/visit-1/location-evidence',
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ evidence })
  })

  it('returns 404 when no evidence exists for the visit', async () => {
    const app = createVisitApi(dependencies(repository()))

    const response = await app.request(
      '/workspaces/workspace-a/visits/visit-1/location-evidence',
    )

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'location_evidence_not_found' })
  })
})

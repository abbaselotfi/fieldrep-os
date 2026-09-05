import type { AuthContext, ProductSummary, VisitActual } from '@fieldrep/domain'
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

function repository(overrides: Partial<VisitApiRepository> = {}): VisitApiRepository {
  return {
    listProducts: async () => [product],
    listVisits: async () => [],
    createCompletedVisit: async () => visit,
    cancelVisit: async () => true,
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
})

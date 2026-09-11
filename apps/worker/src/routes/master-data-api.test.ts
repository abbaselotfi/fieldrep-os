import type { AuthContext } from '@fieldrep/domain'
import { describe, expect, it } from 'vitest'

import {
  createMasterDataApi,
  type MasterDataDependencies,
  type MasterDataGateway,
} from './master-data-api'

function authContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'admin-1',
    membershipId: 'membership-a1',
    companyId: 'company-1',
    workspaceId: 'workspace-a',
    roleKeys: ['workspace_admin'],
    permissions: [
      'routes.manage.workspace',
      'products.manage.workspace',
      'customers.manage.workspace',
    ],
    scopes: [{ type: 'workspace', id: 'workspace-a' }],
    ...overrides,
  }
}

function gateway(overrides: Partial<MasterDataGateway> = {}): MasterDataGateway {
  return {
    listRoutes: async () => [{ id: 'r1', code: 'R1', name: 'Route 1', status: 'active' }],
    upsertRoute: async () => {},
    archiveRoute: async () => true,
    listProducts: async () => [{ id: 'p1', code: 'P1', name: 'Product 1', sortOrder: 0, status: 'active' }],
    upsertProduct: async () => {},
    archiveProduct: async () => true,
    listCustomers: async () => [{ id: 'c1', type: 'doctor', displayName: 'Dr. Ahmadi', status: 'active' }],
    upsertCustomer: async () => {},
    archiveCustomer: async () => true,
    ...overrides,
  }
}

function dependencies(
  gw: MasterDataGateway,
  context: AuthContext | null = authContext(),
): MasterDataDependencies {
  return {
    authContextResolver: { resolve: async () => context },
    masterDataForWorkspace: async (workspaceId) => {
      expect(workspaceId).toBe('workspace-a')
      return gw
    },
  }
}

describe('master-data API', () => {
  it('requires authentication before listing routes', async () => {
    const app = createMasterDataApi(dependencies(gateway(), null))
    const response = await app.request('/workspaces/workspace-a/master-data/routes')
    expect(response.status).toBe(401)
  })

  it('requires workspace permission for routes', async () => {
    const app = createMasterDataApi(
      dependencies(gateway(), authContext({ permissions: ['plans.read.own'] })),
    )
    const response = await app.request('/workspaces/workspace-a/master-data/routes')
    expect(response.status).toBe(403)
  })

  it('rejects cross-workspace access before gateway resolution', async () => {
    let resolved = false
    const app = createMasterDataApi({
      authContextResolver: { resolve: async () => authContext() },
      masterDataForWorkspace: async () => {
        resolved = true
        return gateway()
      },
    })
    const response = await app.request('/workspaces/workspace-b/master-data/routes')
    expect(response.status).toBe(403)
    expect(resolved).toBe(false)
  })

  it('lists routes with proper permission', async () => {
    const app = createMasterDataApi(dependencies(gateway()))
    const response = await app.request('/workspaces/workspace-a/master-data/routes')
    expect(response.status).toBe(200)
    const body = (await response.json()) as { routes: readonly { id: string }[] }
    expect(body.routes).toHaveLength(1)
    expect(body.routes[0]!.id).toBe('r1')
  })

  it('creates a route with valid input', async () => {
    let upserted: { id: string; name: string } | null = null
    const gw = gateway({
      upsertRoute: async (input) => {
        upserted = { id: input.id, name: input.name }
      },
    })
    const app = createMasterDataApi(dependencies(gw))
    const response = await app.request('/workspaces/workspace-a/master-data/routes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'r2', code: 'R2', name: 'Route 2' }),
    })
    expect(response.status).toBe(204)
    expect(upserted).toEqual({ id: 'r2', name: 'Route 2' })
  })

  it('rejects invalid route input', async () => {
    const app = createMasterDataApi(dependencies(gateway()))
    const response = await app.request('/workspaces/workspace-a/master-data/routes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: '', name: '' }),
    })
    expect(response.status).toBe(400)
  })

  it('archives a route', async () => {
    let archivedId: string | null = null
    const gw = gateway({
      archiveRoute: async (id) => {
        archivedId = id
        return true
      },
    })
    const app = createMasterDataApi(dependencies(gw))
    const response = await app.request('/workspaces/workspace-a/master-data/routes/r1', {
      method: 'DELETE',
    })
    expect(response.status).toBe(204)
    expect(archivedId).toBe('r1')
  })

  it('returns 404 when archiving a non-existent route', async () => {
    const gw = gateway({ archiveRoute: async () => false })
    const app = createMasterDataApi(dependencies(gw))
    const response = await app.request('/workspaces/workspace-a/master-data/routes/missing', {
      method: 'DELETE',
    })
    expect(response.status).toBe(404)
  })

  it('lists products with proper permission', async () => {
    const app = createMasterDataApi(dependencies(gateway()))
    const response = await app.request('/workspaces/workspace-a/master-data/products')
    expect(response.status).toBe(200)
    const body = (await response.json()) as { products: readonly { id: string }[] }
    expect(body.products).toHaveLength(1)
  })

  it('lists customers with proper permission', async () => {
    const app = createMasterDataApi(dependencies(gateway()))
    const response = await app.request('/workspaces/workspace-a/master-data/customers')
    expect(response.status).toBe(200)
    const body = (await response.json()) as { customers: readonly { id: string }[] }
    expect(body.customers).toHaveLength(1)
  })

  it('creates a customer with doctor profile', async () => {
    let upserted: { id: string; displayName: string } | null = null
    const gw = gateway({
      upsertCustomer: async (input) => {
        upserted = { id: input.id, displayName: input.displayName }
      },
    })
    const app = createMasterDataApi(dependencies(gw))
    const response = await app.request('/workspaces/workspace-a/master-data/customers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'c2',
        type: 'doctor',
        displayName: 'Dr. Rezaei',
        doctorProfile: { specialty: 'Cardio', classKey: 'A', requiredFrequency: 4 },
      }),
    })
    expect(response.status).toBe(204)
    expect(upserted).toEqual({ id: 'c2', displayName: 'Dr. Rezaei' })
  })
})

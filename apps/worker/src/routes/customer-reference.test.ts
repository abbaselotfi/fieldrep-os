import type { AuthContext, CustomerDetail, CustomerSummary, RouteSummary } from '@fieldrep/domain'
import { describe, expect, it } from 'vitest'

import {
  createCustomerReferenceApi,
  type CustomerReferenceApiDependencies,
  type CustomerReferenceRepository,
} from './customer-reference'

function authContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    membershipId: 'membership-1',
    companyId: 'company-1',
    workspaceId: 'workspace-a',
    roleKeys: ['user'],
    permissions: ['customers.read.assigned'],
    scopes: [{ type: 'self' }],
    ...overrides,
  }
}

function dependencies(
  repository: CustomerReferenceRepository,
  context: AuthContext | null = authContext(),
): CustomerReferenceApiDependencies {
  return {
    authContextResolver: {
      resolve: async () => context,
    },
    repositoryForWorkspace: async (workspaceId) => {
      expect(workspaceId).toBe('workspace-a')
      return repository
    },
  }
}

function repository(overrides: Partial<CustomerReferenceRepository> = {}): CustomerReferenceRepository {
  return {
    listRoutes: async (): Promise<RouteSummary[]> => [],
    listCustomers: async (): Promise<CustomerSummary[]> => [],
    getCustomer: async (): Promise<CustomerDetail | null> => null,
    ...overrides,
  }
}

const customer: CustomerDetail = {
  id: 'doctor-1',
  workspaceId: 'workspace-a',
  type: 'doctor',
  displayName: 'دکتر نمونه',
  status: 'active',
  recordScope: 'workspace',
  source: 'company',
  ownerUserId: null,
  primaryRoute: { id: 'route-1', code: 'R8', name: 'منطقه ۸' },
  doctorProfile: { specialty: 'Internal Medicine', classKey: 'A', requiredFrequency: 6 },
  locationCount: 1,
  routes: [{ id: 'route-1', code: 'R8', name: 'منطقه ۸' }],
  locations: [
    {
      id: 'location-1',
      label: 'مطب',
      address: 'مشهد',
      province: 'خراسان رضوی',
      city: 'مشهد',
      district: null,
      latitude: 36.29,
      longitude: 59.59,
      isPrimary: true,
    },
  ],
}

describe('customer reference API', () => {
  it('requires authentication', async () => {
    const app = createCustomerReferenceApi(dependencies(repository(), null))
    const response = await app.request('/workspaces/workspace-a/customers')

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'authentication_required' })
  })

  it('requires customer read permission', async () => {
    const app = createCustomerReferenceApi(
      dependencies(repository(), authContext({ permissions: [] })),
    )
    const response = await app.request('/workspaces/workspace-a/customers')

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'permission_denied',
      permission: 'customers.read.assigned',
    })
  })

  it('rejects cross-workspace requests before repository resolution', async () => {
    let repositoryResolved = false
    const app = createCustomerReferenceApi({
      authContextResolver: { resolve: async () => authContext() },
      repositoryForWorkspace: async () => {
        repositoryResolved = true
        return repository()
      },
    })

    const response = await app.request('/workspaces/workspace-b/customers')

    expect(response.status).toBe(403)
    expect(repositoryResolved).toBe(false)
    await expect(response.json()).resolves.toEqual({ error: 'workspace_scope_denied' })
  })

  it('lists routes for the active workspace', async () => {
    const app = createCustomerReferenceApi(
      dependencies(
        repository({
          listRoutes: async () => [{ id: 'route-1', code: 'R8', name: 'منطقه ۸' }],
        }),
      ),
    )

    const response = await app.request('/workspaces/workspace-a/routes')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      routes: [{ id: 'route-1', code: 'R8', name: 'منطقه ۸' }],
    })
  })

  it('passes sanitized customer filters and authenticated user id to the repository', async () => {
    const repo = repository({
      listCustomers: async (userId, filters) => {
        expect(userId).toBe('user-1')
        expect(filters).toEqual({
          search: 'رضایی',
          routeId: 'route-1',
          classKey: 'A',
          specialty: 'Internal Medicine',
        })
        return [customer]
      },
    })
    const app = createCustomerReferenceApi(dependencies(repo))

    const response = await app.request(
      '/workspaces/workspace-a/customers?search=%20%D8%B1%D8%B6%D8%A7%DB%8C%DB%8C%20&routeId=route-1&classKey=A&specialty=Internal%20Medicine',
    )

    expect(response.status).toBe(200)
    const payload = (await response.json()) as { customers: CustomerSummary[] }
    expect(payload.customers).toHaveLength(1)
  })

  it('returns customer detail or a non-enumerating 404', async () => {
    const visibleApp = createCustomerReferenceApi(
      dependencies(repository({ getCustomer: async () => customer })),
    )
    const visibleResponse = await visibleApp.request('/workspaces/workspace-a/customers/doctor-1')
    expect(visibleResponse.status).toBe(200)

    const hiddenApp = createCustomerReferenceApi(dependencies(repository()))
    const hiddenResponse = await hiddenApp.request('/workspaces/workspace-a/customers/private-doctor')
    expect(hiddenResponse.status).toBe(404)
    await expect(hiddenResponse.json()).resolves.toEqual({ error: 'customer_not_found' })
  })
})

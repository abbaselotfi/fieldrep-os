import type { AuthContext } from '@fieldrep/domain'
import { describe, expect, it } from 'vitest'

import {
  createPlatformAdminApi,
  type PlatformAdminDependencies,
  type PlatformAdminGateway,
} from './platform-admin-api'

function authContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'platform-admin-1',
    membershipId: 'membership-pa1',
    companyId: 'company-1',
    workspaceId: 'workspace-a',
    roleKeys: ['platform_admin'],
    permissions: [
      'companies.read',
      'companies.manage',
      'workspaces.read.all',
      'workspaces.manage',
      'limits.read',
      'limits.manage',
    ],
    scopes: [{ type: 'platform' }],
    ...overrides,
  }
}

function gateway(overrides: Partial<PlatformAdminGateway> = {}): PlatformAdminGateway {
  return {
    listCompanies: async () => [{ id: 'c1', name: 'Acme Pharma', slug: 'acme', status: 'active' }],
    createCompany: async (input) => ({ id: input.id, name: input.name, slug: input.slug ?? input.name.toLowerCase(), status: 'active' }),
    listWorkspaces: async () => [{ id: 'w1', name: 'Tehran', slug: 'tehran', status: 'active' }],
    createWorkspace: async (input) => ({ id: input.id, name: input.name, slug: input.slug ?? input.name.toLowerCase(), status: 'active' }),
    getLimits: async () => ({ companyId: 'c1', maxWorkspaces: 5, maxUsersPerWorkspace: 50, maxStorageMb: 1000, maxImportsPerCycle: 10, usedWorkspaces: 1, usedUsers: 0 }),
    updateLimits: async () => true,
    ...overrides,
  }
}

function dependencies(
  gw: PlatformAdminGateway,
  context: AuthContext | null = authContext(),
): PlatformAdminDependencies {
  return {
    authContextResolver: { resolve: async () => context },
    platformAdmin: () => gw,
  }
}

describe('platform-admin API', () => {
  it('requires authentication before listing companies', async () => {
    const app = createPlatformAdminApi(dependencies(gateway(), null))
    const response = await app.request('/platform/companies')
    expect(response.status).toBe(401)
  })

  it('requires companies.read permission', async () => {
    const app = createPlatformAdminApi(
      dependencies(gateway(), authContext({ permissions: ['plans.read.own'] })),
    )
    const response = await app.request('/platform/companies')
    expect(response.status).toBe(403)
  })

  it('lists companies with proper permission', async () => {
    const app = createPlatformAdminApi(dependencies(gateway()))
    const response = await app.request('/platform/companies')
    expect(response.status).toBe(200)
    const body = (await response.json()) as { companies: readonly { id: string }[] }
    expect(body.companies).toHaveLength(1)
    expect(body.companies[0]!.id).toBe('c1')
  })

  it('creates a company with valid input', async () => {
    let created: { id: string; name: string } | null = null
    const gw = gateway({
      createCompany: async (input) => {
        created = { id: input.id, name: input.name }
        return { id: input.id, name: input.name, slug: input.id, status: 'active' }
      },
    })
    const app = createPlatformAdminApi(dependencies(gw))
    const response = await app.request('/platform/companies', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'c2', name: 'BioPharma' }),
    })
    expect(response.status).toBe(201)
    expect(created).toEqual({ id: 'c2', name: 'BioPharma' })
  })

  it('rejects invalid company input', async () => {
    const app = createPlatformAdminApi(dependencies(gateway()))
    const response = await app.request('/platform/companies', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: '', name: '' }),
    })
    expect(response.status).toBe(400)
  })

  it('lists workspaces for a company', async () => {
    const app = createPlatformAdminApi(dependencies(gateway()))
    const response = await app.request('/platform/companies/c1/workspaces')
    expect(response.status).toBe(200)
    const body = (await response.json()) as { workspaces: readonly { id: string }[] }
    expect(body.workspaces).toHaveLength(1)
  })

  it('creates a workspace with valid input', async () => {
    let created: { id: string; name: string } | null = null
    const gw = gateway({
      createWorkspace: async (input) => {
        created = { id: input.id, name: input.name }
        return { id: input.id, name: input.name, slug: input.id, status: 'active' }
      },
    })
    const app = createPlatformAdminApi(dependencies(gw))
    const response = await app.request('/platform/companies/c1/workspaces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'w2', companyId: 'c1', name: 'Isfahan' }),
    })
    expect(response.status).toBe(201)
    expect(created).toEqual({ id: 'w2', name: 'Isfahan' })
  })

  it('returns limits for a company', async () => {
    const app = createPlatformAdminApi(dependencies(gateway()))
    const response = await app.request('/platform/companies/c1/limits')
    expect(response.status).toBe(200)
    const body = (await response.json()) as { limits: { maxWorkspaces: number; usedWorkspaces: number } }
    expect(body.limits.maxWorkspaces).toBe(5)
    expect(body.limits.usedWorkspaces).toBe(1)
  })

  it('returns 404 for limits of unknown company', async () => {
    const gw = gateway({ getLimits: async () => null })
    const app = createPlatformAdminApi(dependencies(gw))
    const response = await app.request('/platform/companies/unknown/limits')
    expect(response.status).toBe(404)
  })

  it('updates limits with valid patch', async () => {
    let patched: { maxWorkspaces: number | undefined } | null = null
    const gw = gateway({
      updateLimits: async (_companyId, patch) => {
        patched = { maxWorkspaces: patch.maxWorkspaces }
        return true
      },
    })
    const app = createPlatformAdminApi(dependencies(gw))
    const response = await app.request('/platform/companies/c1/limits', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ maxWorkspaces: 10 }),
    })
    expect(response.status).toBe(204)
    expect(patched!.maxWorkspaces).toBe(10)
  })

  it('rejects an empty limits patch', async () => {
    const app = createPlatformAdminApi(dependencies(gateway()))
    const response = await app.request('/platform/companies/c1/limits', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(response.status).toBe(400)
  })
})
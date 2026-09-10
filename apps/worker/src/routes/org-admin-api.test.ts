import type { AuthContext } from '@fieldrep/domain'
import { describe, expect, it } from 'vitest'

import {
  createOrgAdminApi,
  type OrgAdminDependencies,
  type OrgAdminGateway,
} from './org-admin-api'

function authContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'admin-1',
    membershipId: 'membership-a1',
    companyId: 'company-1',
    workspaceId: 'workspace-a',
    roleKeys: ['workspace_admin'],
    permissions: [
      'org_units.manage.workspace',
      'memberships.manage.workspace',
      'workspace.settings.manage',
    ],
    scopes: [{ type: 'workspace', id: 'workspace-a' }],
    ...overrides,
  }
}

const unitRows = [
  { id: 'team-a', parentId: null, name: 'A', unitType: 'team' },
  { id: 'sub-a1', parentId: 'team-a', name: 'A1', unitType: 'team' },
]

function gateway(overrides: Partial<OrgAdminGateway> = {}): OrgAdminGateway {
  return {
    listOrgUnits: async () => unitRows,
    moveOrgUnit: async () => null,
    assignMembership: async () => true,
    readFeatureSettings: async () => [
      {
        workspaceId: 'workspace-a',
        featureKey: 'ai_planning',
        enabled: true,
        updatedAt: 100,
      },
    ],
    setFeatureSettings: async () => {},
    ...overrides,
  }
}

function dependencies(
  g: OrgAdminGateway,
  context: AuthContext | null = authContext(),
): OrgAdminDependencies {
  return {
    authContextResolver: { resolve: async () => context },
    adminForWorkspace: async (workspaceId) => {
      expect(workspaceId).toBe('workspace-a')
      return g
    },
  }
}

describe('org-admin API', () => {
  it('requires workspace org-unit permission', async () => {
    const app = createOrgAdminApi(
      dependencies(gateway(), authContext({ permissions: ['workspace.settings.manage'] })),
    )
    const response = await app.request('/workspaces/workspace-a/org-units')
    expect(response.status).toBe(403)
  })

  it('rejects cross-workspace access before gateway resolution', async () => {
    let resolved = false
    const app = createOrgAdminApi({
      authContextResolver: { resolve: async () => authContext() },
      adminForWorkspace: async () => {
        resolved = true
        return gateway()
      },
    })
    const response = await app.request('/workspaces/workspace-b/org-units')
    expect(response.status).toBe(403)
    expect(resolved).toBe(false)
  })

  it('returns the org-unit tree', async () => {
    const app = createOrgAdminApi(dependencies(gateway()))
    const response = await app.request('/workspaces/workspace-a/org-units')
    expect(response.status).toBe(200)
    const body = (await response.json()) as { tree: { id: string; children: unknown[] }[] }
    expect(body.tree[0]!.id).toBe('team-a')
    expect(body.tree[0]!.children).toHaveLength(1)
  })

  it('rejects a cyclical org-unit move with 409', async () => {
    const app = createOrgAdminApi(
      dependencies(gateway({ moveOrgUnit: async () => 'new_parent_descendant' })),
    )
    const response = await app.request('/workspaces/workspace-a/org-units/team-a/parent', {
      method: 'PATCH',
      body: JSON.stringify({ newParentId: 'sub-a1' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(response.status).toBe(409)
    const body = (await response.json()) as { error: string }
    expect(body.error).toBe('org_unit_move_new_parent_descendant')
  })

  it('applies a valid org-unit move', async () => {
    const app = createOrgAdminApi(dependencies(gateway()))
    const response = await app.request('/workspaces/workspace-a/org-units/sub-a1/parent', {
      method: 'PATCH',
      body: JSON.stringify({ newParentId: null }),
      headers: { 'content-type': 'application/json' },
    })
    expect(response.status).toBe(204)
  })

  it('returns 404 when membership assignment fails', async () => {
    const app = createOrgAdminApi(
      dependencies(gateway({ assignMembership: async () => false })),
    )
    const response = await app.request('/workspaces/workspace-a/org-units/team-a/members', {
      method: 'POST',
      body: JSON.stringify({ membershipId: 'missing' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(response.status).toBe(404)
  })

  it('persists feature toggles and returns resolved states', async () => {
    let written: { key: string; enabled: boolean }[] = []
    const g = gateway({
      setFeatureSettings: async (patches) => {
        written = patches as { key: string; enabled: boolean }[]
      },
    })
    const app = createOrgAdminApi(dependencies(g))
    const response = await app.request('/workspaces/workspace-a/features', {
      method: 'PUT',
      body: JSON.stringify({ patches: [{ key: 'ai_planning', enabled: false }] }),
      headers: { 'content-type': 'application/json' },
    })
    expect(response.status).toBe(200)
    expect(written).toEqual([{ key: 'ai_planning', enabled: false }])
    const body = (await response.json()) as { states: { key: string; enabled: boolean }[] }
    expect(body.states.find((item) => item.key === 'ai_planning')!.enabled).toBe(true)
  })

  it('rejects an unknown feature key', async () => {
    const app = createOrgAdminApi(dependencies(gateway()))
    const response = await app.request('/workspaces/workspace-a/features', {
      method: 'PUT',
      body: JSON.stringify({ patches: [{ key: 'bogus_key', enabled: true }] }),
      headers: { 'content-type': 'application/json' },
    })
    expect(response.status).toBe(400)
  })
})
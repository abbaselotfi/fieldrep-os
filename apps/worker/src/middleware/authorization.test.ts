import type { AuthContext } from '@fieldrep/domain'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

import {
  attachAuthContext,
  requirePermission,
  requireWorkspacePermission,
  type AuthorizationEnv,
} from './authorization'

function authContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    membershipId: 'membership-1',
    companyId: 'company-1',
    workspaceId: 'workspace-1',
    roleKeys: ['user'],
    permissions: ['plans.read.own'],
    scopes: [{ type: 'self' }],
    ...overrides,
  }
}

function resolver(value: AuthContext | null) {
  return {
    resolve: async () => value,
  }
}

describe('authorization middleware', () => {
  it('returns 401 before protected handlers when authentication cannot be resolved', async () => {
    const app = new Hono<AuthorizationEnv>()
    app.use('/protected', attachAuthContext(resolver(null)))
    app.get('/protected', (c) => c.json({ ok: true }))

    const response = await app.request('/protected')

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'authentication_required' })
  })

  it('returns 403 when the authenticated membership lacks the required permission', async () => {
    const app = new Hono<AuthorizationEnv>()
    app.use('/protected', attachAuthContext(resolver(authContext({ permissions: [] }))))
    app.get('/protected', requirePermission('plans.read.own'), (c) => c.json({ ok: true }))

    const response = await app.request('/protected')

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'permission_denied',
      permission: 'plans.read.own',
    })
  })

  it('allows the handler when the authenticated membership has the permission', async () => {
    const app = new Hono<AuthorizationEnv>()
    app.use('/protected', attachAuthContext(resolver(authContext())))
    app.get('/protected', requirePermission('plans.read.own'), (c) => {
      const context = c.get('authContext')
      return c.json({ ok: true, userId: context.userId })
    })

    const response = await app.request('/protected')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, userId: 'user-1' })
  })

  it('fails closed when a route targets another workspace even with a valid permission', async () => {
    const app = new Hono<AuthorizationEnv>()
    app.use('/workspaces/*', attachAuthContext(resolver(authContext())))
    app.get(
      '/workspaces/:workspaceId/plans',
      requireWorkspacePermission('plans.read.own'),
      (c) => c.json({ ok: true }),
    )

    const response = await app.request('/workspaces/workspace-2/plans')

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'workspace_scope_denied' })
  })

  it('allows an explicitly matching workspace route', async () => {
    const app = new Hono<AuthorizationEnv>()
    app.use('/workspaces/*', attachAuthContext(resolver(authContext())))
    app.get(
      '/workspaces/:workspaceId/plans',
      requireWorkspacePermission('plans.read.own'),
      (c) => c.json({ ok: true }),
    )

    const response = await app.request('/workspaces/workspace-1/plans')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
  })
})

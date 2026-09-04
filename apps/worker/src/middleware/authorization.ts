import type { AuthContext, PermissionKey } from '@fieldrep/domain'
import { hasPermission } from '@fieldrep/permissions'
import { createMiddleware } from 'hono/factory'

export interface AuthorizationVariables {
  authContext: AuthContext
}

export type AuthorizationEnv = {
  Variables: AuthorizationVariables
}

export interface AuthContextResolver {
  resolve(request: Request): Promise<AuthContext | null>
}

export function attachAuthContext(resolver: AuthContextResolver) {
  return createMiddleware<AuthorizationEnv>(async (c, next) => {
    const authContext = await resolver.resolve(c.req.raw)

    if (authContext === null) {
      return c.json({ error: 'authentication_required' }, 401)
    }

    c.set('authContext', authContext)
    await next()
  })
}

export function requirePermission(permission: PermissionKey) {
  return createMiddleware<AuthorizationEnv>(async (c, next) => {
    const authContext = c.get('authContext')

    if (authContext === undefined) {
      return c.json({ error: 'authentication_required' }, 401)
    }

    if (!hasPermission(authContext, permission)) {
      return c.json({ error: 'permission_denied', permission }, 403)
    }

    await next()
  })
}

export function requireWorkspacePermission(
  permission: PermissionKey,
  workspaceParameter = 'workspaceId',
) {
  return createMiddleware<AuthorizationEnv>(async (c, next) => {
    const authContext = c.get('authContext')

    if (authContext === undefined) {
      return c.json({ error: 'authentication_required' }, 401)
    }

    if (!hasPermission(authContext, permission)) {
      return c.json({ error: 'permission_denied', permission }, 403)
    }

    const requestedWorkspaceId = c.req.param(workspaceParameter)
    if (requestedWorkspaceId === undefined || requestedWorkspaceId !== authContext.workspaceId) {
      return c.json({ error: 'workspace_scope_denied' }, 403)
    }

    await next()
  })
}

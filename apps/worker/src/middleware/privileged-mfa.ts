import {
  evaluatePrivilegedMfa,
  requiresPrivilegedMfa,
  type MfaPolicy,
  type PrivilegedSessionState,
} from '@fieldrep/domain'
import { createMiddleware } from 'hono/factory'

import type { AuthorizationEnv } from './authorization'

/**
 * Privileged-role MFA step-up (P12-A1, §9). Runs after auth context and
 * permission checks: handlers guard *what* the caller may do, this middleware
 * guards *how fresh* their second factor is for privileged permissions. Only
 * `mfa_required` / `mfa_stale` refuse; everything else passes through.
 */

export interface PrivilegedSessionResolver {
  resolvePrivilegedSession(request: Request): Promise<PrivilegedSessionState | null>
}

export function requirePrivilegedMfa(dependencies: {
  sessionResolver: PrivilegedSessionResolver
  policy?: Partial<MfaPolicy> | null | undefined
  now?: (() => number) | undefined
}) {
  const now = dependencies.now ?? Date.now
  return createMiddleware<AuthorizationEnv>(async (c, next) => {
    const authContext = c.get('authContext')

    if (authContext === undefined) {
      return c.json({ error: 'authentication_required' }, 401)
    }

    const session = await dependencies.sessionResolver.resolvePrivilegedSession(c.req.raw)
    // An absent session binding is a configuration fault: privileged callers
    // fail closed with a distinct error, non-privileged ones pass through.
    if (session === null) {
      if (!requiresPrivilegedMfa(authContext.permissions)) {
        await next()
        return
      }
      return c.json({ error: 'mfa_setup_required' }, 403)
    }

    const decision = evaluatePrivilegedMfa({
      permissions: authContext.permissions,
      session: session ?? { mfaVerifiedAtMs: null },
      atMs: now(),
      policy: dependencies.policy,
    })

    if (decision === 'not_required' || decision === 'satisfied') {
      await next()
      return
    }

    if (decision === 'mfa_required') {
      return c.json({ error: 'mfa_required' }, 403)
    }

    return c.json({ error: 'mfa_stale' }, 403)
  })
}
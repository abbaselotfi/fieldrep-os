import { describe, expect, it } from 'vitest'
import type { WorkspaceMembershipContext } from './tenancy'
import type { SessionIdentity } from './session'
import { resolveAuthenticatedWorkspace } from './session'

const session: SessionIdentity = {
  sessionId: 'session-1',
  userId: 'user-1',
  expiresAt: '2026-09-12T00:00:00Z',
}

const membership = (
  userId: string,
  workspaceId: string,
): WorkspaceMembershipContext => ({
  id: `membership-${workspaceId}`,
  userId,
  company: {
    id: 'company-1',
    name: 'Example Pharma',
    slug: 'example-pharma',
  },
  workspace: {
    id: workspaceId,
    companyId: 'company-1',
    name: workspaceId,
    slug: workspaceId,
  },
  status: 'active',
  roleKeys: ['user'],
  permissions: ['plans.read.own'],
  scopes: [{ type: 'self' }],
})

describe('resolveAuthenticatedWorkspace', () => {
  it('builds auth context only from the authenticated user membership', () => {
    const result = resolveAuthenticatedWorkspace(session, [
      membership('user-2', 'other-user-workspace'),
      membership('user-1', 'diabetes'),
    ])

    expect(result.kind).toBe('authorized')
    if (result.kind === 'authorized') {
      expect(result.authContext.userId).toBe('user-1')
      expect(result.authContext.workspaceId).toBe('diabetes')
    }
  })

  it('never lets another user membership satisfy a requested workspace', () => {
    const result = resolveAuthenticatedWorkspace(
      session,
      [membership('user-2', 'cardiology'), membership('user-1', 'diabetes')],
      'cardiology',
    )

    expect(result).toMatchObject({
      kind: 'workspace_unavailable',
      reason: 'workspace_not_authorized',
    })
  })

  it('requires workspace selection for multiple active memberships of the same user', () => {
    const result = resolveAuthenticatedWorkspace(session, [
      membership('user-1', 'diabetes'),
      membership('user-1', 'cardiology'),
    ])

    expect(result.kind).toBe('workspace_selection_required')
  })
})

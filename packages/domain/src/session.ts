import type { UserId, WorkspaceId } from './identity'
import { toAuthContext, type AuthContext } from './auth-context'
import {
  resolveWorkspaceSelection,
  type WorkspaceMembershipContext,
} from './tenancy'

export type SessionId = string

export interface SessionIdentity {
  sessionId: SessionId
  userId: UserId
  expiresAt: string
  freshUntil?: string
}

export type AuthenticatedWorkspaceResolution =
  | {
      kind: 'authorized'
      session: SessionIdentity
      authContext: AuthContext
      membership: WorkspaceMembershipContext
    }
  | {
      kind: 'workspace_selection_required'
      session: SessionIdentity
      memberships: readonly WorkspaceMembershipContext[]
    }
  | {
      kind: 'workspace_unavailable'
      session: SessionIdentity
      reason: 'no_active_memberships' | 'workspace_not_authorized'
    }

export function resolveAuthenticatedWorkspace(
  session: SessionIdentity,
  memberships: readonly WorkspaceMembershipContext[],
  requestedWorkspaceId?: WorkspaceId,
): AuthenticatedWorkspaceResolution {
  const ownMemberships = memberships.filter((membership) => membership.userId === session.userId)
  const resolution = resolveWorkspaceSelection(ownMemberships, requestedWorkspaceId)

  if (resolution.kind === 'resolved') {
    return {
      kind: 'authorized',
      session,
      authContext: toAuthContext(resolution.membership),
      membership: resolution.membership,
    }
  }

  if (resolution.kind === 'selection_required') {
    return {
      kind: 'workspace_selection_required',
      session,
      memberships: resolution.memberships,
    }
  }

  return {
    kind: 'workspace_unavailable',
    session,
    reason: resolution.reason,
  }
}

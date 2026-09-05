import type {
  CompanyId,
  MembershipId,
  OrganizationUnitId,
  PermissionKey,
  RoleKey,
  UserId,
  WorkspaceId,
} from './identity'

export type MembershipStatus = 'active' | 'invited' | 'disabled' | 'archived'

export interface CompanySummary {
  id: CompanyId
  name: string
  slug: string
}

export interface WorkspaceSummary {
  id: WorkspaceId
  companyId: CompanyId
  name: string
  slug: string
}

export type ScopeGrant =
  | { type: 'platform' }
  | { type: 'company'; id: CompanyId }
  | { type: 'workspace'; id: WorkspaceId }
  | {
      type: 'organization_unit'
      id: OrganizationUnitId
      includeDescendants: boolean
    }
  | { type: 'user'; id: UserId }
  | { type: 'self' }

export interface WorkspaceMembershipContext {
  id: MembershipId
  userId: UserId
  company: CompanySummary
  workspace: WorkspaceSummary
  status: MembershipStatus
  roleKeys: readonly RoleKey[]
  permissions: readonly PermissionKey[]
  scopes: readonly ScopeGrant[]
}

export type WorkspaceSelectionResult =
  | {
      kind: 'resolved'
      membership: WorkspaceMembershipContext
    }
  | {
      kind: 'selection_required'
      memberships: readonly WorkspaceMembershipContext[]
    }
  | {
      kind: 'unavailable'
      reason: 'no_active_memberships' | 'workspace_not_authorized'
    }

export function resolveWorkspaceSelection(
  memberships: readonly WorkspaceMembershipContext[],
  requestedWorkspaceId?: WorkspaceId,
): WorkspaceSelectionResult {
  const activeMemberships = memberships.filter((membership) => membership.status === 'active')

  if (requestedWorkspaceId !== undefined) {
    const matchingMembership = activeMemberships.find(
      (membership) => membership.workspace.id === requestedWorkspaceId,
    )

    return matchingMembership
      ? { kind: 'resolved', membership: matchingMembership }
      : { kind: 'unavailable', reason: 'workspace_not_authorized' }
  }

  if (activeMemberships.length === 0) {
    return { kind: 'unavailable', reason: 'no_active_memberships' }
  }

  if (activeMemberships.length === 1) {
    return { kind: 'resolved', membership: activeMemberships[0]! }
  }

  return {
    kind: 'selection_required',
    memberships: activeMemberships,
  }
}

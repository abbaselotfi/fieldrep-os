import type {
  CompanyId,
  MembershipId,
  PermissionKey,
  RoleKey,
  UserId,
  WorkspaceId,
} from './identity'
import type { ScopeGrant, WorkspaceMembershipContext } from './tenancy'

export interface AuthContext {
  userId: UserId
  membershipId: MembershipId
  companyId: CompanyId
  workspaceId: WorkspaceId
  roleKeys: readonly RoleKey[]
  permissions: readonly PermissionKey[]
  scopes: readonly ScopeGrant[]
}

export function toAuthContext(membership: WorkspaceMembershipContext): AuthContext {
  return {
    userId: membership.userId,
    membershipId: membership.id,
    companyId: membership.company.id,
    workspaceId: membership.workspace.id,
    roleKeys: membership.roleKeys,
    permissions: membership.permissions,
    scopes: membership.scopes,
  }
}

export type UserId = string
export type MembershipId = string
export type CompanyId = string
export type WorkspaceId = string

export type ScopeType =
  | 'platform'
  | 'company'
  | 'workspace'
  | 'organization_unit'
  | 'user'
  | 'self'

export interface ScopeGrant {
  type: ScopeType
  id?: string
  includeDescendants?: boolean
}

export interface AuthContext {
  userId: UserId
  membershipId: MembershipId
  companyId: CompanyId
  workspaceId: WorkspaceId
  permissions: readonly string[]
  scopes: readonly ScopeGrant[]
}

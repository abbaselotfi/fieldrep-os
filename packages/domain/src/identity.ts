export type UserId = string
export type MembershipId = string
export type CompanyId = string
export type WorkspaceId = string
export type OrganizationUnitId = string
export type RoleId = string
export type RoleKey =
  | 'platform_admin'
  | 'company_admin'
  | 'workspace_admin'
  | 'supervisor'
  | 'user'
  | (string & {})
export type PermissionKey = string

export type UserId = string
export type MembershipId = string
export type CompanyId = string
export type WorkspaceId = string
export type OrganizationUnitId = string
export type RoleId = string
export type CustomerId = string
export type RouteId = string
export type ProductId = string
export type LocationId = string
export type PlanEntryId = string
export type VisitId = string
export type PlanningCycleId = string
export type ActivityId = string
export type CalendarEventId = string
export type LeaveRequestId = string
export type BusinessTripId = string
export type BusinessTripDestinationId = string
export type RoleKey =
  | 'platform_admin'
  | 'company_admin'
  | 'workspace_admin'
  | 'supervisor'
  | 'user'
  | (string & {})
export type PermissionKey = string

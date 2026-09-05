import type {
  AuthContext,
  CompanyId,
  OrganizationUnitId,
  PermissionKey,
  ScopeGrant,
  UserId,
  WorkspaceId,
} from '@fieldrep/domain'

export const FIELD_USER_PERMISSIONS = {
  planReadOwn: 'plans.read.own',
  planCreateOwn: 'plans.create.own',
  planUpdateOwn: 'plans.update.own',
  visitReadOwn: 'visits.read.own',
  visitCreateOwn: 'visits.create.own',
  reportReadOwn: 'reports.read.own',
  reportCreateOwn: 'reports.create.own',
  customerReadAssigned: 'customers.read.assigned',
  calendarReadOwn: 'calendar.read.own',
  activityReadOwn: 'activities.read.own',
  activityCreateOwn: 'activities.create.own',
  activityUpdateOwn: 'activities.update.own',
  activityCancelOwn: 'activities.cancel.own',
  leaveReadOwn: 'leave.read.own',
  leaveCreateOwn: 'leave.create.own',
  leaveRequestOwn: 'leave.request.own',
  leaveCancelOwn: 'leave.cancel.own',
  businessTripReadOwn: 'business_trip.read.own',
  businessTripCreateOwn: 'business_trip.create.own',
  businessTripRequestOwn: 'business_trip.request.own',
  businessTripCancelOwn: 'business_trip.cancel.own',
  businessTripCompleteOwn: 'business_trip.complete.own',
  settingsUpdateOwn: 'settings.update.own',
} as const satisfies Record<string, PermissionKey>

export interface ResourceScope {
  companyId: CompanyId
  workspaceId: WorkspaceId
  organizationUnitId?: OrganizationUnitId
  ownerUserId?: UserId
}

export interface ScopeEvaluationOptions {
  organizationUnitContains?: (
    grantedOrganizationUnitId: OrganizationUnitId,
    targetOrganizationUnitId: OrganizationUnitId,
  ) => boolean
}

export function hasPermission(context: AuthContext, permission: PermissionKey): boolean {
  return context.permissions.includes(permission)
}

export function isActiveWorkspace(context: AuthContext, workspaceId: WorkspaceId): boolean {
  return context.workspaceId === workspaceId
}

export function canAccessWorkspace(
  context: AuthContext,
  workspaceId: WorkspaceId,
  permission: PermissionKey,
): boolean {
  return isActiveWorkspace(context, workspaceId) && hasPermission(context, permission)
}

export function scopeGrantAllowsResource(
  context: AuthContext,
  grant: ScopeGrant,
  resource: ResourceScope,
  options: ScopeEvaluationOptions = {},
): boolean {
  switch (grant.type) {
    case 'platform':
      return true
    case 'company':
      return grant.id === resource.companyId
    case 'workspace':
      return grant.id === resource.workspaceId
    case 'user':
      return resource.ownerUserId !== undefined && grant.id === resource.ownerUserId
    case 'self':
      return resource.ownerUserId !== undefined && context.userId === resource.ownerUserId
    case 'organization_unit': {
      if (resource.organizationUnitId === undefined) return false
      if (grant.id === resource.organizationUnitId) return true
      return (
        grant.includeDescendants &&
        options.organizationUnitContains?.(grant.id, resource.organizationUnitId) === true
      )
    }
  }
}

export function hasApplicableScope(
  context: AuthContext,
  resource: ResourceScope,
  options: ScopeEvaluationOptions = {},
): boolean {
  if (context.companyId !== resource.companyId || context.workspaceId !== resource.workspaceId) {
    return false
  }
  return context.scopes.some((grant) => scopeGrantAllowsResource(context, grant, resource, options))
}

export function authorizeResource(
  context: AuthContext,
  permission: PermissionKey,
  resource: ResourceScope,
  options: ScopeEvaluationOptions = {},
): boolean {
  return hasPermission(context, permission) && hasApplicableScope(context, resource, options)
}

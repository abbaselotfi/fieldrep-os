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
  syncPushOwn: 'sync.push.own',
  syncPullOwn: 'sync.pull.own',
  settingsUpdateOwn: 'settings.update.own',
} as const satisfies Record<string, PermissionKey>

/**
 * Supervisor permissions (PERMISSION-MATRIX §7): team-scoped by default and
 * never automatically extended to the whole workspace — every team read is
 * additionally filtered through the supervisor's scope grants.
 */
export const SUPERVISOR_PERMISSIONS = {
  usersReadTeam: 'users.read.team',
  plansReadTeam: 'plans.read.team',
  reportsReadTeam: 'reports.read.team',
} as const satisfies Record<string, PermissionKey>

/**
 * Workspace admin permissions (PERMISSION-MATRIX §8). Workspace-scoped:
 * an admin never crosses into other workspaces unless separately assigned —
 * `authorizeResource` re-checks the resource workspace against active scope.
 */
export const WORKSPACE_ADMIN_PERMISSIONS = {
  workspaceRead: 'workspace.read',
  workspaceSettingsManage: 'workspace.settings.manage',
  usersReadWorkspace: 'users.read.workspace',
  membershipsManageWorkspace: 'memberships.manage.workspace',
  roleAssignmentsManageWorkspace: 'role_assignments.manage.workspace',
  orgUnitsManageWorkspace: 'org_units.manage.workspace',
  customersReadWorkspace: 'customers.read.workspace',
  customersManageWorkspace: 'customers.manage.workspace',
  importsManageWorkspace: 'imports.manage.workspace',
  productsManageWorkspace: 'products.manage.workspace',
  routesManageWorkspace: 'routes.manage.workspace',
  targetsManageWorkspace: 'targets.manage.workspace',
  calendarManageWorkspace: 'calendar.manage.workspace',
  holidaysManageWorkspace: 'holidays.manage.workspace',
  meetingsManageWorkspace: 'meetings.manage.workspace',
  programsManageWorkspace: 'programs.manage.workspace',
  reportsReadWorkspace: 'reports.read.workspace',
  reportsExportWorkspace: 'reports.export.workspace',
  visitVerificationReadWorkspace: 'visit_verification.read.workspace',
  auditReadWorkspace: 'audit.read.workspace',
} as const satisfies Record<string, PermissionKey>

/**
 * Company admin permissions (PERMISSION-MATRIX §9). Company scope is
 * authoritative: a company admin without an explicit workspace grant must not
 * see a workspace's detailed operational records just because they manage the
 * company.
 */
export const COMPANY_ADMIN_PERMISSIONS = {
  companyRead: 'company.read',
  companySettingsManage: 'company.settings.manage',
  workspacesReadCompany: 'workspaces.read.company',
  workspacesSettingsManage: 'workspaces.settings.manage',
  usersReadCompany: 'users.read.company',
  membershipsManageCompany: 'memberships.manage.company',
  orgUnitsReadCompany: 'org_units.read.company',
  holidaysManageCompany: 'holidays.manage.company',
  programsManageCompany: 'programs.manage.company',
  reportsReadCompany: 'reports.read.company',
  reportsExportCompany: 'reports.export.company',
  importsReadCompany: 'imports.read.company',
  datasetsRequestCompany: 'datasets.request.company',
  auditReadCompany: 'audit.read.company',
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
      if (resource.organizationUnitId === undefined) {
        return false
      }

      if (grant.id === resource.organizationUnitId) {
        return true
      }

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

export interface TeamMemberRef {
  userId: UserId
  organizationUnitId?: OrganizationUnitId
}

/**
 * Filters team members down to those the supervisor's scope grants actually
 * cover (PERMISSION-MATRIX §7 — team scope must not auto-extend). Callers
 * combine this with `hasPermission(context, 'users.read.team')` before use;
 * this helper only answers the scope question, per member.
 */
export function authorizedTeamMembers(
  context: AuthContext,
  members: readonly TeamMemberRef[],
  options: ScopeEvaluationOptions = {},
): TeamMemberRef[] {
  return members.filter((member) =>
    hasApplicableScope(
      context,
      {
        companyId: context.companyId,
        workspaceId: context.workspaceId,
        ...(member.organizationUnitId === undefined
          ? {}
          : { organizationUnitId: member.organizationUnitId }),
        ownerUserId: member.userId,
      },
      options,
    ),
  )
}

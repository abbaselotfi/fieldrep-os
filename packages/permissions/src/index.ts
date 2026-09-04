import type { AuthContext, WorkspaceId } from '@fieldrep/domain'

export function hasPermission(context: AuthContext, permission: string): boolean {
  return context.permissions.includes(permission)
}

export function isActiveWorkspace(context: AuthContext, workspaceId: WorkspaceId): boolean {
  return context.workspaceId === workspaceId
}

export function canAccessWorkspace(
  context: AuthContext,
  workspaceId: WorkspaceId,
  permission: string,
): boolean {
  return isActiveWorkspace(context, workspaceId) && hasPermission(context, permission)
}

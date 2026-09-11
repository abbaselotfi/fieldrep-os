import type { CompanyId, WorkspaceId } from './identity'

/**
 * Platform administration domain (P10) — company & workspace lifecycle,
 * limits/entitlements, global settings, workspace routing registry.
 *
 * Mirrors control-plane migration 0001 schema (companies/workspaces without
 * embedded limits — limits live in the dedicated `platform_limits` ledger).
 */

export type CompanyStatus = 'active' | 'suspended' | 'archived'
export type WorkspaceStatus = 'active' | 'suspended' | 'archived'

export interface Company {
  id: CompanyId
  name: string
  slug: string
  status: CompanyStatus
  createdAt: number
  updatedAt: number
}

export interface Workspace {
  id: WorkspaceId
  companyId: CompanyId
  name: string
  slug: string
  status: WorkspaceStatus
  createdAt: number
  updatedAt: number
}

export interface PlatformLimits {
  companyId: CompanyId
  maxWorkspaces: number
  maxUsersPerWorkspace: number
  maxStorageMb: number
  maxImportsPerCycle: number
  usedWorkspaces: number
  usedUsers: number
}

export interface CreateCompanyInput {
  id: CompanyId
  name: string
  slug?: string | undefined
  legalName?: string | null | undefined
  country?: string | null | undefined
}

export interface CreateWorkspaceInput {
  id: WorkspaceId
  companyId: CompanyId
  name: string
  slug?: string | undefined
}

export interface UpdateLimitsInput {
  maxWorkspaces?: number | undefined
  maxUsersPerWorkspace?: number | undefined
  maxStorageMb?: number | undefined
  maxImportsPerCycle?: number | undefined
  updatedByUserId?: string | undefined
}
export function deriveLimitsUsage(
  limits: Omit<PlatformLimits, 'usedWorkspaces' | 'usedUsers'>,
  usedWorkspaces: number,
  usedUsers: number,
): PlatformLimits {
  return { ...limits, usedWorkspaces, usedUsers }
}

export function canCreateWorkspace(limits: PlatformLimits): boolean {
  return limits.usedWorkspaces < limits.maxWorkspaces
}

export function canAddUser(limits: PlatformLimits): boolean {
  return limits.usedUsers < limits.maxUsersPerWorkspace
}

export function slugifyName(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '')
  return slug === '' ? `ws-${Date.now()}` : slug
}
import type { OrganizationUnitId, WorkspaceId } from './identity'

/**
 * Organization-unit administration helpers (P9-A1).
 *
 * Small, framework-free tree operations used by:
 *  - permissions scope evaluation (`includeDescendants` — PERMISSION-MATRIX §3);
 *  - workspace-admin org-unit management (P9 §org units);
 *  - supervisor team filtering (PERMISSION-MATRIX §7).
 *
 * Determinism: tree building and descendant collect are sorted by `id` so a
 * fact set always produces the same shape (audit-friendly).
 */

export interface OrgUnitRecord {
  id: OrganizationUnitId
  workspaceId: WorkspaceId
  parentId: OrganizationUnitId | null
  name: string
  unitType: string
}

export interface OrgUnitNode extends OrgUnitRecord {
  children: readonly OrgUnitNode[]
}

/**
 * Builds a rooted forest from flat unit records. Deterministic (children are
 * sorted by id). If a record references a missing parent the node is treated
 * as a root, so a partially loaded fact set never crashes consumers.
 */
export function buildOrgUnitTree(units: readonly OrgUnitRecord[]): readonly OrgUnitNode[] {
  const byId = new Map<OrganizationUnitId, OrgUnitNode>()
  const roots: OrgUnitNode[] = []

  for (const unit of units) {
    const node: OrgUnitNode = { ...unit, children: [] }
    byId.set(unit.id, node)
  }

  for (const node of byId.values()) {
    if (node.parentId === null) {
      roots.push(node)
      continue
    }
    const parent = byId.get(node.parentId)
    if (parent !== undefined && parent.workspaceId === node.workspaceId) {
      parent.children = [...parent.children, node].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    } else {
      roots.push(node)
    }
  }

  return roots.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/**
 * Collects every descendant id of `unitId` (including the unit itself when
 * `includeSelf` is true). Deterministic ascending order.
 */
export function collectOrgUnitDescendants(
  units: readonly OrgUnitRecord[],
  unitId: OrganizationUnitId,
  includeSelf = false,
): OrganizationUnitId[] {
  const childrenByParent = new Map<OrganizationUnitId, OrganizationUnitId[]>()
  for (const unit of units) {
    if (unit.parentId === null) continue
    const siblings = childrenByParent.get(unit.parentId) ?? []
    siblings.push(unit.id)
    childrenByParent.set(unit.parentId, siblings)
  }

  const result: OrganizationUnitId[] = []
  if (includeSelf) result.push(unitId)

  const stack = [unitId]
  while (stack.length > 0) {
    const current = stack.pop()!
    for (const child of childrenByParent.get(current) ?? []) {
      result.push(child)
      stack.push(child)
    }
  }

  return result.sort()
}

/**
 * Whether `targetUnitId` is `ancestorUnitId` itself or a descendant of it.
 * Companion to permissions `scopeGrantAllowsResource` (`organizationUnitContains`).
 */
export function orgUnitContains(
  units: readonly OrgUnitRecord[],
  ancestorUnitId: OrganizationUnitId,
  targetUnitId: OrganizationUnitId,
): boolean {
  if (ancestorUnitId === targetUnitId) return true
  return collectOrgUnitDescendants(units, ancestorUnitId, true).includes(targetUnitId)
}

export type OrgUnitParentChangeError =
  | 'unit_not_found'
  | 'new_parent_not_found'
  | 'new_parent_self'
  | 'new_parent_descendant'
  | 'workspace_mismatch'

/**
 * Validates a parent change for a unit, rejecting cycles and cross-workspace
 * links before any write. Returns null when the change is valid.
 */
export function validateOrgUnitParentChange(
  units: readonly OrgUnitRecord[],
  unitId: OrganizationUnitId,
  newParentId: OrganizationUnitId | null,
): OrgUnitParentChangeError | null {
  const unit = units.find((candidate) => candidate.id === unitId)
  if (unit === undefined) return 'unit_not_found'

  if (newParentId === null) return null

  const newParent = units.find((candidate) => candidate.id === newParentId)
  if (newParent === undefined) return 'new_parent_not_found'
  if (newParent.id === unitId) return 'new_parent_self'
  if (newParent.workspaceId !== unit.workspaceId) return 'workspace_mismatch'

  const descendants = collectOrgUnitDescendants(units, unitId, true)
  if (descendants.includes(newParentId)) return 'new_parent_descendant'

  return null
}
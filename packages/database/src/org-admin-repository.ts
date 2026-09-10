import type {
  MembershipId,
  OrgUnitParentChangeError,
  OrgUnitRecord,
  OrganizationUnitId,
  UserId,
  WorkspaceId,
} from '@fieldrep/domain'
import { validateOrgUnitParentChange } from '@fieldrep/domain'

import type { WorkspaceWritableDataStore } from './contracts'

/**
 * Organization administration repository (P9-A2).
 *
 * Thin workspace-scoped store over migration-0001 tables
 * (`organization_units`, `organization_memberships`, `workspace_settings`).
 * Every mutating method re-validates against the domain guards:
 *  - org-unit parent changes reject cycles / cross-workspace links;
 *  - membership assignment re-checks both the unit and the membership
 *    belong to this workspace before writing;
 *  - feature settings use the fail-closed `workspace-feature-policy` keys.
 */

export interface OrgUnitMembershipRow {
  id: MembershipId
  organizationUnitId: OrganizationUnitId
  membershipId: string
  userId: string
  relationshipType: string
}

export interface FeatureSettingPatch {
  key: string
  enabled: boolean
}

export interface OrgAdminRepository {
  listOrgUnits(): Promise<OrgUnitRecord[]>
  listMemberships(): Promise<OrgUnitMembershipRow[]>
  moveOrgUnit(input: {
    unitId: OrganizationUnitId
    newParentId: OrganizationUnitId | null
  }): Promise<OrgUnitParentChangeError | null>
  assignMembership(input: {
    unitId: OrganizationUnitId
    membershipId: string
    relationshipType?: string
  }): Promise<boolean>
  setFeatureSettings(patches: readonly FeatureSettingPatch[], updatedByUserId: UserId): Promise<void>
}

function mapOrgUnit(row: {
  id: string
  workspace_id: string
  parent_id: string | null
  name: string
  unit_type: string
}): OrgUnitRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    parentId: row.parent_id,
    name: row.name,
    unitType: row.unit_type,
  }
}

export function orgUnitContainsWorkspace(
  units: readonly OrgUnitRecord[],
  workspaceId: WorkspaceId,
  unitId: OrganizationUnitId,
): boolean {
  return units.some((unit) => unit.id === unitId && unit.workspaceId === workspaceId)
}
interface OrgUnitRow {
  id: string
  workspace_id: string
  parent_id: string | null
  name: string
  unit_type: string
}

export class WorkspaceOrgAdminRepository implements OrgAdminRepository {
  constructor(
    private readonly store: WorkspaceWritableDataStore,
    private readonly now: () => number = Date.now,
  ) {}

  async listOrgUnits(): Promise<OrgUnitRecord[]> {
    const rows = await this.store.queryAll<OrgUnitRow>(
      `SELECT id, workspace_id, parent_id, name, unit_type
       FROM organization_units
       WHERE workspace_id = ?
       ORDER BY id`,
      [this.store.workspaceId],
    )
    return rows.map(mapOrgUnit)
  }

  async listMemberships(): Promise<OrgUnitMembershipRow[]> {
    const rows = await this.store.queryAll<{
      id: string
      workspace_id: string
      organization_unit_id: string
      membership_id: string
      user_id: string
      relationship_type: string
    }>(
      `SELECT id, workspace_id, organization_unit_id, membership_id, user_id,
              relationship_type
       FROM organization_memberships
       WHERE workspace_id = ?
       ORDER BY id`,
      [this.store.workspaceId],
    )
    return rows.map((row) => ({
      id: row.id,
      organizationUnitId: row.organization_unit_id,
      membershipId: row.membership_id,
      userId: row.user_id,
      relationshipType: row.relationship_type,
    }))
  }
async moveOrgUnit(input: {
    unitId: OrganizationUnitId
    newParentId: OrganizationUnitId | null
  }): Promise<OrgUnitParentChangeError | null> {
    const units = await this.listOrgUnits()
    const error = validateOrgUnitParentChange(units, input.unitId, input.newParentId)
    if (error !== null) return error

    const now = this.now()
    await this.store.execute(
      `UPDATE organization_units
       SET parent_id = ?, updated_at = ?
       WHERE workspace_id = ? AND id = ?`,
      [input.newParentId, now, this.store.workspaceId, input.unitId],
    )
    return null
  }
async assignMembership(input: {
    unitId: OrganizationUnitId
    membershipId: string
    relationshipType?: string
  }): Promise<boolean> {
    const units = await this.listOrgUnits()
    if (!units.some((unit) => unit.id === input.unitId)) return false

    const membership = await this.store.queryFirst<{
      relationship_type: string
    }>(
      `SELECT relationship_type
       FROM organization_memberships
       WHERE workspace_id = ? AND membership_id = ? LIMIT 1`,
      [this.store.workspaceId, input.membershipId],
    )
    if (membership === null) return false

    const now = this.now()
    await this.store.execute(
      `UPDATE organization_memberships
       SET organization_unit_id = ?, relationship_type = ?, updated_at = ?
       WHERE workspace_id = ? AND membership_id = ?`,
      [
        input.unitId,
        input.relationshipType ?? membership.relationship_type,
        now,
        this.store.workspaceId,
        input.membershipId,
      ],
    )
    return true
  }

  async setFeatureSettings(
    patches: readonly FeatureSettingPatch[],
    updatedByUserId: UserId,
  ): Promise<void> {
    const now = this.now()
    for (const patch of patches) {
      await this.store.execute(
        `INSERT INTO workspace_settings (
           workspace_id, setting_key, value_json, updated_by_user_id, updated_at
         ) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(workspace_id, setting_key) DO UPDATE SET
           value_json = excluded.value_json,
           updated_by_user_id = excluded.updated_by_user_id,
           updated_at = excluded.updated_at`,
        [
          this.store.workspaceId,
          `feature:${patch.key}`,
          JSON.stringify({ enabled: patch.enabled }),
          updatedByUserId,
          now,
        ],
      )
    }
  }
}
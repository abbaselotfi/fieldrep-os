import type {
  CompanyId,
  FeatureEntitlement,
  PlatformGlobalSettings,
  PlatformGlobalSettingsPatch,
  UpsertEntitlementInput,
} from '@fieldrep/domain'
import {
  DEFAULT_PLATFORM_GLOBAL_SETTINGS,
  isEntitlementStatus,
  normalizePlatformGlobalSettings,
} from '@fieldrep/domain'

import type { D1DatabaseLike } from './contracts'

/**
 * Platform settings & entitlement repository (P10-A4).
 *
 * Control-plane access over the migration-0004 `platform_settings` ledger and
 * the migration-0001 `feature_entitlements` table. Reads are fail-safe:
 * missing settings rows fall back to `DEFAULT_PLATFORM_GLOBAL_SETTINGS`.
 */

export interface PlatformGlobalSettingsPatchInput extends PlatformGlobalSettingsPatch {
  updatedByUserId?: string | undefined
}

export interface PlatformSettingsRepository {
  getGlobalSettings(): Promise<PlatformGlobalSettings>
  updateGlobalSettings(patch: PlatformGlobalSettingsPatchInput): Promise<PlatformGlobalSettings>
  listEntitlements(companyId: CompanyId): Promise<readonly FeatureEntitlement[]>
  getEntitlement(
    companyId: CompanyId,
    featureKey: string,
    workspaceId?: string | undefined,
  ): Promise<FeatureEntitlement | null>
  upsertEntitlement(input: UpsertEntitlementInput): Promise<FeatureEntitlement>
}

interface SettingsRow {
  key: string
  value_json: string
  updated_at: number
}

interface EntitlementRow {
  id: string
  company_id: string
  workspace_id: string | null
  feature_key: string
  status: string
  starts_at: number | null
  ends_at: number | null
  config_json: string | null
  created_at: number
  updated_at: number
}

const GLOBAL_SETTINGS_KEY = 'global'

const ENTITLEMENT_COLUMNS =
  'id, company_id, workspace_id, feature_key, status, starts_at, ends_at, config_json, created_at, updated_at'

export class ControlPlanePlatformSettingsRepository implements PlatformSettingsRepository {
  constructor(
    private readonly db: D1DatabaseLike,
    private readonly now: () => number = Date.now,
  ) {}

  async getGlobalSettings(): Promise<PlatformGlobalSettings> {
    const row = await this.db
      .prepare('SELECT key, value_json, updated_at FROM platform_settings WHERE key = ? LIMIT 1')
      .bind(GLOBAL_SETTINGS_KEY)
      .first<SettingsRow>()
    if (row === null) return DEFAULT_PLATFORM_GLOBAL_SETTINGS
    const stored = safeParse(row.value_json)
    if (stored === null) return DEFAULT_PLATFORM_GLOBAL_SETTINGS
    return normalizePlatformGlobalSettings(DEFAULT_PLATFORM_GLOBAL_SETTINGS, stored)
  }

  async updateGlobalSettings(
    patch: PlatformGlobalSettingsPatchInput,
  ): Promise<PlatformGlobalSettings> {
    const current = await this.getGlobalSettings()
    const next = normalizePlatformGlobalSettings(current, patch)
    const stmt = this.db.prepare(
      `INSERT INTO platform_settings (key, value_json, updated_by_user_id, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value_json = excluded.value_json,
         updated_by_user_id = excluded.updated_by_user_id,
         updated_at = excluded.updated_at`,
    )
    await stmt
      .bind(GLOBAL_SETTINGS_KEY, JSON.stringify(next), patch.updatedByUserId ?? null, this.now())
      .run?.()
    return next
  }

  async listEntitlements(companyId: CompanyId): Promise<readonly FeatureEntitlement[]> {
    const rows = await this.db
      .prepare(
        `SELECT ${ENTITLEMENT_COLUMNS} FROM feature_entitlements
         WHERE company_id = ?
         ORDER BY feature_key, workspace_id`,
      )
      .bind(companyId)
      .all<EntitlementRow>()
    return rows.results.map(toEntitlement)
  }

  async getEntitlement(
    companyId: CompanyId,
    featureKey: string,
    workspaceId?: string | undefined,
  ): Promise<FeatureEntitlement | null> {
    const scoped =
      workspaceId === undefined
        ? 'workspace_id IS NULL'
        : 'workspace_id = ?'
    const values: unknown[] = workspaceId === undefined ? [companyId, featureKey] : [companyId, featureKey, workspaceId]
    const row = await this.db
      .prepare(
        `SELECT ${ENTITLEMENT_COLUMNS} FROM feature_entitlements
         WHERE company_id = ? AND feature_key = ? AND ${scoped}
         LIMIT 1`,
      )
      .bind(...values)
      .first<EntitlementRow>()
    return row ? toEntitlement(row) : null
  }

  async upsertEntitlement(input: UpsertEntitlementInput): Promise<FeatureEntitlement> {
    const now = this.now()
    const existing = await this.getEntitlement(input.companyId, input.featureKey, input.workspaceId)
    const startsAt = existing?.startsAt ?? null
    const endsAt = existing?.endsAt ?? null
    const nextStartsAt = input.startsAt === undefined ? startsAt : input.startsAt
    const nextEndsAt = input.endsAt === undefined ? endsAt : input.endsAt
    const config = input.config === undefined ? (existing?.config ?? null) : input.config

    if (existing === null) {
      const stmt = this.db.prepare(
        `INSERT INTO feature_entitlements
           (id, company_id, workspace_id, feature_key, status, config_json, starts_at, ends_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      await stmt
        .bind(
          input.id,
          input.companyId,
          input.workspaceId ?? null,
          input.featureKey,
          input.status,
          config === null ? null : JSON.stringify(config),
          nextStartsAt,
          nextEndsAt,
          now,
          now,
        )
        .run?.()
      return {
        id: input.id,
        companyId: input.companyId,
        workspaceId: input.workspaceId ?? null,
        featureKey: input.featureKey,
        status: input.status,
        startsAt: nextStartsAt,
        endsAt: nextEndsAt,
        config,
        createdAt: now,
        updatedAt: now,
      }
    }

    const stmt = this.db.prepare(
      `UPDATE feature_entitlements
       SET status = ?, config_json = ?, starts_at = ?, ends_at = ?, updated_at = ?
       WHERE id = ?`,
    )
    await stmt
      .bind(
        input.status,
        config === null ? null : JSON.stringify(config),
        nextStartsAt,
        nextEndsAt,
        now,
        existing.id,
      )
      .run?.()
    return {
      ...existing,
      status: input.status,
      startsAt: nextStartsAt,
      endsAt: nextEndsAt,
      config,
      updatedAt: now,
    }
  }
}

function safeParse(json: string): PlatformGlobalSettingsPatch | null {
  try {
    const parsed: unknown = JSON.parse(json)
    return parsed !== null && typeof parsed === 'object'
      ? (parsed as PlatformGlobalSettingsPatch)
      : null
  } catch {
    return null
  }
}

function toEntitlement(row: EntitlementRow): FeatureEntitlement {
  return {
    id: row.id,
    companyId: row.company_id,
    workspaceId: row.workspace_id,
    featureKey: row.feature_key,
    status: isEntitlementStatus(row.status) ? row.status : 'disabled',
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    config: row.config_json === null ? null : (JSON.parse(row.config_json) as Record<string, unknown>),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
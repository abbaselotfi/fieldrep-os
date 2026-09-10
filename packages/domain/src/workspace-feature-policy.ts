import type { WorkspaceId } from './identity'

/**
 * Workspace feature policy (P9-A1).
 *
 * Follows the P6-A2 decision: capability toggles are workspace-level policy,
 * consumed through an explicit in-memory settings projection rather than raw
 * `workspace_settings` rows. Unknown/absent keys resolve FAIL-CLOSED (off),
 * so a config typo disables a feature instead of silently enabling it.
 *
 * Competitive basis: Veeva Vault enterprise feature/licensing gates
 * (`COMPETITIVE-ANALYSIS.md` §3 — admin-controlled feature enablement).
 */

export type WorkspaceFeatureKey =
  | 'visit_verification'
  | 'offline_sync'
  | 'ai_planning'
  | 'maps_location'
  | 'supervisor_workspace'
  | 'company_admin_workspace'

export const WORKSPACE_FEATURE_KEYS: readonly WorkspaceFeatureKey[] = [
  'visit_verification',
  'offline_sync',
  'ai_planning',
  'maps_location',
  'supervisor_workspace',
  'company_admin_workspace',
]

export interface WorkspaceFeatureSetting {
  workspaceId: WorkspaceId
  featureKey: string
  enabled: boolean
  updatedAt: number
}

export interface WorkspaceFeatureState {
  key: WorkspaceFeatureKey
  enabled: boolean
  /** Whether the value came from configured policy or the fail-closed default. */
  fallback: boolean
}

/**
 * Resolves feature states for a workspace. Unknown keys are ignored; keys with
 * no configured row stay disabled via the fail-closed default. The latest
 * configured row (by `updatedAt`) wins for duplicate keys.
 */
export function resolveWorkspaceFeatureState(
  workspaceId: WorkspaceId,
  settings: readonly WorkspaceFeatureSetting[],
): WorkspaceFeatureState[] {
  const latest = new Map<string, WorkspaceFeatureSetting>()
  for (const setting of settings) {
    if (setting.workspaceId !== workspaceId) continue
    const current = latest.get(setting.featureKey)
    if (current === undefined || setting.updatedAt >= current.updatedAt) {
      latest.set(setting.featureKey, setting)
    }
  }

  return WORKSPACE_FEATURE_KEYS.map((key) => {
    const configured = latest.get(key)
    return {
      key,
      enabled: configured?.enabled ?? false,
      fallback: configured === undefined,
    }
  })
}

export function isWorkspaceFeatureEnabled(
  workspaceId: WorkspaceId,
  featureKey: WorkspaceFeatureKey,
  settings: readonly WorkspaceFeatureSetting[],
): boolean {
  const found = settings
    .filter((setting) => setting.workspaceId === workspaceId && setting.featureKey === featureKey)
    .reduce<WorkspaceFeatureSetting | undefined>((latest, setting) => {
      if (latest === undefined || setting.updatedAt >= latest.updatedAt) return setting
      return latest
    }, undefined)

  return found?.enabled ?? false
}
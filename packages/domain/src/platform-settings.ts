import type { CompanyId, WorkspaceId } from './identity'

/**
 * Global platform settings & feature entitlements (P10-A4).
 *
 * PERMISSION-MATRIX §10: platform-level configuration is separate from tenant
 * settings, and feature entitlements gate capability per company/workspace.
 * Entitlement resolution is fail-closed — anything not provably active counts
 * as disabled.
 */

export interface PlatformGlobalSettings {
  allowWorkspaceSelfService: boolean
  requireSupportAccessApproval: boolean
  supportAccessDefaultDurationMs: number
  defaultWorkspaceSchemaVersion: number
}

export const MIN_SUPPORT_ACCESS_DURATION_MS = 5 * 60 * 1000
export const MAX_SUPPORT_ACCESS_DURATION_MS = 30 * 24 * 60 * 60 * 1000

export const DEFAULT_PLATFORM_GLOBAL_SETTINGS: PlatformGlobalSettings = {
  // Fail-safe defaults: self-service provisioning is off, support access needs
  // approval, and the default window is a short 4 hours.
  allowWorkspaceSelfService: false,
  requireSupportAccessApproval: true,
  supportAccessDefaultDurationMs: 4 * 60 * 60 * 1000,
  defaultWorkspaceSchemaVersion: 1,
}

export interface PlatformGlobalSettingsPatch {
  allowWorkspaceSelfService?: boolean | undefined
  requireSupportAccessApproval?: boolean | undefined
  supportAccessDefaultDurationMs?: number | undefined
  defaultWorkspaceSchemaVersion?: number | undefined
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value) || !Number.isInteger(value)) return fallback
  return Math.min(Math.max(value, min), max)
}

/** Deterministic merge: unknown/malformed patch values fall back to base. */
export function normalizePlatformGlobalSettings(
  base: PlatformGlobalSettings,
  patch: PlatformGlobalSettingsPatch,
): PlatformGlobalSettings {
  return {
    allowWorkspaceSelfService: patch.allowWorkspaceSelfService ?? base.allowWorkspaceSelfService,
    requireSupportAccessApproval:
      patch.requireSupportAccessApproval ?? base.requireSupportAccessApproval,
    supportAccessDefaultDurationMs:
      patch.supportAccessDefaultDurationMs === undefined
        ? base.supportAccessDefaultDurationMs
        : clampNumber(
            patch.supportAccessDefaultDurationMs,
            MIN_SUPPORT_ACCESS_DURATION_MS,
            MAX_SUPPORT_ACCESS_DURATION_MS,
            base.supportAccessDefaultDurationMs,
          ),
    defaultWorkspaceSchemaVersion:
      patch.defaultWorkspaceSchemaVersion === undefined
        ? base.defaultWorkspaceSchemaVersion
        : clampNumber(
            patch.defaultWorkspaceSchemaVersion,
            1,
            Number.MAX_SAFE_INTEGER,
            base.defaultWorkspaceSchemaVersion,
          ),
  }
}

export type EntitlementStatus = 'enabled' | 'disabled' | 'scheduled' | 'expired'

export type ResolvedEntitlementState = 'enabled' | 'disabled'

export interface FeatureEntitlement {
  id: string
  companyId: CompanyId
  workspaceId: WorkspaceId | null
  featureKey: string
  status: EntitlementStatus
  startsAt: number | null
  endsAt: number | null
  config: Record<string, unknown> | null
  createdAt: number
  updatedAt: number
}

export interface UpsertEntitlementInput {
  id: string
  companyId: CompanyId
  workspaceId?: WorkspaceId | undefined
  featureKey: string
  status: EntitlementStatus
  /** undefined = keep the stored value, null = clear the bound. */
  startsAt?: number | null | undefined
  endsAt?: number | null | undefined
  config?: Record<string, unknown> | undefined
}

export function isEntitlementStatus(value: string): value is EntitlementStatus {
  return (
    value === 'enabled' || value === 'disabled' || value === 'scheduled' || value === 'expired'
  )
}

/** Rejects inverted windows before any write. */
export function validateEntitlementWindow(
  startsAt: number | null,
  endsAt: number | null,
): 'ok' | 'invalid_window' {
  if (startsAt === null || endsAt === null) return 'ok'
  return endsAt >= startsAt ? 'ok' : 'invalid_window'
}

/**
 * Fail-closed entitlement resolution: explicit disabled stays disabled,
 * not-yet-started and past-end windows resolve to disabled.
 */
export function resolveEntitlementState(
  entitlement: Pick<FeatureEntitlement, 'status' | 'startsAt' | 'endsAt'>,
  atMs: number,
): ResolvedEntitlementState {
  if (entitlement.status !== 'enabled' && entitlement.status !== 'scheduled') return 'disabled'
  if (entitlement.startsAt !== null && entitlement.startsAt > atMs) return 'disabled'
  if (entitlement.endsAt !== null && entitlement.endsAt <= atMs) return 'disabled'
  return 'enabled'
}
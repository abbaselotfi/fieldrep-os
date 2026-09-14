import type { CompanyId, UserId, WorkspaceId } from './identity'

/**
 * Platform operations contracts (P10-A2).
 *
 * Platform-scope audit events (mirroring the control-plane
 * `platform_audit_events` table) and the workspace data-route registry
 * (mirroring `workspace_data_routes`). Pure contracts + deterministic
 * guards — no storage access here.
 */

export type DataRouteStoreType = 'd1' | 'service' | 'sql' | 'other'

export type DataRouteStatus = 'active' | 'maintenance' | 'disabled'

export interface PlatformAuditEvent {
  id: string
  actorUserId: string | null
  actionKey: string
  targetType: string
  targetId: string | null
  companyId: string | null
  workspaceId: string | null
  metadata: Record<string, unknown> | null
  occurredAt: number
}

/**
 * Platform-scope filter: every field is optional narrowing — the platform
 * reader may never widen a tenant scope, only filter across it.
 */
export interface PlatformAuditEventFilter {
  companyId?: CompanyId | undefined
  workspaceId?: WorkspaceId | undefined
  actorUserId?: UserId | undefined
  actionKey?: string | undefined
  targetType?: string | undefined
  fromMs?: number | undefined
  toMs?: number | undefined
  limit: number
}

export interface WorkspaceDataRoute {
  workspaceId: WorkspaceId
  storeType: DataRouteStoreType
  storeIdentifier: string
  status: DataRouteStatus
  schemaVersion: number
  metadata: Record<string, unknown> | null
  createdAt: number
  updatedAt: number
}

export interface UpsertDataRouteInput {
  workspaceId: WorkspaceId
  storeType: DataRouteStoreType
  storeIdentifier: string
  status: DataRouteStatus
  schemaVersion: number
  metadata?: Record<string, unknown> | undefined
}

export interface RecordPlatformAuditEventInput {
  id: string
  actorUserId?: UserId | undefined
  actionKey: string
  targetType: string
  targetId?: string | undefined
  companyId?: CompanyId | undefined
  workspaceId?: WorkspaceId | undefined
  metadata?: Record<string, unknown> | undefined
}

export type RouteStatusChangeValidity = 'ok' | 'invalid_transition'

const ROUTE_STATUS_TRANSITIONS: Readonly<Record<DataRouteStatus, readonly DataRouteStatus[]>> = {
  active: ['active', 'maintenance', 'disabled'],
  maintenance: ['maintenance', 'active', 'disabled'],
  // Fail-closed: a disabled route may only return via `active` (forcing a
  // health re-check); `disabled → maintenance` bypassing active is rejected.
  disabled: ['disabled', 'active'],
}

export function validateRouteStatusChange(
  current: DataRouteStatus,
  next: DataRouteStatus,
): RouteStatusChangeValidity {
  return ROUTE_STATUS_TRANSITIONS[current].includes(next) ? 'ok' : 'invalid_transition'
}

export function isDataRouteStoreType(value: string): value is DataRouteStoreType {
  return value === 'd1' || value === 'service' || value === 'sql' || value === 'other'
}

export function isDataRouteStatus(value: string): value is DataRouteStatus {
  return value === 'active' || value === 'maintenance' || value === 'disabled'
}
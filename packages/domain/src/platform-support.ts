import type { UserId, WorkspaceId } from './identity'

/**
 * Platform support-access & analytics contracts (P10-A3).
 *
 * Support/data-access workflows per PERMISSION-MATRIX §10: platform access to
 * tenant workspaces must be governed, scoped, and auditable. Pure contracts +
 * deterministic guards — no storage access here.
 */

export type SupportAccessStatus = 'requested' | 'approved' | 'denied' | 'revoked' | 'expired'

export type SupportAccessDecision = 'approve' | 'deny' | 'revoke' | 'expire'

export const SUPPORT_ACCESS_DECISION_EVENTS: Readonly<
  Record<SupportAccessDecision, string>
> = {
  approve: 'support_access.approved',
  deny: 'support_access.denied',
  revoke: 'support_access.revoked',
  expire: 'support_access.expired',
}

export interface SupportAccessGrant {
  id: string
  workspaceId: WorkspaceId
  requestedByUserId: string | null
  reason: string
  status: SupportAccessStatus
  requestedAt: number
  decidedAt: number | null
  decidedByUserId: string | null
  expiresAt: number | null
  createdAt: number
  updatedAt: number
}

export interface CreateSupportAccessGrantInput {
  id: string
  workspaceId: WorkspaceId
  requestedByUserId?: UserId | undefined
  reason: string
  /** Proposed approval window in ms from decision time; null = indefinite. */
  durationMs?: number | undefined
}

export interface DecideSupportAccessInput {
  decision: SupportAccessDecision
  decidedByUserId?: UserId | undefined
  /** Approval window in ms from decision time (approve only); undefined = indefinite. */
  durationMs?: number | undefined
}

export type SupportAccessTransitionValidity = 'ok' | 'invalid_transition'

/** Grant read filter — optional narrowing only (matrix §10 governed access). */
export interface SupportAccessGrantFilter {
  workspaceId?: WorkspaceId | undefined
  status?: SupportAccessStatus | undefined
  limit: number
}

const SUPPORT_ACCESS_TRANSITIONS: Readonly<
  Record<SupportAccessStatus, readonly SupportAccessDecision[]>
> = {
  requested: ['approve', 'deny'],
  approved: ['revoke', 'expire'],
  // Terminal states — audited, immutable history.
  denied: [],
  revoked: [],
  expired: [],
}

export function validateSupportAccessTransition(
  current: SupportAccessStatus,
  decision: SupportAccessDecision,
): SupportAccessTransitionValidity {
  return SUPPORT_ACCESS_TRANSITIONS[current].includes(decision) ? 'ok' : 'invalid_transition'
}

export function isSupportAccessStatus(value: string): value is SupportAccessStatus {
  return (
    value === 'requested' ||
    value === 'approved' ||
    value === 'denied' ||
    value === 'revoked' ||
    value === 'expired'
  )
}

/** Fail-closed: only an unexpired `approved` grant is active. */
export function isSupportAccessActive(grant: SupportAccessGrant, atMs: number): boolean {
  if (grant.status !== 'approved') return false
  return grant.expiresAt === null || grant.expiresAt > atMs
}

export interface PlatformUsageOverview {
  companies: { total: number; active: number; suspended: number; archived: number }
  workspaces: { total: number; active: number; suspended: number; archived: number }
  dataRoutes: { total: number; active: number; maintenance: number; disabled: number }
}

function countStatuses(
  statuses: readonly string[],
  keys: readonly string[],
): { total: number } & Record<string, number> {
  const counts: Record<string, number> = { total: statuses.length }
  for (const key of keys) counts[key] = 0
  for (const status of statuses) {
    if (!(status in counts)) continue
    counts[status] = (counts[status] ?? 0) + 1
  }
  return counts as { total: number } & Record<string, number>
}

/** Deterministic usage rollup for the platform analytics surface. */
export function buildPlatformUsageOverview(input: {
  companyStatuses: readonly string[]
  workspaceStatuses: readonly string[]
  dataRouteStatuses: readonly string[]
}): PlatformUsageOverview {
  const companyKeys = ['active', 'suspended', 'archived'] as const
  const routeKeys = ['active', 'maintenance', 'disabled'] as const
  return {
    companies: countStatuses(input.companyStatuses, companyKeys) as PlatformUsageOverview['companies'],
    workspaces: countStatuses(input.workspaceStatuses, companyKeys) as PlatformUsageOverview['workspaces'],
    dataRoutes: countStatuses(input.dataRouteStatuses, routeKeys) as PlatformUsageOverview['dataRoutes'],
  }
}
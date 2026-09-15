import type {
  CreateSupportAccessGrantInput,
  DecideSupportAccessInput,
  PlatformUsageOverview,
  SupportAccessGrant,
  SupportAccessGrantFilter,
  SupportAccessStatus,
} from '@fieldrep/domain'
import { buildPlatformUsageOverview, isSupportAccessStatus, validateSupportAccessTransition } from '@fieldrep/domain'

import type { D1DatabaseLike } from './contracts'

/**
 * Support-access & platform analytics repository (P10-A3).
 *
 * Control-plane access over the migration-0003 `support_access_grants` ledger
 * plus status rollups from companies/workspaces/workspace_data_routes. Every
 * decision is domain-guarded before write; the caller records the audit event.
 */

export interface PlatformSupportRepository {
  listSupportAccessGrants(filters: SupportAccessGrantFilter): Promise<readonly SupportAccessGrant[]>
  getSupportAccessGrant(id: string): Promise<SupportAccessGrant | null>
  createSupportAccessGrant(input: CreateSupportAccessGrantInput): Promise<SupportAccessGrant>
  decideSupportAccessGrant(
    id: string,
    input: DecideSupportAccessInput,
  ): Promise<{ grant: SupportAccessGrant; transition: 'applied' | 'rejected' } | null>
  getUsageOverview(): Promise<PlatformUsageOverview>
}

interface GrantRow {
  id: string
  workspace_id: string
  requested_by_user_id: string | null
  reason: string
  status: string
  requested_at: number
  decided_at: number | null
  decided_by_user_id: string | null
  expires_at: number | null
  created_at: number
  updated_at: number
}

interface StatusCountRow {
  status: string
  count: number
}

const GRANT_COLUMNS =
  'id, workspace_id, requested_by_user_id, reason, status, requested_at, decided_at, decided_by_user_id, expires_at, created_at, updated_at'

export class ControlPlanePlatformSupportRepository implements PlatformSupportRepository {
  constructor(
    private readonly db: D1DatabaseLike,
    private readonly now: () => number = Date.now,
    private readonly maxLimit = 200,
  ) {}

  async listSupportAccessGrants(
    filters: SupportAccessGrantFilter,
  ): Promise<readonly SupportAccessGrant[]> {
    const conditions: string[] = []
    const values: unknown[] = []
    if (filters.workspaceId !== undefined) {
      conditions.push('workspace_id = ?')
      values.push(filters.workspaceId)
    }
    if (filters.status !== undefined) {
      conditions.push('status = ?')
      values.push(filters.status)
    }
    const where = conditions.length === 0 ? '' : `WHERE ${conditions.join(' AND ')}`
    const limit = Math.min(Math.max(1, filters.limit), this.maxLimit)
    const rows = await this.db
      .prepare(
        `SELECT ${GRANT_COLUMNS}
         FROM support_access_grants
         ${where}
         ORDER BY requested_at DESC, id
         LIMIT ${limit}`,
      )
      .bind(...values)
      .all<GrantRow>()
    return rows.results.map(toGrant)
  }

  async getSupportAccessGrant(id: string): Promise<SupportAccessGrant | null> {
    const row = await this.db
      .prepare(`SELECT ${GRANT_COLUMNS} FROM support_access_grants WHERE id = ? LIMIT 1`)
      .bind(id)
      .first<GrantRow>()
    return row ? toGrant(row) : null
  }

  async createSupportAccessGrant(input: CreateSupportAccessGrantInput): Promise<SupportAccessGrant> {
    const now = this.now()
    const stmt = this.db.prepare(
      `INSERT INTO support_access_grants
         (id, workspace_id, requested_by_user_id, reason, status, requested_at, decided_at, decided_by_user_id, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'requested', ?, NULL, NULL, NULL, ?, ?)`,
    )
    await stmt
      .bind(input.id, input.workspaceId, input.requestedByUserId ?? null, input.reason, now, now, now)
      .run?.()
    return {
      id: input.id,
      workspaceId: input.workspaceId,
      requestedByUserId: input.requestedByUserId ?? null,
      reason: input.reason,
      status: 'requested',
      requestedAt: now,
      decidedAt: null,
      decidedByUserId: null,
      expiresAt: null,
      createdAt: now,
      updatedAt: now,
    }
  }

  async decideSupportAccessGrant(
    id: string,
    input: DecideSupportAccessInput,
  ): Promise<{ grant: SupportAccessGrant; transition: 'applied' | 'rejected' } | null> {
    const grant = await this.getSupportAccessGrant(id)
    if (grant === null) return null
    if (validateSupportAccessTransition(grant.status, input.decision) === 'invalid_transition') {
      return { grant, transition: 'rejected' }
    }
    const now = this.now()
    const nextStatus: SupportAccessStatus =
      input.decision === 'approve'
        ? 'approved'
        : input.decision === 'deny'
          ? 'denied'
          : input.decision === 'revoke'
            ? 'revoked'
            : 'expired'
    const expiresAt =
      input.decision === 'approve' && input.durationMs !== undefined
        ? now + input.durationMs
        : grant.expiresAt
    const stmt = this.db.prepare(
      `UPDATE support_access_grants
       SET status = ?, decided_at = ?, decided_by_user_id = ?, expires_at = ?, updated_at = ?
       WHERE id = ?`,
    )
    await stmt.bind(nextStatus, now, input.decidedByUserId ?? null, expiresAt, now, id).run?.()
    return {
      grant: {
        ...grant,
        status: nextStatus,
        decidedAt: now,
        decidedByUserId: input.decidedByUserId ?? null,
        expiresAt,
        updatedAt: now,
      },
      transition: 'applied',
    }
  }

  async getUsageOverview(): Promise<PlatformUsageOverview> {
    const rollup = async (table: string): Promise<string[]> => {
      const rows = await this.db
        .prepare(`SELECT status, COUNT(*) AS count FROM ${table} GROUP BY status`)
        .bind()
        .all<StatusCountRow>()
      const statuses: string[] = []
      for (const row of rows.results) {
        for (let i = 0; i < row.count; i += 1) statuses.push(row.status)
      }
      return statuses
    }
    return buildPlatformUsageOverview({
      companyStatuses: await rollup('companies'),
      workspaceStatuses: await rollup('workspaces'),
      dataRouteStatuses: await rollup('workspace_data_routes'),
    })
  }
}

function toGrant(row: GrantRow): SupportAccessGrant {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    requestedByUserId: row.requested_by_user_id,
    reason: row.reason,
    status: isSupportAccessStatus(row.status) ? row.status : 'requested',
    requestedAt: row.requested_at,
    decidedAt: row.decided_at,
    decidedByUserId: row.decided_by_user_id,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
import type {
  BackupDrillRecord,
  BackupScope,
  CompleteBackupDrillInput,
  LifecycleEvent,
  LifecycleEventInput,
  RetentionPolicy,
  StartBackupDrillInput,
} from '@fieldrep/domain'
import {
  isRecordableLifecycleEvent,
  normalizeRetentionPolicy,
  startBackupDrill,
  validateDrillCompletion,
} from '@fieldrep/domain'

import type { D1DatabaseLike } from './contracts'

/**
 * Data lifecycle & recovery repository (P12-A3).
 *
 * Append-only ledger over the migration-0009 `lifecycle_events`,
 * `company_retention_policies` and `backup_drills` tables. The current subject
 * is always *replayed* from the ledger (no drift-prone status column), and a
 * decided backup drill is immutable audit evidence.
 */

export interface GuardedDrillResult {
  drill: BackupDrillRecord | null
  outcome: 'started' | 'completed' | 'rejected'
  reason: 'invalid_drill' | 'invalid_state' | 'metrics_required' | null
}

export interface RetentionPolicyRowView {
  companyId: string
  policy: RetentionPolicy
  updatedBy: string | null
  updatedAt: number
}

export interface DataLifecycleRepository {
  getRetentionPolicy(companyId: string): Promise<RetentionPolicy | null>
  listRetentionPolicies(): Promise<readonly RetentionPolicyRowView[]>
  upsertRetentionPolicy(
    companyId: string,
    policy: Partial<RetentionPolicy> | undefined,
    updatedBy: string | undefined,
  ): Promise<RetentionPolicy>
  listLifecycleEvents(
    companyId: string,
    workspaceId?: string | undefined,
  ): Promise<readonly LifecycleEvent[]>
  recordLifecycleEvent(input: LifecycleEventInput): Promise<LifecycleEvent | null>
  listBackupDrills(scope?: BackupScope | undefined): Promise<readonly BackupDrillRecord[]>
  getBackupDrill(id: string): Promise<BackupDrillRecord | null>
  startDrill(input: StartBackupDrillInput): Promise<GuardedDrillResult>
  completeDrill(input: CompleteBackupDrillInput): Promise<GuardedDrillResult | null>
}

interface RetentionRow {
  company_id: string
  purge_after_days: number
  updated_by: string | null
  updated_at: number
}

interface LifecycleRow {
  id: string
  company_id: string
  workspace_id: string | null
  action: string
  performed_by: string | null
  reason: string | null
  at_ms: number
}

interface DrillRow {
  id: string
  scope: string
  target_id: string | null
  backup_reference: string
  started_at_ms: number
  completed_at_ms: number | null
  result: string | null
  verified_by: string | null
  rpo_minutes: number | null
  rto_minutes: number | null
  notes: string | null
}

const LIFECYCLE_COLUMNS = 'id, company_id, workspace_id, action, performed_by, reason, at_ms'
const DRILL_COLUMNS =
  'id, scope, target_id, backup_reference, started_at_ms, completed_at_ms, result, verified_by, rpo_minutes, rto_minutes, notes'

export class ControlPlaneDataLifecycleRepository implements DataLifecycleRepository {
  constructor(
    private readonly db: D1DatabaseLike,
    private readonly now: () => number = Date.now,
  ) {}

  async getRetentionPolicy(companyId: string): Promise<RetentionPolicy | null> {
    const row = await this.db
      .prepare(
        'SELECT company_id, purge_after_days, updated_by, updated_at FROM company_retention_policies WHERE company_id = ? LIMIT 1',
      )
      .bind(companyId)
      .first<RetentionRow>()
    return row === null ? null : { purgeAfterDays: row.purge_after_days }
  }

  async listRetentionPolicies(): Promise<readonly RetentionPolicyRowView[]> {
    const rows = await this.db
      .prepare(
        'SELECT company_id, purge_after_days, updated_by, updated_at FROM company_retention_policies ORDER BY company_id',
      )
      .all<RetentionRow>()
    return rows.results.map((row) => ({
      companyId: row.company_id,
      policy: { purgeAfterDays: row.purge_after_days },
      updatedBy: row.updated_by,
      updatedAt: row.updated_at,
    }))
  }

  async upsertRetentionPolicy(
    companyId: string,
    policy: Partial<RetentionPolicy> | undefined,
    updatedBy: string | undefined,
  ): Promise<RetentionPolicy> {
    const normalized = normalizeRetentionPolicy(policy)
    const updatedAt = this.now()
    await this.db
      .prepare(
        `INSERT INTO company_retention_policies (company_id, purge_after_days, updated_by, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(company_id) DO UPDATE SET
           purge_after_days = excluded.purge_after_days,
           updated_by = excluded.updated_by,
           updated_at = excluded.updated_at`,
      )
      .bind(companyId, normalized.purgeAfterDays, updatedBy ?? null, updatedAt)
      .run?.()
    return normalized
  }

  async listLifecycleEvents(
    companyId: string,
    workspaceId?: string | undefined,
  ): Promise<readonly LifecycleEvent[]> {
    const query =
      workspaceId === undefined
        ? `SELECT ${LIFECYCLE_COLUMNS} FROM lifecycle_events
           WHERE company_id = ?
           ORDER BY at_ms, id`
        : `SELECT ${LIFECYCLE_COLUMNS} FROM lifecycle_events
           WHERE company_id = ? AND workspace_id = ?
           ORDER BY at_ms, id`
    const binds = workspaceId === undefined ? [companyId] : [companyId, workspaceId]
    const rows = await this.db.prepare(query).bind(...binds).all<LifecycleRow>()
    return rows.results.map(toLifecycleEvent)
  }

  async recordLifecycleEvent(input: LifecycleEventInput): Promise<LifecycleEvent | null> {
    if (isRecordableLifecycleEvent(input) !== 'ok') return null
    const event: LifecycleEvent = {
      id: input.id,
      action: input.action,
      companyId: input.companyId,
      workspaceId: input.workspaceId ?? null,
      performedBy: input.performedBy ?? null,
      reason: input.reason ?? null,
      atMs: input.atMs,
    }
    await this.db
      .prepare(
        `INSERT INTO lifecycle_events (id, company_id, workspace_id, action, performed_by, reason, at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(event.id, event.companyId, event.workspaceId, event.action, event.performedBy, event.reason, event.atMs)
      .run?.()
    return event
  }

  async listBackupDrills(scope?: BackupScope | undefined): Promise<readonly BackupDrillRecord[]> {
    const query =
      scope === undefined
        ? `SELECT ${DRILL_COLUMNS} FROM backup_drills ORDER BY started_at_ms DESC, id`
        : `SELECT ${DRILL_COLUMNS} FROM backup_drills WHERE scope = ? ORDER BY started_at_ms DESC, id`
    const binds = scope === undefined ? [] : [scope]
    const rows = await this.db.prepare(query).bind(...binds).all<DrillRow>()
    return rows.results.map(toDrill)
  }

  async getBackupDrill(id: string): Promise<BackupDrillRecord | null> {
    const row = await this.db
      .prepare(`SELECT ${DRILL_COLUMNS} FROM backup_drills WHERE id = ? LIMIT 1`)
      .bind(id)
      .first<DrillRow>()
    return row === null ? null : toDrill(row)
  }

  async startDrill(input: StartBackupDrillInput): Promise<GuardedDrillResult> {
    const record = startBackupDrill(input, this.now())
    if ('error' in record) {
      return { drill: null, outcome: 'rejected', reason: 'invalid_drill' }
    }
    await this.db
      .prepare(
        `INSERT INTO backup_drills
           (id, scope, target_id, backup_reference, started_at_ms, completed_at_ms, result, verified_by, rpo_minutes, rto_minutes, notes)
         VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, NULL, NULL, ?)`,
      )
      .bind(
        record.id,
        record.scope,
        record.targetId,
        record.backupReference,
        record.startedAtMs,
        record.verifiedBy,
        record.notes,
      )
      .run?.()
    return { drill: record, outcome: 'started', reason: null }
  }

  async completeDrill(input: CompleteBackupDrillInput): Promise<GuardedDrillResult | null> {
    const existing = await this.getBackupDrill(input.id)
    if (existing === null) return null
    const guard = validateDrillCompletion(existing, input)
    if (guard !== 'ok') {
      return { drill: existing, outcome: 'rejected', reason: guard }
    }
    await this.db
      .prepare(
        'UPDATE backup_drills SET completed_at_ms = ?, result = ?, verified_by = ?, rpo_minutes = ?, rto_minutes = ?, notes = ? WHERE id = ?',
      )
      .bind(
        input.completedAtMs,
        input.result,
        input.verifiedBy ?? existing.verifiedBy,
        input.rpoMinutes ?? existing.rpoMinutes,
        input.rtoMinutes ?? existing.rtoMinutes,
        input.notes ?? existing.notes,
        input.id,
      )
      .run?.()
    const completed = await this.getBackupDrill(input.id)
    return { drill: completed, outcome: 'completed', reason: null }
  }
}

function toLifecycleEvent(row: LifecycleRow): LifecycleEvent {
  return {
    id: row.id,
    companyId: row.company_id,
    workspaceId: row.workspace_id,
    action: row.action as LifecycleEvent['action'],
    performedBy: row.performed_by,
    reason: row.reason,
    atMs: row.at_ms,
  }
}

function toDrill(row: DrillRow): BackupDrillRecord {
  return {
    id: row.id,
    scope: row.scope as BackupScope,
    targetId: row.target_id,
    backupReference: row.backup_reference,
    startedAtMs: row.started_at_ms,
    completedAtMs: row.completed_at_ms,
    result: row.result as BackupDrillRecord['result'],
    verifiedBy: row.verified_by,
    rpoMinutes: row.rpo_minutes,
    rtoMinutes: row.rto_minutes,
    notes: row.notes,
  }
}
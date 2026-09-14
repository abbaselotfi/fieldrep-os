import type {
  PlatformAuditEvent,
  PlatformAuditEventFilter,
  RecordPlatformAuditEventInput,
  UpsertDataRouteInput,
  WorkspaceDataRoute,
} from '@fieldrep/domain'

import type { D1DatabaseLike } from './contracts'

/**
 * Platform operations repository (P10-A2).
 *
 * Control-plane access over the migration-0001 `platform_audit_events` and
 * `workspace_data_routes` tables. Platform scope is authoritative: audit reads
 * span workspaces, but every supplied filter only ever narrows the result.
 */

export interface PlatformOperationsRepository {
  listAuditEvents(filters: PlatformAuditEventFilter): Promise<readonly PlatformAuditEvent[]>
  recordAuditEvent(input: RecordPlatformAuditEventInput): Promise<boolean>
  listDataRoutes(): Promise<readonly WorkspaceDataRoute[]>
  getDataRoute(workspaceId: string): Promise<WorkspaceDataRoute | null>
  upsertDataRoute(input: UpsertDataRouteInput): Promise<WorkspaceDataRoute>
}

interface PlatformAuditEventRow {
  id: string
  actor_user_id: string | null
  action_key: string
  target_type: string
  target_id: string | null
  company_id: string | null
  workspace_id: string | null
  metadata_json: string | null
  occurred_at: number
}

interface DataRouteRow {
  workspace_id: string
  store_type: string
  store_identifier: string
  status: string
  schema_version: number
  metadata_json: string | null
  created_at: number
  updated_at: number
}

const AUDIT_COLUMNS =
  'id, actor_user_id, action_key, target_type, target_id, company_id, workspace_id, metadata_json, occurred_at'
const ROUTE_COLUMNS =
  'workspace_id, store_type, store_identifier, status, schema_version, metadata_json, created_at, updated_at'

export class ControlPlanePlatformOperationsRepository implements PlatformOperationsRepository {
  constructor(
    private readonly db: D1DatabaseLike,
    private readonly now: () => number = Date.now,
    private readonly maxLimit = 200,
  ) {}

  async listAuditEvents(filters: PlatformAuditEventFilter): Promise<readonly PlatformAuditEvent[]> {
    const conditions: string[] = []
    const values: unknown[] = []

    if (filters.companyId !== undefined) {
      conditions.push('company_id = ?')
      values.push(filters.companyId)
    }
    if (filters.workspaceId !== undefined) {
      conditions.push('workspace_id = ?')
      values.push(filters.workspaceId)
    }
    if (filters.actorUserId !== undefined) {
      conditions.push('actor_user_id = ?')
      values.push(filters.actorUserId)
    }
    if (filters.actionKey !== undefined) {
      conditions.push('action_key = ?')
      values.push(filters.actionKey)
    }
    if (filters.targetType !== undefined) {
      conditions.push('target_type = ?')
      values.push(filters.targetType)
    }
    if (filters.fromMs !== undefined) {
      conditions.push('occurred_at >= ?')
      values.push(filters.fromMs)
    }
    if (filters.toMs !== undefined) {
      conditions.push('occurred_at <= ?')
      values.push(filters.toMs)
    }

    const where = conditions.length === 0 ? '' : `WHERE ${conditions.join(' AND ')}`
    const limit = Math.min(Math.max(1, filters.limit), this.maxLimit)
    const rows = await this.db
      .prepare(
        `SELECT ${AUDIT_COLUMNS}
         FROM platform_audit_events
         ${where}
         ORDER BY occurred_at DESC, id
         LIMIT ${limit}`,
      )
      .bind(...values)
      .all<PlatformAuditEventRow>()
    return rows.results.map(toAuditEvent)
  }

  async recordAuditEvent(input: RecordPlatformAuditEventInput): Promise<boolean> {
    const stmt = this.db.prepare(
      `INSERT INTO platform_audit_events
         (id, actor_user_id, action_key, target_type, target_id, company_id, workspace_id, metadata_json, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    const result = await stmt
      .bind(
        input.id,
        input.actorUserId ?? null,
        input.actionKey,
        input.targetType,
        input.targetId ?? null,
        input.companyId ?? null,
        input.workspaceId ?? null,
        input.metadata === undefined ? null : JSON.stringify(input.metadata),
        this.now(),
      )
      .run?.()
    return result?.success === true
  }

  async listDataRoutes(): Promise<readonly WorkspaceDataRoute[]> {
    const rows = await this.db
      .prepare(`SELECT ${ROUTE_COLUMNS} FROM workspace_data_routes ORDER BY workspace_id`)
      .bind()
      .all<DataRouteRow>()
    return rows.results.map(toDataRoute)
  }

  async getDataRoute(workspaceId: string): Promise<WorkspaceDataRoute | null> {
    const row = await this.db
      .prepare(`SELECT ${ROUTE_COLUMNS} FROM workspace_data_routes WHERE workspace_id = ? LIMIT 1`)
      .bind(workspaceId)
      .first<DataRouteRow>()
    return row ? toDataRoute(row) : null
  }

  async upsertDataRoute(input: UpsertDataRouteInput): Promise<WorkspaceDataRoute> {
    const now = this.now()
    const existing = await this.getDataRoute(input.workspaceId)
    const createdAt = existing?.createdAt ?? now
    const stmt = this.db.prepare(
      `INSERT INTO workspace_data_routes
         (workspace_id, store_type, store_identifier, status, schema_version, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(workspace_id) DO UPDATE SET
         store_type = excluded.store_type,
         store_identifier = excluded.store_identifier,
         status = excluded.status,
         schema_version = excluded.schema_version,
         metadata_json = excluded.metadata_json,
         updated_at = excluded.updated_at`,
    )
    await stmt
      .bind(
        input.workspaceId,
        input.storeType,
        input.storeIdentifier,
        input.status,
        input.schemaVersion,
        input.metadata === undefined ? null : JSON.stringify(input.metadata),
        createdAt,
        now,
      )
      .run?.()
    return {
      workspaceId: input.workspaceId,
      storeType: input.storeType,
      storeIdentifier: input.storeIdentifier,
      status: input.status,
      schemaVersion: input.schemaVersion,
      metadata: input.metadata ?? null,
      createdAt,
      updatedAt: now,
    }
  }
}

function parseMetadata(json: string | null): Record<string, unknown> | null {
  return json === null ? null : (JSON.parse(json) as Record<string, unknown>)
}

function toAuditEvent(row: PlatformAuditEventRow): PlatformAuditEvent {
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    actionKey: row.action_key,
    targetType: row.target_type,
    targetId: row.target_id,
    companyId: row.company_id,
    workspaceId: row.workspace_id,
    metadata: parseMetadata(row.metadata_json),
    occurredAt: row.occurred_at,
  }
}

function toDataRoute(row: DataRouteRow): WorkspaceDataRoute {
  return {
    workspaceId: row.workspace_id,
    storeType: row.store_type as WorkspaceDataRoute['storeType'],
    storeIdentifier: row.store_identifier,
    status: row.status as WorkspaceDataRoute['status'],
    schemaVersion: row.schema_version,
    metadata: parseMetadata(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
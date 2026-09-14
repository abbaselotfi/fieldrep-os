import type { AuditEvent, AuditEventFilter } from '@fieldrep/domain'

import type { WorkspaceDataStore } from './contracts'

/**
 * Audit repository (P9-A5) — tenant-scoped reads over `workspace_audit_events`
 * (migration-0001). Fail-closed: the workspace id is ALWAYS the first filter,
 * so a cross-workspace query returns nothing rather than leaking rows.
 */

export interface AuditRepository {
  listAuditEvents(filters: AuditEventFilter): Promise<readonly AuditEvent[]>
}

interface AuditEventRow {
  id: string
  actor_user_id: string | null
  action_key: string
  entity_type: string
  entity_id: string | null
  metadata_json: string | null
  occurred_at: number
}

export class WorkspaceAuditRepository implements AuditRepository {
  constructor(
    private readonly store: WorkspaceDataStore,
    private readonly maxLimit = 200,
  ) {}

  async listAuditEvents(filters: AuditEventFilter): Promise<readonly AuditEvent[]> {
    const conditions: string[] = ['workspace_id = ?']
    const values: unknown[] = [this.store.workspaceId]

    if (filters.actorUserId !== undefined) {
      conditions.push('actor_user_id = ?')
      values.push(filters.actorUserId)
    }
    if (filters.entityType !== undefined) {
      conditions.push('entity_type = ?')
      values.push(filters.entityType)
    }
    if (filters.entityId !== undefined) {
      conditions.push('entity_id = ?')
      values.push(filters.entityId)
    }
    if (filters.actionKey !== undefined) {
      conditions.push('action_key = ?')
      values.push(filters.actionKey)
    }
    if (filters.fromMs !== undefined) {
      conditions.push('occurred_at >= ?')
      values.push(filters.fromMs)
    }
    if (filters.toMs !== undefined) {
      conditions.push('occurred_at <= ?')
      values.push(filters.toMs)
    }

    const limit = Math.min(Math.max(1, filters.limit), this.maxLimit)
    const rows = await this.store.queryAll<AuditEventRow>(
      `SELECT id, actor_user_id, action_key, entity_type, entity_id, metadata_json, occurred_at
       FROM workspace_audit_events
       WHERE ${conditions.join(' AND ')}
       ORDER BY occurred_at DESC
       LIMIT ${limit}`,
      values,
    )
    return rows.map(toAuditEvent)
  }
}

function toAuditEvent(row: AuditEventRow): AuditEvent {
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    actionKey: row.action_key,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: row.metadata_json === null ? null : (JSON.parse(row.metadata_json) as Record<string, unknown>),
    occurredAt: row.occurred_at,
  }
}
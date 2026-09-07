import type { WorkspaceId, UserId } from '@fieldrep/domain'

import type { WorkspaceWritableDataStore } from './contracts'

export type SyncOperationEntityType = 'plan_entry' | 'visit' | 'leave_request' | 'business_trip'
export type SyncOperationRecordType = 'create' | 'update' | 'delete' | 'transition'

/**
 * A previously applied offline operation, replayed to the client for
 * idempotency (OFFLINE-SYNC-SPEC §7).
 */
export interface RecordedSyncOperation {
  operationId: string
  workspaceId: string
  userId: string
  entityType: string
  entityId: string
  operationType: SyncOperationRecordType
  result: unknown
  appliedAt: number
}

export interface RecordSyncOperationInput {
  operationId: string
  workspaceId: WorkspaceId
  userId: UserId
  entityType: SyncOperationEntityType
  entityId: string
  operationType: SyncOperationRecordType
  result: unknown
  clientOccurredAt?: number
  appliedAt: number
}

export interface SyncIdempotencyRepository {
  getRecorded(operationId: string): Promise<RecordedSyncOperation | null>
  recordApplied(input: RecordSyncOperationInput): Promise<void>
  listForUser(userId: string, limit?: number): Promise<RecordedSyncOperation[]>
}

interface SyncOperationRow {
  operation_id: string
  workspace_id: string
  user_id: string
  entity_type: string
  entity_id: string
  operation_type: SyncOperationRecordType
  result_json: string
  applied_at: number
}

export class WorkspaceSyncRepository implements SyncIdempotencyRepository {
  constructor(private readonly store: WorkspaceWritableDataStore) {}

  async getRecorded(operationId: string): Promise<RecordedSyncOperation | null> {
    const row = await this.store.queryFirst<SyncOperationRow>(
      `SELECT operation_id, workspace_id, user_id, entity_type, entity_id, operation_type, result_json, applied_at
       FROM sync_operations
       WHERE workspace_id = ? AND operation_id = ?
       LIMIT 1`,
      [this.store.workspaceId, operationId],
    )

    return row === null ? null : mapRecordedOperation(row)
  }

  async recordApplied(input: RecordSyncOperationInput): Promise<void> {
    await this.store.execute(
      `INSERT INTO sync_operations (
         operation_id, workspace_id, user_id, entity_type, entity_id,
         operation_type, result_json, status, client_occurred_at, applied_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'applied', ?, ?)
       ON CONFLICT(operation_id) DO NOTHING`,
      [
        input.operationId,
        this.store.workspaceId,
        input.userId,
        input.entityType,
        input.entityId,
        input.operationType,
        JSON.stringify(input.result),
        input.clientOccurredAt ?? null,
        input.appliedAt,
      ],
    )
  }

  async listForUser(userId: string, limit = 50): Promise<RecordedSyncOperation[]> {
    const rows = await this.store.queryAll<SyncOperationRow>(
      `SELECT operation_id, workspace_id, user_id, entity_type, entity_id, operation_type, result_json, applied_at
       FROM sync_operations
       WHERE workspace_id = ? AND user_id = ?
       ORDER BY applied_at DESC
       LIMIT ?`,
      [this.store.workspaceId, userId, limit],
    )

    return rows.map(mapRecordedOperation)
  }
}

function mapRecordedOperation(row: SyncOperationRow): RecordedSyncOperation {
  let result: unknown
  try {
    result = JSON.parse(row.result_json)
  } catch {
    result = null
  }

  return {
    operationId: row.operation_id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    operationType: row.operation_type,
    result,
    appliedAt: row.applied_at,
  }
}
/**
 * OfflineSyncService (P4-A1).
 *
 * Implements the sync-operation model from OFFLINE-SYNC-SPEC §6–§15 and the
 * service interface from §24. Business transport logic is injected through
 * `SyncTransport` so the queue is testable without a server and never depends
 * on Service Worker lifecycle (SPEC §18/§8).
 */

import { createOperationId } from './ids'
import type { LocalDatabase } from './local-db'
import type {
  SyncConflict,
  SyncConflictResolution,
  SyncOperation,
  SyncOperationStatus,
  SyncOperationType,
  SyncPullChange,
  SyncPullResponse,
  SyncPullSummary,
  SyncPushSummary,
  SyncState,
  SyncStatus,
} from './types'

export interface SyncTransport {
  send(operation: SyncOperation): Promise<SyncSendOutcome>
}

export type SyncSendOutcome =
  | { outcome: 'applied'; serverState?: unknown }
  | { outcome: 'conflict'; code: string; serverState?: unknown }
  | { outcome: 'rejected'; code: string }

export interface SyncEnqueueInput {
  entityType: string
  entityId: string
  operationType: SyncOperationType
  baseVersion?: string
  payload: unknown
}

export interface SyncServiceOptions {
  clientInstanceId?: string
  /** Injectable clock for deterministic tests. */
  now?: () => number
  /** Injectable connectivity probe; defaults to navigator.onLine. */
  online?: () => boolean
}

export interface SyncPullProvider {
  fetchChanges(dataset: string, afterCursor?: string): Promise<SyncPullResponse>
}

/** Server entity-type -> local cache dataset mapping for applied server state. */
const ENTITY_TYPE_DATASET: Readonly<Record<string, string>> = {
  plan_entry: 'plans',
  visit: 'visits',
  customer: 'customers',
  product: 'products',
  calendar_activity: 'calendar-activities',
}

function datasetForEntityType(entityType: string): string | undefined {
  return ENTITY_TYPE_DATASET[entityType]
}

function retryBackoffMs(retryCount: number): number {
  // 2s, 4s, ... capped at 64s (exponential, deterministic).
  return 1000 * 2 ** Math.min(retryCount, 6)
}
export class OfflineSyncService {
  private readonly clientInstanceId: string
  private readonly now: () => number
  private readonly online: () => boolean
  readonly db: LocalDatabase

  constructor(db: LocalDatabase, options: SyncServiceOptions = {}) {
    this.db = db
    this.clientInstanceId = options.clientInstanceId ?? 'ci_static'
    this.now = options.now ?? (() => Date.now())
    this.online = options.online ?? (() => (typeof navigator !== 'undefined' ? (navigator.onLine ?? true) : true))
  }

  /**
   * Persist a local mutation and enqueue it. A newer `update` supersedes older
   * pending `update`s of the same entity so the queue stays lean and the last
   * local intent wins (SPEC §10 safe-merge philosophy; superseded ops are kept
   * for audit but excluded from push and status counts).
   */
  async enqueue(input: SyncEnqueueInput): Promise<SyncOperation> {
    const nowMs = this.now()
    const operation: SyncOperation = {
      operationId: createOperationId(nowMs),
      clientInstanceId: this.clientInstanceId,
      userId: this.db.partition.userId,
      workspaceId: this.db.partition.workspaceId,
      entityType: input.entityType,
      entityId: input.entityId,
      operationType: input.operationType,
      baseVersion: input.baseVersion,
      clientOccurredAt: new Date(nowMs).toISOString(),
      payload: input.payload,
      status: 'pending',
      retryCount: 0,
    }

    if (input.operationType === 'update') {
      const pending = await this.db.queue.list('pending')
      for (const existing of pending) {
        const isSupersedeTarget =
          existing.entityType === input.entityType &&
          existing.entityId === input.entityId &&
          existing.operationType === 'update'
        if (isSupersedeTarget) {
          await this.db.queue.setStatus(existing.operationId, { status: 'superseded' })
        }
      }
    }

    await this.db.queue.put(operation)
    return operation
  }

  /** Send every due pending operation through the injected transport. */
  async pushPending(transport: SyncTransport): Promise<SyncPushSummary> {
    const nowMs = this.now()
    const nowIso = new Date(nowMs).toISOString()
    const pending = await this.db.queue.list('pending')
    const due = pending.filter(
      (operation) => operation.nextRetryAt === undefined || operation.nextRetryAt <= nowIso,
    )

    const summary: SyncPushSummary = {
      attempted: 0,
      applied: 0,
      conflicts: 0,
      failed: 0,
      skippedNotDue: pending.length - due.length,
      stillPending: 0,
    }

    for (const operation of due) {
      await this.db.queue.setStatus(operation.operationId, { status: 'sending' })
      let outcome: SyncSendOutcome
      try {
        outcome = await transport.send({ ...operation, status: 'sending' })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await this.db.queue.setStatus(operation.operationId, {
          status: 'pending',
          retryCount: operation.retryCount + 1,
          lastError: message,
          nextRetryAt: new Date(nowMs + retryBackoffMs(operation.retryCount + 1)).toISOString(),
        })
        summary.stillPending += 1
        continue
      }

      summary.attempted += 1
      if (outcome.outcome === 'applied') {
        summary.applied += 1
        if (outcome.serverState !== undefined) {
          await this.applyServerState(operation, outcome.serverState)
        }
        await this.db.queue.remove(operation.operationId)
      } else if (outcome.outcome === 'conflict') {
        summary.conflicts += 1
        await this.db.queue.setStatus(operation.operationId, {
          status: 'conflict',
          conflictCode: outcome.code,
          serverState: outcome.serverState,
        })
      } else {
        summary.failed += 1
        await this.db.queue.setStatus(operation.operationId, {
          status: 'failed',
          lastError: outcome.code,
        })
      }
    }

    summary.stillPending += (await this.db.queue.list('pending')).length
    await this.db.meta.set('lastSyncAt', nowIso)
    return summary
  }
/** Send a single operation (used by conflict `retry_with_update` flows). */
  async push(operationId: string, transport: SyncTransport): Promise<SyncSendOutcome> {
    const all = await this.db.queue.list()
    const operation = all.find((candidate) => candidate.operationId === operationId)
    if (operation === undefined) {
      throw new Error(`Unknown sync operation ${operationId}`)
    }
    await this.db.queue.setStatus(operationId, { status: 'sending' })
    try {
      const outcome = await transport.send({ ...operation, status: 'sending' })
      if (outcome.outcome === 'applied') {
        if (outcome.serverState !== undefined) {
          await this.applyServerState(operation, outcome.serverState)
        }
        await this.db.queue.remove(operationId)
      } else if (outcome.outcome === 'conflict') {
        await this.db.queue.setStatus(operationId, {
          status: 'conflict',
          conflictCode: outcome.code,
          serverState: outcome.serverState,
        })
      } else {
        await this.db.queue.setStatus(operationId, { status: 'failed', lastError: outcome.code })
      }
      return outcome
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.db.queue.setStatus(operationId, {
        status: 'pending',
        retryCount: operation.retryCount + 1,
        lastError: message,
      })
      throw error
    }
  }

  async listConflicts(): Promise<SyncConflict[]> {
    const conflicts = await this.db.queue.list('conflict')
    return conflicts.map((operation) => ({
      operationId: operation.operationId,
      entityType: operation.entityType,
      entityId: operation.entityId,
      code: operation.conflictCode ?? 'conflict',
      localPayload: operation.payload,
      serverState: operation.serverState,
      resolutionOptions: conflictResolutions(operation.operationType),
    }))
  }

  async resolveConflict(operationId: string, resolution: SyncConflictResolution): Promise<void> {
    const all = await this.db.queue.list()
    const operation = all.find((candidate) => candidate.operationId === operationId)
    if (operation === undefined) {
      throw new Error(`Unknown sync operation ${operationId}`)
    }

    if (resolution === 'keep_server') {
      if (operation.serverState !== undefined) {
        await this.applyServerState(operation, operation.serverState)
      }
      await this.db.queue.remove(operationId)
      return
    }
    if (resolution === 'discard_local') {
      await this.db.queue.remove(operationId)
      return
    }
    // retry_with_update: adopt the server version and resend the local intent.
    const serverVersion = versionOf(operation.serverState) ?? operation.baseVersion ?? 'server'
    await this.db.queue.setStatus(operationId, {
      status: 'pending',
      baseVersion: serverVersion,
      retryCount: 0,
      conflictCode: undefined,
      serverState: undefined,
      lastError: undefined,
      nextRetryAt: undefined,
    })
  }

  async getStatus(online?: boolean): Promise<SyncStatus> {
    const pending = await this.db.queue.list('pending')
    const conflicts = await this.db.queue.list('conflict')
    const failed = await this.db.queue.list('failed')
    const superseded = await this.db.queue.list('superseded')
    const sending = await this.db.queue.list('sending')
    const lastSyncAt = (await this.db.meta.get('lastSyncAt')) as string | undefined

    const pendingCount = pending.length + sending.length
    const conflictCount = conflicts.length
    const failedCount = failed.length
    const isOnline = online ?? this.online()

    let state: SyncState = 'synced'
    if (conflictCount > 0) state = 'conflict'
    else if (failedCount > 0) state = 'failed'
    else if (pendingCount > 0) state = isOnline ? 'pending' : 'offline'

    return {
      state,
      online: isOnline,
      pendingCount,
      conflictCount,
      failedCount,
      supersededCount: superseded.length,
      lastSyncAt,
    }
  }
/**
   * Pull server changes into the local cache using an explicit per-dataset
   * cursor (SPEC §14). Merge semantics: server records overwrite matching
   * cached records; records not touched by the server are preserved.
   */
  async pullChanges(provider: SyncPullProvider, datasets: readonly string[]): Promise<SyncPullSummary> {
    const nowMs = this.now()
    const summary: SyncPullSummary = {
      datasetsPulled: 0,
      recordsApplied: 0,
      cursors: new Map<string, string | undefined>(),
    }

    for (const dataset of datasets) {
      const afterCursor = (await this.db.meta.get(`pullCursor:${dataset}`)) as string | undefined
      const response = await provider.fetchChanges(dataset, afterCursor)
      for (const change of response.changes) {
        await this.writeCacheRecord(dataset, change, nowMs)
      }
      summary.datasetsPulled += 1
      summary.recordsApplied += response.changes.length
      if (response.nextCursor !== undefined) {
        await this.db.meta.set(`pullCursor:${dataset}`, response.nextCursor)
      }
      summary.cursors.set(dataset, response.nextCursor)
      if (response.serverTime !== undefined) {
        summary.serverTime = response.serverTime
      }
    }

    if (summary.serverTime !== undefined) {
      await this.db.meta.set('lastSyncAt', summary.serverTime)
    }
    return summary
  }

  /** Full dataset replacement (e.g. after a fresh snapshot or authz recheck). */
  async replaceDataset(
    dataset: string,
    records: readonly { entityId: string; record: unknown; serverVersion?: string }[],
  ): Promise<void> {
    const nowMs = this.now()
    const cached = records.map((record) => ({
      dataset,
      entityId: record.entityId,
      record: record.record,
      serverVersion: record.serverVersion,
      updatedAt: new Date(nowMs).toISOString(),
    }))
    await this.db.cache.replaceDataset(dataset, cached)
  }

  private async applyServerState(operation: SyncOperation, serverState: unknown): Promise<void> {
    if (operation.operationType === 'delete') {
      const dataset = datasetForEntityType(operation.entityType)
      if (dataset !== undefined) {
        await this.db.cache.remove(dataset, operation.entityId)
      }
      return
    }
    // Persist the authoritative server result into the matching cache dataset.
    const dataset = datasetForEntityType(operation.entityType)
    if (dataset !== undefined) {
      await this.writeCacheRecord(
        dataset,
        {
          entityId: operation.entityId,
          record: serverState,
          serverVersion: versionOf(serverState),
          updatedAt: new Date(this.now()).toISOString(),
        },
        this.now(),
      )
    }
    // Audit trail: last applied server state per operation for debugging.
    await this.db.meta.set(`applied:${operation.operationId}`, {
      entityType: operation.entityType,
      entityId: operation.entityId,
      appliedAt: new Date(this.now()).toISOString(),
      serverState,
    })
  }

  private async writeCacheRecord(dataset: string, change: SyncPullChange, nowMs: number): Promise<void> {
    await this.db.cache.put({
      dataset,
      entityId: change.entityId,
      record: change.record,
      serverVersion: change.serverVersion,
      updatedAt: change.updatedAt ?? new Date(nowMs).toISOString(),
    })
  }
}

function versionOf(serverState: unknown): string | undefined {
  if (serverState === null || typeof serverState !== 'object') return undefined
  const candidate = (serverState as { version?: unknown }).version
  return typeof candidate === 'string' ? candidate : undefined
}

function conflictResolutions(operationType: SyncOperationType): readonly SyncConflictResolution[] {
  switch (operationType) {
    case 'update':
      return ['keep_server', 'retry_with_update', 'discard_local']
    case 'create':
      return ['keep_server', 'discard_local']
    case 'delete':
    case 'transition':
      return ['retry_with_update', 'discard_local']
  }
}
/**
 * Offline PWA foundation (P4-A1).
 *
 * Shared models mirroring `docs/OFFLINE-SYNC-SPEC.md` §6 / §11 / §14 / §20.
 * These types are deliberately framework-free: the React layer, service worker
 * hooks and the future sync endpoints all consume the same contracts.
 */

/** Logical local-data namespace: a single trusted user inside one workspace. */
export interface OfflinePartition {
  userId: string
  workspaceId: string
}

export type SyncOperationStatus =
  | 'pending'
  | 'sending'
  | 'applied'
  | 'conflict'
  | 'failed'
  | 'superseded'

export type SyncOperationType = 'create' | 'update' | 'delete' | 'transition'

/**
 * Stable client-generated operation identity (OFFLINE-SYNC-SPEC §6).
 * The server uses `operationId` for idempotency, never for business logic.
 */
export interface SyncOperation {
  operationId: string
  clientInstanceId: string
  userId: string
  workspaceId: string
  entityType: string
  entityId: string
  operationType: SyncOperationType
  /** Server version the local edit was based on, when available. */
  baseVersion?: string | undefined
  clientOccurredAt: string
  payload: unknown
  status: SyncOperationStatus
  retryCount: number
  lastError?: string | undefined
  nextRetryAt?: string | undefined
  conflictCode?: string | undefined
  serverState?: unknown
}

export type SyncConflictResolution = 'keep_server' | 'retry_with_update' | 'discard_local'

export interface SyncConflict {
  operationId: string
  entityType: string
  entityId: string
  code: string
  localPayload?: unknown
  serverState?: unknown
  resolutionOptions: readonly SyncConflictResolution[]
}

/** User-visible sync state machine (OFFLINE-SYNC-SPEC §20). */
export type SyncState = 'synced' | 'syncing' | 'offline' | 'pending' | 'conflict' | 'failed'

export interface SyncStatus {
  state: SyncState
  online: boolean
  pendingCount: number
  conflictCount: number
  failedCount: number
  supersededCount: number
  lastSyncAt?: string | undefined
  lastError?: string | undefined
}

export interface SyncPushSummary {
  attempted: number
  applied: number
  conflicts: number
  failed: number
  skippedNotDue: number
  stillPending: number
}

/** Server changes for one dataset (OFFLINE-SYNC-SPEC §14). */
export interface SyncPullChange {
  entityId: string
  record: unknown
  serverVersion?: string | undefined
  updatedAt?: string | undefined
}

export interface SyncPullResponse {
  changes: readonly SyncPullChange[]
  nextCursor?: string
  serverTime?: string
}

export interface SyncPullSummary {
  datasetsPulled: number
  recordsApplied: number
  cursors: Map<string, string | undefined>
  serverTime?: string | undefined
}

/** Reference/cache record stored in the partitioned IndexedDB cache store. */
export interface CachedRecord {
  dataset: string
  entityId: string
  record: unknown
  serverVersion?: string | undefined
  updatedAt: string
}
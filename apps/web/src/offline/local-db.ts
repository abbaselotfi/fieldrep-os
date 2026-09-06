/**
 * Partitioned IndexedDB local store (P4-A1).
 *
 * Every database is namespaced by `user_id + workspace_id + local_store_version`
 * (OFFLINE-SYNC-SPEC §4). Stores:
 *   - `cache`   authorized reference/derived data (customers, plans, visit
 *               counters, calendar events) — replaceable per dataset.
 *   - `queue`   the mutable SyncOperation queue; pending/conflict work must
 *               survive app updates, so this store is never cleared implicitly.
 *   - `meta`    small key/value metadata (last pull cursors, last sync time).
 *
 * Upgrade safety (SPEC §21): schema migrations run through an explicit
 * registry. If a step has no registered migration we throw
 * `LocalSchemaMismatchError` instead of wiping or downgrading data.
 */

import type {
  CachedRecord,
  OfflinePartition,
  SyncOperation,
  SyncOperationStatus,
} from './types'

/** Bump when the IndexedDB object-store layout changes. */
export const LOCAL_STORE_VERSION = 1

export const LOCAL_DB_PREFIX = 'fieldrep-os-offline'

type Idb = typeof globalThis.indexedDB
type IdbKeyRangeCtor = typeof IDBKeyRange

export interface LocalDatabaseDeps {
  indexedDB: Idb
  idbKeyRange: IdbKeyRangeCtor
}

export interface LocalStoreMigration {
  from: number
  to: number
  /**
   * Issue object-store/index requests synchronously inside the upgrade
   * transaction. Never await promises here: IndexedDB upgrades are request
   * driven and the transaction must stay alive until all requests settle.
   */
  upgrade(transaction: IDBTransaction): void
}

export class LocalSchemaMismatchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LocalSchemaMismatchError'
  }
}

/** Baseline object stores, created once during the first open (v0 -> v1). */
function createBaselineSchema(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains('cache')) {
    db.createObjectStore('cache', { keyPath: ['dataset', 'entityId'] })
  }
  if (!db.objectStoreNames.contains('queue')) {
    const queue = db.createObjectStore('queue', { keyPath: 'operationId' })
    queue.createIndex('status', 'status')
    queue.createIndex('occurredAt', 'clientOccurredAt')
    queue.createIndex('entity', ['entityType', 'entityId'])
  }
  if (!db.objectStoreNames.contains('meta')) {
    db.createObjectStore('meta', { keyPath: 'key' })
  }
}

const BASELINE_MIGRATION: LocalStoreMigration = {
  from: 0,
  to: 1,
  // Baseline stores are created by `createBaselineSchema`; this marker makes
  // the registry explicit so the loop below rejects unknown jumps.
  upgrade: () => undefined,
}

function applyUpgradeSchema(
  db: IDBDatabase,
  oldVersion: number,
  targetVersion: number,
  migrations: readonly LocalStoreMigration[],
): void {
  createBaselineSchema(db)
  const registered: Record<number, LocalStoreMigration> = {}
  for (const migration of [BASELINE_MIGRATION, ...migrations]) {
    if (migration.from >= migration.to) {
      throw new LocalSchemaMismatchError(
        `Local store migration must move forward (${migration.from} -> ${migration.to})`,
      )
    }
    registered[migration.from] = migration
  }

  let from = oldVersion
  while (from < targetVersion) {
    const migration = registered[from]
    if (migration === undefined) {
      throw new LocalSchemaMismatchError(
        `No local store migration registered from v${from} to v${from + 1}; refusing to open or wipe data`,
      )
    }
    migration.upgrade(
      db.transaction(Array.from(db.objectStoreNames), 'versionchange'),
    )
    from = migration.to
  }
}

export function partitionDbName(
  partition: OfflinePartition,
  version: number = LOCAL_STORE_VERSION,
): string {
  const encode = (value: string) => encodeURIComponent(value)
  return `${LOCAL_DB_PREFIX}_v${version}_u${encode(partition.userId)}_w${encode(partition.workspaceId)}`
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = (event) => {
      const error = transaction.error ?? new Error('IndexedDB transaction failed')
      event.stopPropagation()
      reject(error)
    }
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
  })
}
export interface LocalDatabase {
  readonly partition: OfflinePartition
  readonly dbName: string
  close(): void
  cache: {
    put(record: CachedRecord): Promise<void>
    replaceDataset(dataset: string, records: readonly CachedRecord[]): Promise<void>
    get(dataset: string, entityId: string): Promise<CachedRecord | undefined>
    list(dataset: string): Promise<CachedRecord[]>
    count(dataset: string): Promise<number>
    remove(dataset: string, entityId: string): Promise<void>
  }
  queue: {
    put(operation: SyncOperation): Promise<void>
    list(status?: SyncOperationStatus): Promise<SyncOperation[]>
    setStatus(
      operationId: string,
      patch: Partial<
        Pick<SyncOperation, 'status' | 'retryCount' | 'lastError' | 'nextRetryAt' | 'conflictCode' | 'serverState' | 'baseVersion'>
      >,
    ): Promise<void>
    update(operation: SyncOperation): Promise<void>
    remove(operationId: string): Promise<void>
    count(status?: SyncOperationStatus): Promise<number>
  }
  meta: {
    get(key: string): Promise<unknown>
    set(key: string, value: unknown): Promise<void>
  }
  /** Explicit logout/prune per SPEC §16 — never invoked automatically. */
  clearAll(): Promise<void>
}

export async function openLocalDatabase(
  deps: LocalDatabaseDeps,
  partition: OfflinePartition,
  migrations: readonly LocalStoreMigration[] = [],
): Promise<LocalDatabase> {
  const dbName = partitionDbName(partition)

  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    let upgradeError: unknown = null
    const request = deps.indexedDB.open(dbName, LOCAL_STORE_VERSION)

    request.onupgradeneeded = () => {
      try {
        applyUpgradeSchema(request.result, request.result.version, LOCAL_STORE_VERSION, migrations)
      } catch (error) {
        upgradeError = error
        request.transaction?.abort()
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      if (upgradeError !== null) {
        reject(upgradeError)
        return
      }
      reject(request.error ?? new Error(`Unable to open local database ${dbName}`))
    }
    request.onblocked = () => {
      reject(new Error(`Local database ${dbName} is blocked by another open connection`))
    }
  })

  return createLocalDatabase(deps, db, partition, dbName)
}

function createLocalDatabase(
  deps: LocalDatabaseDeps,
  db: IDBDatabase,
  partition: OfflinePartition,
  dbName: string,
): LocalDatabase {
  const range = deps.idbKeyRange

  function datasetRange(dataset: string): IDBKeyRange {
    // Array keys in IndexedDB compare element-wise; a prefix range over the
    // compound key reliably selects one dataset.
    return range.bound([dataset, '\u0000'], [dataset, '\uffff'])
  }

  const cache = {
    async put(record: CachedRecord): Promise<void> {
      const transaction = db.transaction('cache', 'readwrite')
      await requestToPromise(transaction.objectStore('cache').put(record))
      await transactionDone(transaction)
    },
    async replaceDataset(dataset: string, records: readonly CachedRecord[]): Promise<void> {
      const transaction = db.transaction('cache', 'readwrite')
      const store = transaction.objectStore('cache')
      const existing = await requestToPromise(store.getAll(datasetRange(dataset)))
      for (const record of existing) {
        await requestToPromise(store.delete([dataset, record.entityId]))
      }
      for (const record of records) {
        await requestToPromise(store.put(record))
      }
      await transactionDone(transaction)
    },
    async get(dataset: string, entityId: string): Promise<CachedRecord | undefined> {
      const transaction = db.transaction('cache', 'readonly')
      const result = await requestToPromise(transaction.objectStore('cache').get([dataset, entityId]))
      await transactionDone(transaction)
      return result
    },
    async list(dataset: string): Promise<CachedRecord[]> {
      const transaction = db.transaction('cache', 'readonly')
      const result = await requestToPromise(transaction.objectStore('cache').getAll(datasetRange(dataset)))
      await transactionDone(transaction)
      return result
    },
    async count(dataset: string): Promise<number> {
      const transaction = db.transaction('cache', 'readonly')
      const result = await requestToPromise(transaction.objectStore('cache').count(datasetRange(dataset)))
      await transactionDone(transaction)
      return result
    },
    async remove(dataset: string, entityId: string): Promise<void> {
      const transaction = db.transaction('cache', 'readwrite')
      await requestToPromise(transaction.objectStore('cache').delete([dataset, entityId]))
      await transactionDone(transaction)
    },
  }

  const queue = {
    async put(operation: SyncOperation): Promise<void> {
      const transaction = db.transaction('queue', 'readwrite')
      await requestToPromise(transaction.objectStore('queue').put(operation))
      await transactionDone(transaction)
    },
    async list(status?: SyncOperationStatus): Promise<SyncOperation[]> {
      const transaction = db.transaction('queue', 'readonly')
      const store = transaction.objectStore('queue')
      let result: SyncOperation[]
      if (status === undefined) {
        result = await requestToPromise(store.getAll())
      } else {
        result = await requestToPromise(store.index('status').getAll(status))
      }
      await transactionDone(transaction)
      return result
    },
    async setStatus(
      operationId: string,
      patch: Partial<
        Pick<SyncOperation, 'status' | 'retryCount' | 'lastError' | 'nextRetryAt' | 'conflictCode' | 'serverState' | 'baseVersion'>
      >,
    ): Promise<void> {
      const transaction = db.transaction('queue', 'readwrite')
      const store = transaction.objectStore('queue')
      const current = await requestToPromise(store.get(operationId))
      if (current !== undefined) {
        await requestToPromise(store.put({ ...current, ...patch }))
      }
      await transactionDone(transaction)
    },
    async update(operation: SyncOperation): Promise<void> {
      const transaction = db.transaction('queue', 'readwrite')
      await requestToPromise(transaction.objectStore('queue').put(operation))
      await transactionDone(transaction)
    },
    async remove(operationId: string): Promise<void> {
      const transaction = db.transaction('queue', 'readwrite')
      await requestToPromise(transaction.objectStore('queue').delete(operationId))
      await transactionDone(transaction)
    },
    async count(status?: SyncOperationStatus): Promise<number> {
      const transaction = db.transaction('queue', 'readonly')
      const store = transaction.objectStore('queue')
      let result: number
      if (status === undefined) {
        result = await requestToPromise(store.count())
      } else {
        result = await requestToPromise(store.index('status').count(status))
      }
      await transactionDone(transaction)
      return result
    },
  }

  const meta = {
    async get(key: string): Promise<unknown> {
      const transaction = db.transaction('meta', 'readonly')
      const result = await requestToPromise(transaction.objectStore('meta').get(key))
      await transactionDone(transaction)
      return result?.value
    },
    async set(key: string, value: unknown): Promise<void> {
      const transaction = db.transaction('meta', 'readwrite')
      await requestToPromise(transaction.objectStore('meta').put({ key, value }))
      await transactionDone(transaction)
    },
  }

  return {
    partition,
    dbName,
    close: () => db.close(),
    cache,
    queue,
    meta,
    async clearAll(): Promise<void> {
      const transaction = db.transaction(['cache', 'queue', 'meta'], 'readwrite')
      transaction.objectStore('cache').clear()
      transaction.objectStore('queue').clear()
      transaction.objectStore('meta').clear()
      await transactionDone(transaction)
    },
  }
}
import { IDBKeyRange, indexedDB } from 'fake-indexeddb'

import { openLocalDatabase, type LocalDatabase, type LocalDatabaseDeps } from './local-db'
import type { OfflinePartition } from './types'

const deps: LocalDatabaseDeps = {
  indexedDB: indexedDB as unknown as typeof globalThis.indexedDB,
  idbKeyRange: IDBKeyRange as unknown as typeof IDBKeyRange,
}

let sequence = 0

export function partitionA(): OfflinePartition {
  sequence += 1
  return { userId: 'user-a', workspaceId: `ws-a-${sequence}` }
}

export function partitionB(): OfflinePartition {
  sequence += 1
  return { userId: 'user-b', workspaceId: `ws-b-${sequence}` }
}

export interface TestDatabase {
  db: LocalDatabase
  deps: LocalDatabaseDeps
}

export async function createTestDatabase(partition: OfflinePartition): Promise<TestDatabase> {
  const db = await openLocalDatabase(deps, partition)
  return { db, deps }
}
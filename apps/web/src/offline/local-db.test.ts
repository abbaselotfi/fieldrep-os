import { IDBKeyRange, indexedDB } from 'fake-indexeddb'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import {
  LOCAL_STORE_VERSION,
  openLocalDatabase,
  partitionDbName,
  type LocalDatabase,
  type LocalDatabaseDeps,
} from './local-db'
import type { OfflinePartition } from './types'

const deps: LocalDatabaseDeps = {
  indexedDB: indexedDB as unknown as typeof globalThis.indexedDB,
  idbKeyRange: IDBKeyRange as unknown as typeof IDBKeyRange,
}

let sequence = 0
const opened: LocalDatabase[] = []

function testPartition(tag: string = 'p'): OfflinePartition {
  sequence += 1
  return { userId: `${tag}-user-${sequence}`, workspaceId: `${tag}-ws-${sequence}` }
}

async function openTestDb(partition: OfflinePartition) {
  const db = await openLocalDatabase(deps, partition)
  opened.push(db)
  return db
}

afterAll(() => {
  for (const db of opened) db.close()
})

beforeEach(() => {
  sequence = 0
})

describe('offline local database foundation', () => {
  it('namespaces the database per user+workspace with the local store version', () => {
    const partition = { userId: 'u1', workspaceId: 'w1' }
    const name = partitionDbName(partition)
    expect(name).toContain(`v${LOCAL_STORE_VERSION}`)
    expect(name).toContain('u1')
    expect(name).toContain('w1')
    expect(partitionDbName({ userId: 'u1', workspaceId: 'w2' })).not.toBe(name)
    expect(partitionDbName({ userId: 'u2', workspaceId: 'w1' })).not.toBe(name)
  })

  it('isolates cache data between user/workspace partitions', async () => {
    const userA = await openTestDb(testPartition('a'))
    const userB = await openTestDb(testPartition('b'))

    await userA.cache.put({
      dataset: 'customers',
      entityId: 'doctor-1',
      record: { name: 'دکتر آزمون' },
      updatedAt: '2026-09-07T00:00:00.000Z',
    })
    expect(await userB.cache.list('customers')).toEqual([])

    // replaceDataset replaces the whole named dataset (snapshot semantics).
    await userA.cache.replaceDataset('customers', [
      { dataset: 'customers', entityId: 'doctor-2', record: { name: 'دکتر دوم' }, updatedAt: '2026-09-07T00:00:00.000Z' },
    ])
    expect(await userA.cache.list('customers').then((rows) => rows.map((row) => row.entityId))).toEqual(['doctor-2'])

    await userA.cache.put({
      dataset: 'customers',
      entityId: 'doctor-1',
      record: { name: 'دکتر آزمون' },
      updatedAt: '2026-09-07T00:00:00.000Z',
    })
    expect(await userA.cache.list('customers').then((rows) => rows.map((row) => row.entityId).sort())).toEqual(['doctor-1', 'doctor-2'])
    expect(await userB.cache.list('customers')).toEqual([])
  })

  it('replaceDataset replaces only the named dataset', async () => {
    const db = await openTestDb(testPartition())
    await db.cache.put({ dataset: 'customers', entityId: 'c1', record: { v: 1 }, updatedAt: 'x' })
    await db.cache.put({ dataset: 'plans', entityId: 'p1', record: { v: 1 }, updatedAt: 'x' })

    await db.cache.replaceDataset('customers', [
      { dataset: 'customers', entityId: 'c2', record: { v: 2 }, updatedAt: 'x' },
    ])

    expect(await db.cache.count('customers')).toBe(1)
    expect(await db.cache.get('customers', 'c2')).toMatchObject({ entityId: 'c2' })
    expect(await db.cache.count('plans')).toBe(1)
    await db.cache.remove('customers', 'c2')
    expect(await db.cache.count('customers')).toBe(0)
  })

  it('preserves pending queue operations on reopen (PWA update safety)', async () => {
    const partition = testPartition()
    const first = await openTestDb(partition)
    await first.queue.put({
      operationId: '0000000000001TEST',
      clientInstanceId: 'ci_test',
      userId: partition.userId,
      workspaceId: partition.workspaceId,
      entityType: 'visit',
      entityId: 'v1',
      operationType: 'create',
      clientOccurredAt: '2026-09-07T00:00:00.000Z',
      payload: { customerId: 'c1' },
      status: 'pending',
      retryCount: 0,
    })
    first.close()

    const reopened = await openTestDb(partition)
    const pending = await reopened.queue.list('pending')
    expect(pending).toHaveLength(1)
    expect(pending[0]!.operationId).toBe('0000000000001TEST')

    await reopened.queue.setStatus(pending[0]!.operationId, { status: 'conflict', conflictCode: 'version_conflict' })
    expect(await reopened.queue.count('conflict')).toBe(1)
    expect(await reopened.queue.count('pending')).toBe(0)
  })

  it('keeps cache pending data across a normal reopen without any wipe', async () => {
    const partition = testPartition()
    const first = await openTestDb(partition)
    await first.cache.replaceDataset('customers', [
      { dataset: 'customers', entityId: 'doctor-1', record: { name: 'دکتر حفظ‌شده' }, updatedAt: '2026-09-07T00:00:00.000Z' },
    ])
    first.close()

    const reopened = await openTestDb(partition)
    expect(await reopened.cache.get('customers', 'doctor-1')).toMatchObject({ entityId: 'doctor-1' })
  })

  it('supports explicit clearAll for logout/prune (never automatic)', async () => {
    const partition = testPartition()
    const db = await openTestDb(partition)
    await db.queue.put({
      operationId: '0000000000002TEST',
      clientInstanceId: 'ci_test',
      userId: partition.userId,
      workspaceId: partition.workspaceId,
      entityType: 'plan_entry',
      entityId: 'e1',
      operationType: 'update',
      clientOccurredAt: '2026-09-07T00:00:00.000Z',
      payload: { planDate: '2026-09-20' },
      status: 'pending',
      retryCount: 0,
    })
    await db.cache.put({ dataset: 'plans', entityId: 'e1', record: {}, updatedAt: 'x' })

    await db.clearAll()
    expect(await db.queue.list()).toEqual([])
    expect(await db.cache.count('plans')).toBe(0)
  })
})
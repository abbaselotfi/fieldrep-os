import { afterAll, describe, expect, it, vi } from 'vitest'

import { createTestDatabase, partitionA } from './test-helpers'
import { OfflineSyncService, type SyncSendOutcome, type SyncTransport } from './sync-service'

const opened: Awaited<ReturnType<typeof createTestDatabase>>[] = []

afterAll(() => {
  for (const db of opened) db.db.close()
})

function makeService(
  db: Awaited<ReturnType<typeof createTestDatabase>>,
  overrides: { now?: () => number } = {},
) {
  opened.push(db)
  const clock = vi.fn(overrides.now ?? (() => 1_700_000_000_000))
  const service = new OfflineSyncService(db.db, {
    clientInstanceId: 'ci_test',
    now: clock,
    online: () => true,
  })
  return { service, clock }
}

describe('OfflineSyncService', () => {
  it('creates plan entries offline and pushes them exactly once (idempotent identity)', async () => {
    const db = await createTestDatabase(partitionA())
    const { service } = makeService(db)

    const seen: string[] = []
    const transport: SyncTransport = {
      async send(operation) {
        seen.push(operation.operationId)
        expect(operation.entityType).toBe('plan_entry')
        expect(operation.userId).toBe(db.db.partition.userId)
        expect(/^\d{13}[0-9A-Z]+$/.test(operation.operationId)).toBe(true)
        return { outcome: 'applied', serverState: { id: operation.entityId, version: 'v1' } }
      },
    }

    const created = await service.enqueue({
      entityType: 'plan_entry',
      entityId: 'plan-1',
      operationType: 'create',
      payload: { customerId: 'doctor-1', planDate: '2026-09-20' },
    })

    // First push applies.
    const first = await service.pushPending(transport)
    expect(first.applied).toBe(1)
    expect(first.attempted).toBe(1)

    // Retry after a "lost response" sends a fresh op with a stable operationId;
    // the server can dedupe, and the client never duplicates a business record.
    const lostResponse = await service.enqueue({
      entityType: 'plan_entry',
      entityId: 'plan-1',
      operationType: 'create',
      payload: { customerId: 'doctor-1', planDate: '2026-09-20' },
    })
    expect(lostResponse.operationId).not.toBe(created.operationId)
    const retry = await service.pushPending(transport)
    expect(retry.applied).toBe(1)

    expect(seen).toHaveLength(2)
    expect(seen[0]).toBe(created.operationId)
    expect(seen[1]).toBe(lostResponse.operationId)
    expect(await db.db.queue.list()).toEqual([])
    expect(await db.db.cache.get('plans', 'plan-1')).toMatchObject({ record: { id: 'plan-1', version: 'v1' } })
  })

  it('supersedes older pending update of the same entity (last local intent wins)', async () => {
    const db = await createTestDatabase(partitionA())
    const { service } = makeService(db)

    await service.enqueue({
      entityType: 'plan_entry',
      entityId: 'plan-9',
      operationType: 'update',
      payload: { planDate: '2026-09-21' },
    })
    const newest = await service.enqueue({
      entityType: 'plan_entry',
      entityId: 'plan-9',
      operationType: 'update',
      payload: { planDate: '2026-09-22' },
    })

    const pending = await db.db.queue.list('pending')
    expect(pending).toHaveLength(1)
    expect(pending[0]!.operationId).toBe(newest.operationId)
    expect(await db.db.queue.count('superseded')).toBe(1)
  })
it('detects a conflict when two clients edit the same plan', async () => {
    const db = await createTestDatabase(partitionA())
    const { service } = makeService(db)

    await service.enqueue({
      entityType: 'plan_entry',
      entityId: 'plan-2',
      operationType: 'update',
      baseVersion: 'v1',
      payload: { planDate: '2026-09-21' },
    })

    // Another client already pushed v2 with a different intent.
    const transport: SyncTransport = {
      async send() {
        return {
          outcome: 'conflict',
          code: 'base_version_conflict',
          serverState: { id: 'plan-2', planDate: '2026-09-19', version: 'v2' },
        }
      },
    }
    await service.pushPending(transport)

    const conflicts = await service.listConflicts()
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]!.code).toBe('base_version_conflict')
    expect(conflicts[0]!.resolutionOptions).toContain('keep_server')
    expect((await service.getStatus()).state).toBe('conflict')

    // keep_server adopts the server state into the cache and clears the queue.
    await service.resolveConflict(conflicts[0]!.operationId, 'keep_server')
    expect(await db.db.queue.list()).toEqual([])
    const cached = await db.db.cache.get('plans', 'plan-2')
    expect(cached?.record).toMatchObject({ planDate: '2026-09-19', version: 'v2' })
    expect((await service.getStatus()).state).toBe('synced')
  })

  it('retry_with_update adopts the server version and resends', async () => {
    const db = await createTestDatabase(partitionA())
    const { service } = makeService(db)

    await service.enqueue({
      entityType: 'plan_entry',
      entityId: 'plan-3',
      operationType: 'update',
      baseVersion: 'v1',
      payload: { planDate: '2026-09-21' },
    })

    await service.pushPending({
      async send() {
        return {
          outcome: 'conflict',
          code: 'base_version_conflict',
          serverState: { id: 'plan-3', version: 'v4' },
        }
      },
    })

    const [conflict] = await service.listConflicts()
    await service.resolveConflict(conflict!.operationId, 'retry_with_update')

    const pending = await db.db.queue.list('pending')
    expect(pending).toHaveLength(1)
    expect(pending[0]!.baseVersion).toBe('v4')

    const seenBaseVersion: (string | undefined)[] = []
    await service.pushPending({
      async send(operation) {
        seenBaseVersion.push(operation.baseVersion)
        return { outcome: 'applied', serverState: { id: 'plan-3', version: 'v5' } }
      },
    })
    expect(seenBaseVersion).toEqual(['v4'])
    expect(await db.db.queue.list()).toEqual([])
  })

  it('marks an operation failed when server authorization rejects it', async () => {
    const db = await createTestDatabase(partitionA())
    const { service } = makeService(db)

    await service.enqueue({
      entityType: 'visit',
      entityId: 'visit-1',
      operationType: 'create',
      payload: {},
    })
    await service.pushPending({
      async send() {
        return { outcome: 'rejected', code: 'permission_revoked' }
      },
    })

    const status = await service.getStatus()
    expect(status.state).toBe('failed')
    expect(status.failedCount).toBe(1)
    const failed = await db.db.queue.list('failed')
    expect(failed[0]!.lastError).toBe('permission_revoked')
  })
it('retries transient failures with exponential backoff and skips not-due ops', async () => {
    let nowMs = 1_700_000_000_000
    const db = await createTestDatabase(partitionA())
    const { service } = makeService(db, { now: () => nowMs })

    await service.enqueue({ entityType: 'visit', entityId: 'visit-2', operationType: 'create', payload: {} })

    const failTransport: SyncTransport = {
      async send(): Promise<SyncSendOutcome> {
        throw new Error('network unreachable')
      },
    }
    await service.pushPending(failTransport)

    let pending = await db.db.queue.list('pending')
    expect(pending[0]!.retryCount).toBe(1)
    expect(pending[0]!.nextRetryAt).toBeDefined()
    const nextRetryAt = Date.parse(pending[0]!.nextRetryAt!)

    // pushPending before the backoff window elapses must not attempt a send.
    let sends = 0
    await service.pushPending({
      async send() {
        sends += 1
        return { outcome: 'applied' }
      },
    })
    expect(sends).toBe(0)
    expect((await service.getStatus()).pendingCount).toBe(1)

    // Once due, the op is retried with the same operationId.
    nowMs = nextRetryAt + 1
    await service.pushPending({
      async send(operation) {
        sends += 1
        expect(operation.operationId).toBe(pending[0]!.operationId)
        expect(operation.retryCount).toBe(1)
        return { outcome: 'applied' }
      },
    })
    expect(sends).toBe(1)
    expect(await db.db.queue.list()).toEqual([])
  })

  it('pulls server changes into the cache with cursor progression', async () => {
    const db = await createTestDatabase(partitionA())
    const { service } = makeService(db)

    let requestedCursor: string | undefined
    const provider = {
      async fetchChanges(dataset: string, afterCursor?: string) {
        requestedCursor = afterCursor
        return {
          changes: [
            { entityId: 'doctor-1', record: { name: 'دکتر یک' }, serverVersion: 'v1' },
          ],
          nextCursor: 'cursor-2',
          serverTime: '2026-09-07T09:00:00.000Z',
        }
      },
    }

    const summary = await service.pullChanges(provider, ['customers'])
    expect(summary.datasetsPulled).toBe(1)
    expect(summary.recordsApplied).toBe(1)
    expect(requestedCursor).toBeUndefined()
    expect(await db.db.meta.get('pullCursor:customers')).toBe('cursor-2')

    // Second pull continues from the stored cursor.
    await service.pullChanges(provider, ['customers'])
    expect(requestedCursor).toBe('cursor-2')
    expect(await db.db.cache.get('customers', 'doctor-1')).toMatchObject({ entityId: 'doctor-1' })
  })

  it('keeps captured offline evidence timestamps inside the payload', async () => {
    const db = await createTestDatabase(partitionA())
    const { service } = makeService(db)

    let captured: number | undefined
    await service.enqueue({
      entityType: 'visit',
      entityId: 'visit-evidence',
      operationType: 'create',
      // Location evidence captured offline (SPEC §22) with its original time.
      payload: { capturedAt: 1_699_000_000_000, coordinates: { lat: 36.29, lng: 59.6 }, accuracy: 12 },
    })
    await service.pushPending({
      async send(operation) {
        captured = (operation.payload as { capturedAt: number }).capturedAt
        return { outcome: 'applied' }
      },
    })
    expect(captured).toBe(1_699_000_000_000)
  })
})
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { OfflineSyncService } from './sync-service'
import type { LocalDatabase } from './local-db'
import { createTestDatabase, partitionA } from './test-helpers'
import { createSyncPullProvider, HttpSyncTransport, hydrateCacheFromSnapshot } from './http-sync'

const opened: Array<{ db: LocalDatabase }> = []

afterEach(() => {
  for (const entry of opened) entry.db.close()
})

async function makeService() {
  const db = await createTestDatabase(partitionA())
  opened.push(db)
  return new OfflineSyncService(db.db, { clientInstanceId: 'ci_test', online: () => true })
}

describe('HttpSyncTransport', () => {
  it('POSTs a single operation and maps applied to SyncSendOutcome.applied', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ results: [{ result: 'applied', serverState: { id: 'plan-1', status: 'planned' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ) as unknown as typeof fetch

    const transport = new HttpSyncTransport('workspace-a', '/api/v1', fetchImpl)
    const outcome = await transport.send({
      operationId: '0000000000001TEST',
      clientInstanceId: 'ci_test',
      userId: 'user-1',
      workspaceId: 'workspace-a',
      entityType: 'plan_entry',
      entityId: 'plan-1',
      operationType: 'create',
      clientOccurredAt: '2026-09-07T00:00:00.000Z',
      payload: { customerId: 'doctor-1' },
      status: 'sending',
      retryCount: 0,
    })

    expect(outcome.outcome).toBe('applied')
    expect((outcome as { serverState: unknown }).serverState).toEqual({ id: 'plan-1', status: 'planned' })
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('maps a conflict result and a rejected result', async () => {
    const fetchImpl = vi.fn(
      async (info: RequestInfo | URL) => {
        const url = typeof info === 'string' ? info : info.toString()
        if (url.includes('operations')) {
          return new Response(JSON.stringify({ results: [{ result: 'conflict', code: 'base_version_conflict' }] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
        return new Response('{}', { status: 200 })
      },
    ) as unknown as typeof fetch

    const transport = new HttpSyncTransport('workspace-a', '/api/v1', fetchImpl)
    const conflict = await transport.send({
      operationId: '0000000000001TEST',
      clientInstanceId: 'ci_test',
      userId: 'user-1',
      workspaceId: 'workspace-a',
      entityType: 'plan_entry',
      entityId: 'plan-1',
      operationType: 'update',
      clientOccurredAt: '2026-09-07T00:00:00.000Z',
      payload: {},
      status: 'sending',
      retryCount: 0,
    })
    expect(conflict.outcome).toBe('conflict')
  })

  it('throws on a non-2xx response so the queue can retry with backoff', async () => {
    const fetchImpl = vi.fn(async () => new Response('error', { status: 500 })) as unknown as typeof fetch
    const transport = new HttpSyncTransport('workspace-a', '/api/v1', fetchImpl)

    await expect(
      transport.send({
        operationId: '0000000000001TEST',
        clientInstanceId: 'ci_test',
        userId: 'user-1',
        workspaceId: 'workspace-a',
        entityType: 'plan_entry',
        entityId: 'plan-1',
        operationType: 'create',
        clientOccurredAt: '2026-09-07T00:00:00.000Z',
        payload: {},
        status: 'sending',
        retryCount: 0,
      }),
    ).rejects.toThrow(/sync push failed/)
  })
})

describe('createSyncPullProvider', () => {
  it('fetches an authorized snapshot for a dataset and maps records', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            serverTime: '2026-09-07T09:00:00.000Z',
            datasets: { plans: { records: [{ entityId: 'plan-1', record: { id: 'plan-1' } }], count: 1 } },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    ) as unknown as typeof fetch

    const provider = createSyncPullProvider('workspace-a', '/api/v1', fetchImpl)
    const response = await provider.fetchChanges('plans')

    expect(response.changes).toEqual([{ entityId: 'plan-1', record: { id: 'plan-1' } }])
    expect(response.nextCursor).toBe('2026-09-07T09:00:00.000Z')
  })

  it('throws on a non-2xx pull so the caller can surface the failure', async () => {
    const fetchImpl = vi.fn(async () => new Response('error', { status: 500 })) as unknown as typeof fetch
    const provider = createSyncPullProvider('workspace-a', '/api/v1', fetchImpl)

    await expect(provider.fetchChanges('plans')).rejects.toThrow(/sync pull failed/)
  })
})

describe('hydrateCacheFromSnapshot', () => {
  it('pulls server datasets into the partitioned cache', async () => {
    const service = await makeService()
    const fetchImpl = vi.fn(
      async (info: RequestInfo | URL) => {
        const url = typeof info === 'string' ? info : info.toString()
        if (url.includes('changes')) {
          return new Response(
            JSON.stringify({
              serverTime: '2026-09-07T09:00:00.000Z',
              datasets: {
                plans: { records: [{ entityId: 'plan-1', record: { id: 'plan-1', status: 'planned' } }], count: 1 },
                products: { records: [], count: 0 },
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        }
        return new Response('{}', { status: 200 })
      },
    ) as unknown as typeof fetch

    await hydrateCacheFromSnapshot(service, 'workspace-a', '/api/v1', ['plans', 'products'], fetchImpl)

    const cached = await service.db.cache.get('plans', 'plan-1')
    expect(cached?.record).toEqual({ id: 'plan-1', status: 'planned' })
  })
})
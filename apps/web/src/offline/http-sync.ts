/**
 * HTTP transport for the offline sync service (P4-A2).
 *
 * Bridges the client-side OfflineSyncService to the worker's authorized
 * /sync/operations (idempotent push) and /sync/changes (authorized pull)
 * endpoints. The injected `fetchImpl` keeps this unit-testable without a
 * network. Offline-first: a non-2xx/ network error is thrown so the service
 * can mark the operation pending and retry with backoff.
 */

import type {
  OfflineSyncService,
  SyncPullProvider,
  SyncPullResponse,
  SyncSendOutcome,
  SyncTransport,
} from './sync-service'

const SYNC_OPERATIONS_PATH = '/sync/operations'
const SYNC_CHANGES_PATH = '/sync/changes'

export class HttpSyncTransport implements SyncTransport {
  constructor(
    private readonly workspaceId: string,
    private readonly apiBase: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(operation: Parameters<SyncTransport['send']>[0]): Promise<SyncSendOutcome> {
    const base = this.apiBase.endsWith('/') ? this.apiBase.slice(0, -1) : this.apiBase
    const response = await this.fetchImpl(`${base}/workspaces/${encodeURIComponent(this.workspaceId)}${SYNC_OPERATIONS_PATH}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ operations: [operation] }),
    })

    if (!response.ok) {
      throw new Error(`sync push failed with status ${response.status}`)
    }

    const payload = (await response.json()) as { results?: Array<{ result: string; serverState?: unknown; code?: string }> }
    const result = payload.results?.[0]
    if (result === undefined) {
      throw new Error('sync push response missing results')
    }

    if (result.result === 'applied') {
      return { outcome: 'applied', serverState: result.serverState }
    }
    if (result.result === 'conflict') {
      return { outcome: 'conflict', code: result.code ?? 'conflict', serverState: result.serverState }
    }
    return { outcome: 'rejected', code: result.code ?? 'rejected' }
  }
}

export function createSyncPullProvider(
  workspaceId: string,
  apiBase: string,
  fetchImpl: typeof fetch = fetch,
): SyncPullProvider {
  return {
    async fetchChanges(dataset: string, afterCursor?: string): Promise<SyncPullResponse> {
      const base = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase
      const query = new URLSearchParams({ datasets: dataset })
      if (afterCursor !== undefined && afterCursor !== '') {
        query.set('cursor', afterCursor)
      }
      const response = await fetchImpl(
        `${base}/workspaces/${encodeURIComponent(workspaceId)}${SYNC_CHANGES_PATH}?${query.toString()}`,
        { credentials: 'include', headers: { accept: 'application/json' } },
      )

      if (!response.ok) {
        throw new Error(`sync pull failed with status ${response.status}`)
      }

            const payload = (await response.json()) as {
        serverTime?: string
        datasets?: Record<string, { records?: Array<{ entityId: string; record: unknown }>; count?: number }>
      }

      const snapshot = payload.datasets?.[dataset]
      const records = snapshot?.records ?? []
      // Snapshot-based pull: the cursor is the server time so a later pull
      // can detect staleness. Incremental feeds are P4-A4.
      const result: SyncPullResponse = {
        changes: records.map((record) => ({ entityId: record.entityId, record: record.record })),
      }
      if (payload.serverTime !== undefined) {
        result.nextCursor = payload.serverTime
        result.serverTime = payload.serverTime
      }
      return result
    },
  }
}

/**
 * Hydrate the client-side partitioned cache from an authorized snapshot pull.
 * Thin convenience around OfflineSyncService.pullChanges for callers that want
 * one call per dataset.
 */
export async function hydrateCacheFromSnapshot(
  service: OfflineSyncService,
  workspaceId: string,
  apiBase: string,
  datasets: readonly string[],
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const provider = createSyncPullProvider(workspaceId, apiBase, fetchImpl)
  await service.pullChanges(provider, datasets)
}
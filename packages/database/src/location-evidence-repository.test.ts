import { describe, expect, it } from 'vitest'

import type {
  WorkspaceAtomicDataStore,
  WorkspaceWriteCommand,
  WorkspaceWriteResult,
} from './contracts'
import { WorkspaceLocationEvidenceRepository } from './location-evidence-repository'

type QueryResolver = (query: string, values: readonly unknown[]) => unknown | unknown[] | null

class FakeAtomicStore implements WorkspaceAtomicDataStore {
  readonly workspaceId = 'workspace-a'
  readonly schemaVersion = 5
  readonly batches: WorkspaceWriteCommand[][] = []
  readonly writes: WorkspaceWriteCommand[] = []

  constructor(
    private readonly resolver: QueryResolver,
    private readonly writeResult: WorkspaceWriteResult = { success: true, changes: 1 },
  ) {}

  async health(): Promise<boolean> {
    return true
  }

  async queryFirst<T>(query: string, values: readonly unknown[] = []): Promise<T | null> {
    const value = this.resolver(query, values)
    if (Array.isArray(value)) return (value[0] ?? null) as T | null
    return value as T | null
  }

  async queryAll<T>(query: string, values: readonly unknown[] = []): Promise<T[]> {
    const value = this.resolver(query, values)
    return (value === null ? [] : Array.isArray(value) ? value : [value]) as T[]
  }

  async execute(query: string, values: readonly unknown[] = []): Promise<WorkspaceWriteResult> {
    this.writes.push({ query, values })
    return this.writeResult
  }

  async executeBatch(commands: readonly WorkspaceWriteCommand[]): Promise<WorkspaceWriteResult[]> {
    this.batches.push(commands.map((command) => ({ ...command })))
    return commands.map(() => ({ success: true, changes: 1 }))
  }
}

const evidenceRow = {
  id: 'evidence-1',
  workspace_id: 'workspace-a',
  visit_id: 'visit-1',
  owner_user_id: 'user-1',
  latitude: 35.6892,
  longitude: 51.389,
  accuracy_m: 12,
  altitude_m: 1200,
  capture_mode: 'gps',
  captured_at: 1_788_000_000_000,
  client_occurred_at: '2026-09-06T10:00:00.000Z',
  server_received_at: 1_788_000_060_000,
}

const recordInput = {
  id: 'evidence-1',
  visitId: 'visit-1',
  ownerUserId: 'user-1',
  latitude: 35.6892,
  longitude: 51.389,
  accuracyMeters: 12,
  altitudeMeters: 1200,
  captureMode: 'gps' as const,
  capturedAt: 1_788_000_000_000,
  clientOccurredAt: '2026-09-06T10:00:00.000Z',
}

describe('WorkspaceLocationEvidenceRepository', () => {
  it('records evidence with server receipt time and maps the domain shape', async () => {
    let conflictChecked = false
    const store = new FakeAtomicStore((query) => {
      if (query.includes('FROM visits')) return { id: 'visit-1' }
      if (query.includes('FROM visit_location_evidence') && !conflictChecked) {
        conflictChecked = true
        return null
      }
      if (query.includes('FROM visit_location_evidence')) return evidenceRow
      return null
    })
    const repository = new WorkspaceLocationEvidenceRepository(store, () => 1_788_000_060_000)

    const evidence = await repository.recordEvidence(recordInput)

    expect(evidence).toEqual({
      id: 'evidence-1',
      workspaceId: 'workspace-a',
      visitId: 'visit-1',
      ownerUserId: 'user-1',
      coordinates: { latitude: 35.6892, longitude: 51.389, accuracy: 12 },
      altitude: 1200,
      captureMode: 'gps',
      capturedAt: 1_788_000_000_000,
      clientOccurredAt: '2026-09-06T10:00:00.000Z',
      serverReceivedAt: 1_788_000_060_000,
    })

    const insert = store.writes[0]
    expect(insert?.query).toContain('INSERT INTO visit_location_evidence')
    expect(insert?.values?.[12]).toBe(1_788_000_060_000)
  })

  it('rejects evidence for a visit the user does not own', async () => {
    const store = new FakeAtomicStore((query) => {
      if (query.includes('FROM visits')) return null
      return null
    })
    const repository = new WorkspaceLocationEvidenceRepository(store)

    await expect(
      repository.recordEvidence({ ...recordInput, visitId: 'visit-other' }),
    ).rejects.toThrow('location_evidence_visit_not_found')
    expect(store.writes).toHaveLength(0)
  })

  it('rejects a second evidence record for the same visit', async () => {
    const store = new FakeAtomicStore((query) => {
      if (query.includes('FROM visits')) return { id: 'visit-1' }
      if (query.includes('FROM visit_location_evidence')) return evidenceRow
      return null
    })
    const repository = new WorkspaceLocationEvidenceRepository(store)

    await expect(
      repository.recordEvidence({ ...recordInput, id: 'evidence-2' }),
    ).rejects.toThrow('location_evidence_conflict')
  })

  it('rejects out-of-range coordinates before any write', async () => {
    const store = new FakeAtomicStore(() => null)
    const repository = new WorkspaceLocationEvidenceRepository(store)

    await expect(
      repository.recordEvidence({ ...recordInput, latitude: 95 }),
    ).rejects.toThrow('location_evidence_invalid:latitude_out_of_range')
    expect(store.writes).toHaveLength(0)
  })

  it('returns null when no evidence exists for the visit', async () => {
    const store = new FakeAtomicStore(() => null)
    const repository = new WorkspaceLocationEvidenceRepository(store)

    await expect(repository.getEvidenceForVisit('user-1', 'visit-1')).resolves.toBeNull()
  })
})
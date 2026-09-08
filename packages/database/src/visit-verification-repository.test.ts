import { describe, expect, it } from 'vitest'

import type {
  WorkspaceAtomicDataStore,
  WorkspaceWriteCommand,
  WorkspaceWriteResult,
} from './contracts'
import { WorkspaceVisitVerificationRepository } from './visit-verification-repository'

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

const verificationRow = {
  status: 'verified',
  distance_m: 42.5,
  accuracy_m: 12,
  policy_radius_m: 150,
  reasons_json: '["within_verified_radius"]',
}

describe('WorkspaceVisitVerificationRepository', () => {
  it('persists results with reason codes and reads them back', async () => {
    const store = new FakeAtomicStore((query) =>
      query.includes('FROM visit_verification_results') ? verificationRow : null,
    )
    const repository = new WorkspaceVisitVerificationRepository(store, () => 1_788_000_500_000)

    const saved = await repository.saveResult({
      id: 'verification-1',
      visitId: 'visit-1',
      ownerUserId: 'user-1',
      result: {
        status: 'verified',
        distanceMeters: 42.5,
        accuracyMeters: 12,
        policyRadiusMeters: 150,
        reasons: ['within_verified_radius'],
      },
    })

    expect(saved).toEqual({
      status: 'verified',
      distanceMeters: 42.5,
      accuracyMeters: 12,
      policyRadiusMeters: 150,
      reasons: ['within_verified_radius'],
    })

    const write = store.writes[0]
    expect(write?.query).toContain('ON CONFLICT (visit_id) DO UPDATE')
    expect(write?.values?.[8]).toBe('["within_verified_radius"]')
    expect(write?.values?.[9]).toBe(1_788_000_500_000)
  })

  it('returns null when no verification exists', async () => {
    const store = new FakeAtomicStore(() => null)
    const repository = new WorkspaceVisitVerificationRepository(store)

    await expect(repository.getResultForVisit('user-1', 'visit-1')).resolves.toBeNull()
  })

  it('propagates persistence failures', async () => {
    const store = new FakeAtomicStore(() => null, { success: false, changes: 0 })
    const repository = new WorkspaceVisitVerificationRepository(store)

    await expect(
      repository.saveResult({
        id: 'verification-1',
        visitId: 'visit-1',
        ownerUserId: 'user-1',
        result: {
          status: 'outside',
          distanceMeters: 9_000,
          accuracyMeters: 10,
          policyRadiusMeters: 500,
          reasons: ['beyond_nearby_radius'],
        },
      }),
    ).rejects.toThrow('visit_verification_persist_failed')
  })
})
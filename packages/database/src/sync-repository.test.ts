import { describe, expect, it } from 'vitest'

import type {
  WorkspaceWritableDataStore,
  WorkspaceWriteResult,
} from './contracts'
import { WorkspaceSyncRepository } from './sync-repository'

class FakeStore implements WorkspaceWritableDataStore {
  readonly workspaceId = 'workspace-a'
  readonly schemaVersion = 8
  readonly reads: string[] = []
  readonly writes: string[] = []

  constructor(
    private readonly firstResult: Record<string, unknown> | null = null,
    private readonly allResults: Record<string, unknown>[] = [],
  ) {}

  async health(): Promise<boolean> {
    return true
  }

  async queryFirst<T>(query: string): Promise<T | null> {
    this.reads.push(query)
    return this.firstResult as T | null
  }

  async queryAll<T>(query: string): Promise<T[]> {
    this.reads.push(query)
    return this.allResults as T[]
  }

  async execute(): Promise<WorkspaceWriteResult> {
    this.writes.push('execute')
    return { success: true, changes: 1 }
  }
}

const recordedRow = {
  operation_id: '0000000000001abcdefghjkm',
  workspace_id: 'workspace-a',
  user_id: 'user-1',
  entity_type: 'plan_entry',
  entity_id: 'plan-1',
  operation_type: 'create',
  result_json: JSON.stringify({ id: 'plan-1', status: 'planned' }),
  applied_at: 1_700_000_000_000,
}

describe('WorkspaceSyncRepository', () => {
  it('returns null when an operation id was never recorded', async () => {
    const repository = new WorkspaceSyncRepository(new FakeStore(null, []))

    expect(await repository.getRecorded('missing-operation')).toBeNull()
  })

  it('reads a recorded operation and parses its JSON result', async () => {
    const repository = new WorkspaceSyncRepository(new FakeStore(recordedRow))

    const recorded = await repository.getRecorded(recordedRow.operation_id)

    expect(recorded).not.toBeNull()
    expect(recorded).toMatchObject({
      operationId: recordedRow.operation_id,
      workspaceId: 'workspace-a',
      userId: 'user-1',
      entityType: 'plan_entry',
      entityId: 'plan-1',
      operationType: 'create',
      appliedAt: recordedRow.applied_at,
    })
    expect(recorded!.result).toEqual({ id: 'plan-1', status: 'planned' })
  })

  it('records an applied operation bound to the workspace store context', async () => {
    const store = new FakeStore(null, [])
    const repository = new WorkspaceSyncRepository(store)

    await repository.recordApplied({
      operationId: '0000000000002abcdefghjkl',
      workspaceId: 'workspace-a',
      userId: 'user-1',
      entityType: 'visit',
      entityId: 'visit-1',
      operationType: 'create',
      result: { id: 'visit-1' },
      clientOccurredAt: 1_699_999_000_000,
      appliedAt: 1_700_000_000_000,
    })

    expect(store.writes).toHaveLength(1)
  })

  it('lists recent operations for a user newest-first', async () => {
    const repository = new WorkspaceSyncRepository(
      new FakeStore(null, [
        { ...recordedRow, operation_id: '0000000000002abcdefghjkl', operation_type: 'update' },
        recordedRow,
      ]),
    )

    const recent = await repository.listForUser('user-1', 10)

    expect(recent).toHaveLength(2)
    expect(recent[0]!.operationId).toBe('0000000000002abcdefghjkl')
    expect(recent[1]!.operationId).toBe(recordedRow.operation_id)
  })

  it('guards against malformed result JSON instead of throwing in the mapping', async () => {
    const repository = new WorkspaceSyncRepository(
      new FakeStore({ ...recordedRow, result_json: '{not-json' }),
    )

    const recorded = await repository.getRecorded(recordedRow.operation_id)

    expect(recorded?.result).toBeNull()
  })
})
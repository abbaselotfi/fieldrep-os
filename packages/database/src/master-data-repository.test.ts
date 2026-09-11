import { describe, expect, it } from 'vitest'

import type { WorkspaceWriteCommand, WorkspaceWriteResult } from './contracts'
import {
  WorkspaceMasterDataRepository,
  type MasterDataRepository,
  type UpsertCustomerInput,
  type UpsertProductInput,
  type UpsertRouteInput,
} from './master-data-repository'

interface QueryAllCall {
  query: string
  values: unknown[]
}

interface ExecuteCall {
  query: string
  values: unknown[]
}

class FakeWorkspaceStore {
  public queryAllCalls: QueryAllCall[] = []
  public executeCalls: ExecuteCall[] = []
  public batchCalls: WorkspaceWriteCommand[][] = []
  public changes = 1
  public shouldSucceed = true

  constructor(public workspaceId: string = 'workspace-a', public schemaVersion: number = 1) {}

  health(): Promise<boolean> {
    return Promise.resolve(true)
  }

  queryFirst<T>(query: string, values: unknown[]): Promise<T | null> {
    this.queryAllCalls.push({ query, values })
    return Promise.resolve(null)
  }

  queryAll<T>(query: string, values: unknown[]): Promise<T[]> {
    this.queryAllCalls.push({ query, values })
    return Promise.resolve([] as T[])
  }

  execute(query: string, values: unknown[]): Promise<{ success: boolean; changes: number }> {
    this.executeCalls.push({ query, values })
    return Promise.resolve({ success: this.shouldSucceed, changes: this.changes })
  }

  executeBatch(commands: WorkspaceWriteCommand[]): Promise<WorkspaceWriteResult[]> {
    this.batchCalls.push(commands)
    return Promise.resolve([])
  }
}

function repository(store: FakeWorkspaceStore): MasterDataRepository {
  return new WorkspaceMasterDataRepository(store, () => 1000)
}

describe('WorkspaceMasterDataRepository', () => {
  it('listRoutes queries routes by workspace', async () => {
    const store = new FakeWorkspaceStore()
    const repo = repository(store)
    await repo.listRoutes()
    expect(store.queryAllCalls).toHaveLength(1)
    expect(store.queryAllCalls[0]!.query).toContain('routes')
    expect(store.queryAllCalls[0]!.values).toEqual(['workspace-a'])
  })

  it('upsertRoute issues an idempotent INSERT', async () => {
    const store = new FakeWorkspaceStore()
    const repo = repository(store)
    const input: UpsertRouteInput = { id: 'r1', code: 'R1', name: 'Route 1' }
    await repo.upsertRoute(input, 'user-1')
    expect(store.batchCalls).toHaveLength(1)
    const cmd = store.batchCalls[0]![0]!
    expect(cmd.query).toContain('INSERT INTO routes')
    expect(cmd.query).toContain('ON CONFLICT')
    expect(cmd.values).toEqual(['r1', 'workspace-a', 'R1', 'Route 1', 1000, 1000])
  })

  it('archiveRoute returns true when a row is updated', async () => {
    const store = new FakeWorkspaceStore()
    const repo = repository(store)
    const result = await repo.archiveRoute('r1', 'user-1')
    expect(result).toBe(true)
    expect(store.executeCalls).toHaveLength(1)
    expect(store.executeCalls[0]!.query).toContain('UPDATE routes')
  })

  it('archiveRoute returns false when no row matches', async () => {
    const store = new FakeWorkspaceStore()
    store.changes = 0
    const repo = repository(store)
    const result = await repo.archiveRoute('missing', 'user-1')
    expect(result).toBe(false)
  })

  it('upsertProduct issues an idempotent INSERT', async () => {
    const store = new FakeWorkspaceStore()
    const repo = repository(store)
    const input: UpsertProductInput = { id: 'p1', code: 'P1', name: 'Product 1', sortOrder: 5 }
    await repo.upsertProduct(input, 'user-1')
    expect(store.batchCalls).toHaveLength(1)
    const cmd = store.batchCalls[0]![0]!
    expect(cmd.query).toContain('INSERT INTO products')
    expect(cmd.values).toEqual(['p1', 'workspace-a', 'P1', 'Product 1', 5, 1000, 1000])
  })

  it('upsertCustomer with doctor profile issues two commands', async () => {
    const store = new FakeWorkspaceStore()
    const repo = repository(store)
    const input: UpsertCustomerInput = {
      id: 'c1',
      type: 'doctor',
      displayName: 'Dr. Ahmadi',
      doctorProfile: { specialty: 'Cardio', classKey: 'A', requiredFrequency: 4 },
    }
    await repo.upsertCustomer(input, 'user-1')
    expect(store.batchCalls).toHaveLength(1)
    expect(store.batchCalls[0]).toHaveLength(2)
    expect(store.batchCalls[0]![0]!.query).toContain('INSERT INTO customers')
    expect(store.batchCalls[0]![1]!.query).toContain('customer_doctor_profiles')
  })

  it('upsertCustomer without doctor profile issues one command', async () => {
    const store = new FakeWorkspaceStore()
    const repo = repository(store)
    const input: UpsertCustomerInput = { id: 'c1', type: 'pharmacy', displayName: 'Health Pharmacy' }
    await repo.upsertCustomer(input, 'user-1')
    expect(store.batchCalls).toHaveLength(1)
    expect(store.batchCalls[0]).toHaveLength(1)
    expect(store.batchCalls[0]![0]!.query).toContain('INSERT INTO customers')
  })

  it('archiveCustomer returns true when a row is updated', async () => {
    const store = new FakeWorkspaceStore()
    const repo = repository(store)
    const result = await repo.archiveCustomer('c1', 'user-1')
    expect(result).toBe(true)
    expect(store.executeCalls[0]!.query).toContain('UPDATE customers')
  })
})

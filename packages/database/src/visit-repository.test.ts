import { describe, expect, it } from 'vitest'

import type {
  WorkspaceAtomicDataStore,
  WorkspaceWriteCommand,
  WorkspaceWriteResult,
} from './contracts'
import { WorkspaceVisitActualRepository } from './visit-repository'

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

const visitRow = {
  id: 'visit-1',
  workspace_id: 'workspace-a',
  owner_user_id: 'user-1',
  customer_id: 'doctor-1',
  plan_entry_id: 'plan-1',
  visit_date: '2026-09-06',
  occurred_at: 1_788_680_400_000,
  status: 'completed',
  source: 'planned',
  notes: 'Good visit',
  location_id: null,
}

describe('WorkspaceVisitActualRepository', () => {
  it('lists active workspace products in configured order', async () => {
    const store = new FakeAtomicStore((query) => {
      if (query.includes('FROM products')) {
        return [
          {
            id: 'product-1',
            workspace_id: 'workspace-a',
            code: 'TJO',
            name: 'Toujeo',
            status: 'active',
            sort_order: 1,
          },
        ]
      }
      return null
    })
    const repository = new WorkspaceVisitActualRepository(store)

    await expect(repository.listProducts()).resolves.toEqual([
      {
        id: 'product-1',
        workspaceId: 'workspace-a',
        code: 'TJO',
        name: 'Toujeo',
        status: 'active',
        sortOrder: 1,
      },
    ])
  })

  it('creates a visit and product calls in one atomic batch', async () => {
    const store = new FakeAtomicStore((query) => {
      if (query.includes('FROM visits') && query.includes('LIMIT 1')) return visitRow
      if (query.includes('FROM visit_product_calls')) {
        return [
          { product_id: 'product-1', call_count: 2 },
          { product_id: 'product-2', call_count: 1 },
        ]
      }
      return null
    })
    const repository = new WorkspaceVisitActualRepository(store, () => 123)

    const visit = await repository.createCompletedVisit({
      id: 'visit-1',
      ownerUserId: 'user-1',
      customerId: 'doctor-1',
      planEntryId: 'plan-1',
      visitDate: '2026-09-06',
      occurredAt: 1_788_680_400_000,
      notes: 'Good visit',
      productCalls: [
        { productId: 'product-1', callCount: 1 },
        { productId: 'product-1', callCount: 1 },
        { productId: 'product-2', callCount: 1 },
      ],
    })

    expect(store.batches).toHaveLength(1)
    expect(store.batches[0]).toHaveLength(3)
    expect(store.batches[0]?.[0]?.values).toEqual([
      'visit-1',
      'workspace-a',
      'user-1',
      'doctor-1',
      'plan-1',
      '2026-09-06',
      1_788_680_400_000,
      'planned',
      'Good visit',
      null,
      123,
      123,
    ])
    expect(store.batches[0]?.[1]?.values).toEqual([
      'visit-1',
      'workspace-a',
      'product-1',
      2,
      123,
      123,
    ])
    expect(visit).toMatchObject({
      id: 'visit-1',
      source: 'planned',
      planEntryId: 'plan-1',
      productCalls: [
        { productId: 'product-1', callCount: 2 },
        { productId: 'product-2', callCount: 1 },
      ],
    })
  })

  it('creates an unplanned actual when no plan entry is supplied', async () => {
    const store = new FakeAtomicStore((query) => {
      if (query.includes('FROM visits') && query.includes('LIMIT 1')) {
        return { ...visitRow, plan_entry_id: null, source: 'unplanned', notes: null }
      }
      if (query.includes('FROM visit_product_calls')) return []
      return null
    })
    const repository = new WorkspaceVisitActualRepository(store, () => 123)

    const visit = await repository.createCompletedVisit({
      id: 'visit-1',
      ownerUserId: 'user-1',
      customerId: 'doctor-1',
      visitDate: '2026-09-06',
      occurredAt: 1_788_680_400_000,
      productCalls: [],
    })

    expect(store.batches[0]?.[0]?.values?.[4]).toBeNull()
    expect(store.batches[0]?.[0]?.values?.[7]).toBe('unplanned')
    expect(visit).not.toHaveProperty('planEntryId')
  })

  it('rejects invalid product counters before any write is attempted', async () => {
    const store = new FakeAtomicStore(() => null)
    const repository = new WorkspaceVisitActualRepository(store)

    await expect(
      repository.createCompletedVisit({
        id: 'visit-1',
        ownerUserId: 'user-1',
        customerId: 'doctor-1',
        visitDate: '2026-09-06',
        occurredAt: 1,
        productCalls: [{ productId: 'product-1', callCount: 0 }],
      }),
    ).rejects.toThrow('invalid_product_call_count')
    expect(store.batches).toHaveLength(0)
  })

  it('aggregates completed product calls separately from visit-record count', async () => {
    const store = new FakeAtomicStore((query) => {
      if (query.includes('COUNT(*) AS visit_count')) return { visit_count: 3 }
      if (query.includes('SUM(vpc.call_count)')) {
        return [
          { product_id: 'product-1', call_count: 2 },
          { product_id: 'product-2', call_count: 3 },
        ]
      }
      return null
    })
    const repository = new WorkspaceVisitActualRepository(store)

    await expect(
      repository.getCustomerCounters('user-1', 'doctor-1', '2026-06-22', '2026-09-22'),
    ).resolves.toEqual({
      customerId: 'doctor-1',
      completedVisitRecords: 3,
      totalProductCalls: 5,
      byProduct: [
        { productId: 'product-1', callCount: 2 },
        { productId: 'product-2', callCount: 3 },
      ],
    })
  })

  it('soft-cancels only an owned completed visit', async () => {
    const store = new FakeAtomicStore(() => null)
    const repository = new WorkspaceVisitActualRepository(store, () => 456)

    await expect(repository.cancelVisit('user-1', 'visit-1')).resolves.toBe(true)
    expect(store.writes[0]?.query).toContain("AND status = 'completed'")
    expect(store.writes[0]?.values).toEqual([456, 'workspace-a', 'user-1', 'visit-1'])
  })
})

import { describe, expect, it } from 'vitest'

import type { WorkspaceDataStore } from './contracts'
import { WorkspaceAuditRepository } from './audit-repository'

class FakeStore implements WorkspaceDataStore {
  public queryAllCalls: { query: string; values: readonly unknown[] }[] = []

  constructor(
    public workspaceId: string = 'workspace-a',
    public schemaVersion: number = 1,
    private readonly rows: Array<Record<string, unknown>> = [],
  ) {}

  health(): Promise<boolean> {
    return Promise.resolve(true)
  }

  queryFirst<T>(_query: string, _values?: readonly unknown[]): Promise<T | null> {
    return Promise.resolve(null)
  }

  queryAll<T>(query: string, values?: readonly unknown[]): Promise<T[]> {
    this.queryAllCalls.push({ query, values: values ?? [] })
    return Promise.resolve(this.rows as T[])
  }
}

const row = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'a1',
  actor_user_id: 'user-1',
  action_key: 'plan.create',
  entity_type: 'plan',
  entity_id: 'plan-1',
  metadata_json: null,
  occurred_at: 1000,
  ...overrides,
})

describe('WorkspaceAuditRepository', () => {
  it('always scopes by workspace first', async () => {
    const store = new FakeStore()
    const repo = new WorkspaceAuditRepository(store)
    await repo.listAuditEvents({ limit: 10 })
    const query = store.queryAllCalls[0]!.query
    const values = store.queryAllCalls[0]!.values
    expect(query).toContain('WHERE workspace_id = ?')
    expect(values[0]).toBe('workspace-a')
  })

  it('appends optional filters and sorts newest first', async () => {
    const store = new FakeStore()
    const repo = new WorkspaceAuditRepository(store)
    await repo.listAuditEvents({
      actorUserId: 'user-1',
      entityType: 'plan',
      actionKey: 'plan.create',
      fromMs: 500,
      toMs: 2000,
      limit: 5,
    })
    const query = store.queryAllCalls[0]!.query
    expect(query).toContain('actor_user_id = ?')
    expect(query).toContain('entity_type = ?')
    expect(query).toContain('action_key = ?')
    expect(query).toContain('occurred_at >= ?')
    expect(query).toContain('occurred_at <= ?')
    expect(query).toContain('ORDER BY occurred_at DESC')
  })

  it('clamps the limit to the repository cap', async () => {
    const store = new FakeStore()
    const repo = new WorkspaceAuditRepository(store, 200)
    await repo.listAuditEvents({ limit: 9999 })
    expect(store.queryAllCalls[0]!.query).toContain('LIMIT 200')
  })

  it('maps rows to domain AuditEvent shape and parses metadata', async () => {
    const store = new FakeStore('workspace-a', 1, [
      row({ metadata_json: '{"source":"manual"}' }),
    ])
    const repo = new WorkspaceAuditRepository(store)
    const events = await repo.listAuditEvents({ limit: 1 })
    expect(events).toHaveLength(1)
    expect(events[0]!.actionKey).toBe('plan.create')
    expect(events[0]!.entityType).toBe('plan')
    expect(events[0]!.metadata).toEqual({ source: 'manual' })
  })

  it('keeps null metadata as null', async () => {
    const store = new FakeStore('workspace-a', 1, [row()])
    const repo = new WorkspaceAuditRepository(store)
    const events = await repo.listAuditEvents({ limit: 1 })
    expect(events[0]!.metadata).toBeNull()
  })
})
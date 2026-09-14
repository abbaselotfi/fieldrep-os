import { describe, expect, it } from 'vitest'

import type {
  D1DatabaseLike,
  D1PreparedStatementLike,
  D1ResultLike,
  D1RunResultLike,
} from './contracts'
import {
  ControlPlanePlatformOperationsRepository,
  type PlatformOperationsRepository,
} from './platform-operations-repository'

interface FakeD1Data {
  platform_audit_events?: Array<{
    id: string
    actor_user_id: string | null
    action_key: string
    target_type: string
    target_id: string | null
    company_id: string | null
    workspace_id: string | null
    metadata_json: string | null
    occurred_at: number
  }>
  workspace_data_routes?: Array<{
    workspace_id: string
    store_type: string
    store_identifier: string
    status: string
    schema_version: number
    metadata_json: string | null
    created_at: number
    updated_at: number
  }>
}

class FakeD1Database implements D1DatabaseLike {
  public prepareCalls: { query: string; values: unknown[] }[] = []

  constructor(private readonly data: FakeD1Data = {}) {}

  prepare(query: string): D1PreparedStatementLike {
    return new FakeD1Statement(query, this.data, this.prepareCalls)
  }
}

class FakeD1Statement implements D1PreparedStatementLike {
  private boundValues: unknown[] = []

  constructor(
    private readonly query: string,
    private readonly data: FakeD1Data,
    private readonly calls: { query: string; values: unknown[] }[],
  ) {}

  bind(...values: unknown[]): D1PreparedStatementLike {
    this.boundValues = values
    return this
  }

  first<T>(): Promise<T | null> {
    this.calls.push({ query: this.query, values: this.boundValues })
    return Promise.resolve((this.getRows<T>()[0] ?? null) as T | null)
  }

  all<T>(): Promise<D1ResultLike<T>> {
    this.calls.push({ query: this.query, values: this.boundValues })
    return Promise.resolve({ results: this.getRows<T>() })
  }

  run(): Promise<D1RunResultLike> {
    this.calls.push({ query: this.query, values: this.boundValues })
    return Promise.resolve({ success: true, meta: { changes: 1 } })
  }

  private getRows<T>(): T[] {
    if (this.query.includes('FROM platform_audit_events')) {
      let rows = [...(this.data.platform_audit_events ?? [])].sort(
        (a, b) => b.occurred_at - a.occurred_at || a.id.localeCompare(b.id),
      )
      // Consume bound values in the same order conditions appear in the query.
      const markers: Array<[string, string]> = [
        ['company_id = ?', 'company_id'],
        ['workspace_id = ?', 'workspace_id'],
        ['actor_user_id = ?', 'actor_user_id'],
        ['action_key = ?', 'action_key'],
        ['target_type = ?', 'target_type'],
        ['occurred_at >= ?', 'fromMs'],
        ['occurred_at <= ?', 'toMs'],
      ]
      const applied: Record<string, unknown> = {}
      let valueIndex = 0
      for (const [marker, key] of markers) {
        if (this.query.includes(marker)) {
          applied[key] = this.boundValues[valueIndex]
          valueIndex += 1
        }
      }
      if (applied.company_id !== undefined) rows = rows.filter((r) => r.company_id === applied.company_id)
      if (applied.workspace_id !== undefined) rows = rows.filter((r) => r.workspace_id === applied.workspace_id)
      if (applied.actor_user_id !== undefined) rows = rows.filter((r) => r.actor_user_id === applied.actor_user_id)
      if (applied.action_key !== undefined) rows = rows.filter((r) => r.action_key === applied.action_key)
      if (applied.target_type !== undefined) rows = rows.filter((r) => r.target_type === applied.target_type)
      if (applied.fromMs !== undefined) rows = rows.filter((r) => r.occurred_at >= (applied.fromMs as number))
      if (applied.toMs !== undefined) rows = rows.filter((r) => r.occurred_at <= (applied.toMs as number))
      return rows as T[]
    }
    if (this.query.includes('FROM workspace_data_routes')) {
      const rows = this.data.workspace_data_routes ?? []
      if (this.query.includes('WHERE workspace_id = ?')) {
        const id = this.boundValues[0] as string
        return rows.filter((r) => r.workspace_id === id) as T[]
      }
      return [...rows].sort((a, b) => a.workspace_id.localeCompare(b.workspace_id)) as T[]
    }
    return []
  }
}

function repository(db: FakeD1Database): PlatformOperationsRepository {
  return new ControlPlanePlatformOperationsRepository(db, () => 2000)
}

const event = (id: string, occurredAt: number, overrides: Partial<{ company_id: string | null; workspace_id: string | null; action_key: string; target_type: string }> = {}) => ({
  id,
  actor_user_id: 'admin-1',
  action_key: 'limits.update',
  target_type: 'company',
  target_id: 'c1',
  company_id: 'c1' as string | null,
  workspace_id: null as string | null,
  metadata_json: null,
  occurred_at: occurredAt,
  ...overrides,
})

const route = (workspaceId: string, status: string) => ({
  workspace_id: workspaceId,
  store_type: 'd1',
  store_identifier: `db-${workspaceId}`,
  status,
  schema_version: 1,
  metadata_json: null,
  created_at: 1000,
  updated_at: 1000,
})

describe('ControlPlanePlatformOperationsRepository — audit events', () => {
  it('lists events ordered by occurred_at desc', async () => {
    const db = new FakeD1Database({
      platform_audit_events: [event('e1', 1000), event('e2', 3000), event('e3', 2000)],
    })
    const events = await repository(db).listAuditEvents({ limit: 50 })
    expect(events.map((e) => e.id)).toEqual(['e2', 'e3', 'e1'])
  })

  it('narrows by company and workspace when filters are supplied', async () => {
    const db = new FakeD1Database({
      platform_audit_events: [
        event('e1', 1000, { company_id: 'c1', workspace_id: 'w1' }),
        event('e2', 2000, { company_id: 'c2', workspace_id: 'w1' }),
      ],
    })
    const events = await repository(db).listAuditEvents({ companyId: 'c1', workspaceId: 'w1', limit: 50 })
    expect(events.map((e) => e.id)).toEqual(['e1'])
  })

  it('narrows by action key and time range', async () => {
    const db = new FakeD1Database({
      platform_audit_events: [
        event('e1', 1000, { action_key: 'route.update' }),
        event('e2', 3000, { action_key: 'route.update' }),
        event('e3', 2000, { action_key: 'limits.update' }),
      ],
    })
    const events = await repository(db).listAuditEvents({
      actionKey: 'route.update',
      fromMs: 1500,
      toMs: 2500,
      limit: 50,
    })
    expect(events).toHaveLength(0)
  })

  it('clamps the limit to the repository maximum', async () => {
    const db = new FakeD1Database({
      platform_audit_events: [event('e1', 1000)],
    })
    const repo = new ControlPlanePlatformOperationsRepository(db, () => 2000, 5)
    await repo.listAuditEvents({ limit: 999 })
    const call = db.prepareCalls[0]!
    expect(call.query).toContain('LIMIT 5')
  })

  it('records an audit event with serialized metadata', async () => {
    const db = new FakeD1Database()
    const recorded = await repository(db).recordAuditEvent({
      id: 'e9',
      actorUserId: 'admin-1',
      actionKey: 'route.update',
      targetType: 'workspace',
      targetId: 'w1',
      workspaceId: 'w1',
      metadata: { reason: 'migration' },
    })
    expect(recorded).toBe(true)
    const call = db.prepareCalls[0]!
    expect(call.query).toContain('INSERT INTO platform_audit_events')
    expect(call.values[7]).toBe('{"reason":"migration"}')
  })
})

describe('ControlPlanePlatformOperationsRepository — data routes', () => {
  it('lists routes sorted by workspace id', async () => {
    const db = new FakeD1Database({
      workspace_data_routes: [route('w2', 'active'), route('w1', 'active')],
    })
    const routes = await repository(db).listDataRoutes()
    expect(routes.map((r) => r.workspaceId)).toEqual(['w1', 'w2'])
  })

  it('returns null for an unknown route', async () => {
    const db = new FakeD1Database()
    expect(await repository(db).getDataRoute('missing')).toBeNull()
  })

  it('upserts a new route and preserves created_at on update', async () => {
    const db = new FakeD1Database({ workspace_data_routes: [route('w1', 'active')] })
    const repo = repository(db)
    const created = await repo.upsertDataRoute({
      workspaceId: 'w1',
      storeType: 'd1',
      storeIdentifier: 'db-w1',
      status: 'maintenance',
      schemaVersion: 2,
    })
    expect(created.status).toBe('maintenance')
    expect(created.createdAt).toBe(1000)
    expect(created.updatedAt).toBe(2000)
  })
})
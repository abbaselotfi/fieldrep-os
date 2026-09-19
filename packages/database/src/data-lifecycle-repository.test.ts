import { describe, expect, it } from 'vitest'

import type {
  D1DatabaseLike,
  D1PreparedStatementLike,
  D1ResultLike,
  D1RunResultLike,
} from './contracts'
import {
  ControlPlaneDataLifecycleRepository,
  type DataLifecycleRepository,
} from './data-lifecycle-repository'

interface FakeD1Data {
  company_retention_policies?: Array<Record<string, unknown>>
  lifecycle_events?: Array<Record<string, unknown>>
  backup_drills?: Array<Record<string, unknown>>
}

class FakeD1Database implements D1DatabaseLike {
  public prepareCalls: { query: string; values: unknown[] }[] = []

  constructor(public readonly data: FakeD1Data = {}) {}

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
    const values = this.boundValues
    if (this.query.includes('INSERT INTO company_retention_policies')) {
      const companyId = values[0] as string
      const rest = (this.data.company_retention_policies ?? []).filter(
        (row) => row.company_id !== companyId,
      )
      this.data.company_retention_policies = [
        ...rest,
        {
          company_id: companyId,
          purge_after_days: values[1],
          updated_by: values[2],
          updated_at: values[3],
        },
      ]
    }
    if (this.query.includes('INSERT INTO lifecycle_events')) {
      this.data.lifecycle_events = [
        ...(this.data.lifecycle_events ?? []),
        {
          id: values[0],
          company_id: values[1],
          workspace_id: values[2],
          action: values[3],
          performed_by: values[4],
          reason: values[5],
          at_ms: values[6],
        },
      ]
    }
    if (this.query.includes('INSERT INTO backup_drills')) {
      this.data.backup_drills = [
        ...(this.data.backup_drills ?? []),
        {
          id: values[0],
          scope: values[1],
          target_id: values[2],
          backup_reference: values[3],
          started_at_ms: values[4],
          completed_at_ms: null,
          result: null,
          verified_by: values[5],
          rpo_minutes: null,
          rto_minutes: null,
          notes: values[6],
        },
      ]
    }
    if (this.query.includes('UPDATE backup_drills')) {
      const id = values[6] as string
      const row = this.data.backup_drills?.find((drill) => drill.id === id)
      if (row) {
        row.completed_at_ms = values[0]
        row.result = values[1]
        row.verified_by = values[2]
        row.rpo_minutes = values[3]
        row.rto_minutes = values[4]
        row.notes = values[5]
      }
    }
    return Promise.resolve({ success: true, meta: { changes: 1 } })
  }

  private getRows<T>(): T[] {
    if (this.query.includes('FROM company_retention_policies')) {
      let rows = this.data.company_retention_policies ?? []
      if (this.query.includes('WHERE company_id = ?')) {
        rows = rows.filter((row) => row.company_id === this.boundValues[0])
      }
      return [...rows].sort((a, b) =>
        String(a.company_id).localeCompare(String(b.company_id)),
      ) as T[]
    }
    if (this.query.includes('FROM lifecycle_events')) {
      let rows = this.data.lifecycle_events ?? []
      rows = rows.filter((row) => row.company_id === this.boundValues[0])
      if (this.query.includes('AND workspace_id = ?')) {
        rows = rows.filter((row) => row.workspace_id === this.boundValues[1])
      }
      return [...rows].sort(
        (a, b) => (a.at_ms as number) - (b.at_ms as number) ||
          String(a.id).localeCompare(String(b.id)),
      ) as T[]
    }
    if (this.query.includes('FROM backup_drills')) {
      let rows = this.data.backup_drills ?? []
      if (this.query.includes('WHERE scope = ?')) {
        rows = rows.filter((row) => row.scope === this.boundValues[0])
      } else if (this.query.includes('WHERE id = ?')) {
        rows = rows.filter((row) => row.id === this.boundValues[0])
      }
      // Mirrors ORDER BY started_at_ms DESC, id.
      return [...rows].sort(
        (a, b) => (b.started_at_ms as number) - (a.started_at_ms as number) ||
          String(a.id).localeCompare(String(b.id)),
      ) as T[]
    }
    return []
  }
}

function repository(db: FakeD1Database, now: () => number = () => 5_000): DataLifecycleRepository {
  return new ControlPlaneDataLifecycleRepository(db, now)
}

describe('retention policies', () => {
  it('up-inserts a normalized policy and keeps the updater', async () => {
    const db = new FakeD1Database()
    const repo = repository(db)
    const stored = await repo.upsertRetentionPolicy('c1', { purgeAfterDays: 90.7 }, 'platform-admin-1')
    expect(stored).toEqual({ purgeAfterDays: 90 })
    const fetched = await repo.getRetentionPolicy('c1')
    expect(fetched).toEqual({ purgeAfterDays: 90 })
    expect((await repo.listRetentionPolicies())[0]).toMatchObject({
      companyId: 'c1',
      updatedBy: 'platform-admin-1',
    })
  })

  it('lists policies sorted by company', async () => {
    const db = new FakeD1Database({
      company_retention_policies: [
        { company_id: 'c-b', purge_after_days: 180, updated_by: null, updated_at: 1 },
        { company_id: 'c-a', purge_after_days: 90, updated_by: null, updated_at: 1 },
      ],
    })
    expect((await repository(db).listRetentionPolicies()).map((row) => row.companyId)).toEqual([
      'c-a',
      'c-b',
    ])
  })
})

describe('lifecycle ledger', () => {
  it('records an append-only event and replays it back', async () => {
    const db = new FakeD1Database()
    const repo = repository(db)
    const recorded = await repo.recordLifecycleEvent({
      id: 'ev-1',
      action: 'suspend',
      companyId: 'c1',
      workspaceId: 'w1',
      performedBy: 'platform-admin-1',
      reason: 'contract paused',
      atMs: 1_000,
    })
    expect(recorded).not.toBeNull()
    const events = await repo.listLifecycleEvents('c1')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ action: 'suspend', workspaceId: 'w1' })
  })

  it('refuses a non-recordable event without a write', async () => {
    const db = new FakeD1Database()
    const repo = repository(db)
    expect(
      await repo.recordLifecycleEvent({ id: '', action: 'suspend', companyId: 'c1', atMs: 1_000 }),
    ).toBeNull()
    expect(await repo.listLifecycleEvents('c1')).toHaveLength(0)
  })

  it('filters the ledger by workspace and orders by time', async () => {
    const db = new FakeD1Database({
      lifecycle_events: [
        { id: 'ev-2', company_id: 'c1', workspace_id: null, action: 'archive', performed_by: null, reason: null, at_ms: 2_000 },
        { id: 'ev-1', company_id: 'c1', workspace_id: 'w1', action: 'suspend', performed_by: null, reason: null, at_ms: 1_000 },
        { id: 'ev-3', company_id: 'c2', workspace_id: 'w1', action: 'resume', performed_by: null, reason: null, at_ms: 3_000 },
      ],
    })
    const repo = repository(db)
    expect((await repo.listLifecycleEvents('c1')).map((event) => event.id)).toEqual(['ev-1', 'ev-2'])
    expect((await repo.listLifecycleEvents('c1', 'w1')).map((event) => event.id)).toEqual(['ev-1'])
  })
})

describe('backup drill ledger', () => {
  it('starts a well-formed drill and rejects an invalid one without a write', async () => {
    const db = new FakeD1Database()
    const repo = repository(db)
    const started = await repo.startDrill({
      id: 'drill-1',
      scope: 'workspace',
      targetId: 'w1',
      backupReference: 'backup://2026-09',
      performedBy: 'platform-admin-1',
    })
    expect(started.outcome).toBe('started')
    expect(started.drill).toMatchObject({ id: 'drill-1', result: null })

    const invalid = await repo.startDrill({
      id: '',
      scope: 'workspace',
      targetId: 'w1',
      backupReference: 'b',
    })
    expect(invalid.outcome).toBe('rejected')
    expect(invalid.reason).toBe('invalid_drill')
    expect((await repo.listBackupDrills()).map((drill) => drill.id)).toEqual(['drill-1'])
  })

  it('completes a drill with measured recovery metrics', async () => {
    const db = new FakeD1Database()
    const repo = repository(db)
    await repo.startDrill({ id: 'drill-2', scope: 'control_plane', backupReference: 'b://full' })
    const completed = await repo.completeDrill({
      id: 'drill-2',
      result: 'passed',
      completedAtMs: 6_000,
      verifiedBy: 'platform-admin-1',
      rpoMinutes: 5,
      rtoMinutes: 45,
    })
    expect(completed?.outcome).toBe('completed')
    expect(completed?.drill).toMatchObject({ result: 'passed', rpoMinutes: 5, rtoMinutes: 45 })
  })

  it('refuses a passed drill without metrics and a second completion', async () => {
    const db = new FakeD1Database()
    const repo = repository(db)
    await repo.startDrill({ id: 'drill-3', scope: 'workspace', targetId: 'w2', backupReference: 'b' })

    const noMetrics = await repo.completeDrill({
      id: 'drill-3',
      result: 'passed',
      completedAtMs: 6_000,
    })
    expect(noMetrics?.outcome).toBe('rejected')
    expect(noMetrics?.reason).toBe('metrics_required')
    expect((await repo.getBackupDrill('drill-3'))?.result).toBeNull()

    await repo.completeDrill({
      id: 'drill-3',
      result: 'failed',
      completedAtMs: 6_000,
      notes: 'restore aborted',
    })
    const again = await repo.completeDrill({
      id: 'drill-3',
      result: 'passed',
      completedAtMs: 7_000,
      rpoMinutes: 1,
      rtoMinutes: 1,
    })
    expect(again?.outcome).toBe('rejected')
    expect(again?.reason).toBe('invalid_state')
    expect((await repo.getBackupDrill('drill-3'))?.result).toBe('failed')
    expect(await repo.completeDrill({ id: 'nope', result: 'failed', completedAtMs: 1 })).toBeNull()
  })

  it('lists drills newest-first and filters by scope', async () => {
    const db = new FakeD1Database()
    const repo = repository(db)
    await repo.startDrill({ id: 'd-old', scope: 'workspace', targetId: 'w1', backupReference: 'b' })
    await repo.startDrill({ id: 'd-new', scope: 'control_plane', backupReference: 'b' })
    expect((await repo.listBackupDrills()).map((drill) => drill.id)).toEqual(['d-new', 'd-old'])
    expect((await repo.listBackupDrills('workspace')).map((drill) => drill.id)).toEqual(['d-old'])
  })
})
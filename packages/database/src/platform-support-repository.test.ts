import { describe, expect, it } from 'vitest'

import type {
  D1DatabaseLike,
  D1PreparedStatementLike,
  D1ResultLike,
  D1RunResultLike,
} from './contracts'
import {
  ControlPlanePlatformSupportRepository,
  type PlatformSupportRepository,
} from './platform-support-repository'

type GrantRowLike = {
  id: string
  workspace_id: string
  requested_by_user_id: string | null
  reason: string
  status: string
  requested_at: number
  decided_at: number | null
  decided_by_user_id: string | null
  expires_at: number | null
  created_at: number
  updated_at: number
}

interface FakeD1Data {
  support_access_grants?: GrantRowLike[]
  companies?: Array<{ status: string }>
  workspaces?: Array<{ status: string }>
  workspace_data_routes?: Array<{ status: string }>
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
  private executed = false

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

  all<T>(): Promise<{ results: T[] }> {
    this.calls.push({ query: this.query, values: this.boundValues })
    return Promise.resolve({ results: this.getRows<T>() })
  }

  run(): Promise<D1RunResultLike> {
    if (this.executed) return Promise.resolve({ success: true, meta: { changes: 0 } })
    this.executed = true
    this.calls.push({ query: this.query, values: this.boundValues })
    if (this.query.includes('UPDATE support_access_grants')) {
      const id = this.boundValues[5] as string
      const grant = this.data.support_access_grants?.find((g) => g.id === id)
      if (grant) {
        grant.status = this.boundValues[0] as string
        grant.decided_at = this.boundValues[1] as number
        grant.decided_by_user_id = this.boundValues[2] as string | null
        grant.expires_at = this.boundValues[3] as number | null
        grant.updated_at = this.boundValues[4] as number
      }
    }
    if (this.query.includes('INSERT INTO support_access_grants')) {
      this.data.support_access_grants = [
        ...(this.data.support_access_grants ?? []),
        {
          id: this.boundValues[0] as string,
          workspace_id: this.boundValues[1] as string,
          requested_by_user_id: this.boundValues[2] as string | null,
          reason: this.boundValues[3] as string,
          status: 'requested',
          requested_at: this.boundValues[4] as number,
          decided_at: null,
          decided_by_user_id: null,
          expires_at: null,
          created_at: this.boundValues[5] as number,
          updated_at: this.boundValues[5] as number,
        },
      ]
    }
    return Promise.resolve({ success: true, meta: { changes: 1 } })
  }

  private getRows<T>(): T[] {
    if (this.query.includes('FROM support_access_grants')) {
      let rows = [...(this.data.support_access_grants ?? [])].sort(
        (a, b) => b.requested_at - a.requested_at || a.id.localeCompare(b.id),
      )
      if (this.query.includes('WHERE id = ?')) {
        const id = this.boundValues[0] as string
        rows = rows.filter((g) => g.id === id)
      } else {
        if (this.query.includes('workspace_id = ?'))
          rows = rows.filter((g) => g.workspace_id === this.boundValues[0])
        if (this.query.includes('status = ?'))
          rows = rows.filter((g) => g.status === this.boundValues[this.boundValues.length - 1])
      }
      return rows as T[]
    }
    if (this.query.includes('GROUP BY status')) {
      const table = this.query.includes('FROM companies')
        ? 'companies'
        : this.query.includes('FROM workspaces')
          ? 'workspaces'
          : 'workspace_data_routes'
      const rows = this.data[table as keyof FakeD1Data] as Array<{ status: string }> | undefined
      const byStatus = new Map<string, number>()
      for (const row of rows ?? []) byStatus.set(row.status, (byStatus.get(row.status) ?? 0) + 1)
      return [...byStatus.entries()].map(([status, count]) => ({ status, count })) as T[]
    }
    return []
  }
}

function repository(db: FakeD1Database): PlatformSupportRepository {
  return new ControlPlanePlatformSupportRepository(db, () => 5000)
}

const grantRow = (id: string, overrides: Partial<GrantRowLike> = {}): GrantRowLike => ({
  id,
  workspace_id: 'w1',
  requested_by_user_id: 'admin-1',
  reason: 'support investigation',
  status: 'requested',
  requested_at: 1000,
  decided_at: null,
  decided_by_user_id: null,
  expires_at: null,
  created_at: 1000,
  updated_at: 1000,
  ...overrides,
})

describe('ControlPlanePlatformSupportRepository — grants', () => {
  it('creates a grant in requested state', async () => {
    const db = new FakeD1Database()
    const repo = repository(db)
    const grant = await repo.createSupportAccessGrant({
      id: 'g1',
      workspaceId: 'w1',
      requestedByUserId: 'admin-1',
      reason: 'data investigation',
    })
    expect(grant.status).toBe('requested')
    expect(grant.expiresAt).toBeNull()
    expect(grant.decidedAt).toBeNull()
  })

  it('lists grants newest-first and narrows by workspace/status', async () => {
    const db = new FakeD1Database({
      support_access_grants: [
        grantRow('g1', { requested_at: 1000 }),
        grantRow('g2', { requested_at: 2000, workspace_id: 'w2', status: 'approved' }),
      ],
    })
    const repo = repository(db)
    const all = await repo.listSupportAccessGrants({ limit: 50 })
    expect(all.map((g) => g.id)).toEqual(['g2', 'g1'])
    const w2 = await repo.listSupportAccessGrants({ workspaceId: 'w2', limit: 50 })
    expect(w2.map((g) => g.id)).toEqual(['g2'])
  })

  it('returns null for an unknown grant', async () => {
    const db = new FakeD1Database()
    expect(await repository(db).getSupportAccessGrant('missing')).toBeNull()
  })

  it('approves a requested grant with an expiry window', async () => {
    const db = new FakeD1Database({ support_access_grants: [grantRow('g1')] })
    const repo = repository(db)
    const result = await repo.decideSupportAccessGrant('g1', {
      decision: 'approve',
      decidedByUserId: 'platform-admin-1',
      durationMs: 3600_000,
    })
    expect(result?.transition).toBe('applied')
    expect(result?.grant.status).toBe('approved')
    expect(result?.grant.expiresAt).toBe(3600_000 + 5000)
    expect(result?.grant.decidedByUserId).toBe('platform-admin-1')
  })

  it('rejects an invalid transition without writing (fail-closed)', async () => {
    const db = new FakeD1Database({
      support_access_grants: [grantRow('g1', { status: 'revoked' })],
    })
    const repo = repository(db)
    const result = await repo.decideSupportAccessGrant('g1', { decision: 'approve' })
    expect(result?.transition).toBe('rejected')
    expect(result?.grant.status).toBe('revoked')
  })

  it('returns null when deciding an unknown grant', async () => {
    const db = new FakeD1Database()
    expect(await repository(db).decideSupportAccessGrant('missing', { decision: 'approve' })).toBeNull()
  })
})

describe('ControlPlanePlatformSupportRepository — usage overview', () => {
  it('rolls up statuses across companies, workspaces and routes', async () => {
    const db = new FakeD1Database({
      companies: [{ status: 'active' }, { status: 'suspended' }],
      workspaces: [{ status: 'active' }, { status: 'archived' }, { status: 'active' }],
      workspace_data_routes: [{ status: 'active' }, { status: 'disabled' }],
    })
    const overview = await repository(db).getUsageOverview()
    expect(overview.companies).toEqual({ total: 2, active: 1, suspended: 1, archived: 0 })
    expect(overview.workspaces).toEqual({ total: 3, active: 2, suspended: 0, archived: 1 })
    expect(overview.dataRoutes).toEqual({ total: 2, active: 1, maintenance: 0, disabled: 1 })
  })
})
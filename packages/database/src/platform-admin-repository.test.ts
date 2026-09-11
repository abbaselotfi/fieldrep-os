import { describe, expect, it } from 'vitest'

import type {
  D1DatabaseLike,
  D1PreparedStatementLike,
  D1ResultLike,
  D1RunResultLike,
} from './contracts'
import {
  ControlPlanePlatformAdminRepository,
  type PlatformAdminRepository,
} from './platform-admin-repository'

interface FakeD1Data {
  companies?: Array<{ id: string; name: string; slug: string; status: string; created_at: number; updated_at: number }>
  workspaces?: Array<{ id: string; company_id: string; name: string; slug: string; status: string; created_at: number; updated_at: number }>
  platform_limits?: Array<{ company_id: string; max_workspaces: number; max_users_per_workspace: number; max_storage_mb: number; max_imports_per_cycle: number }>
}

class FakeD1Database implements D1DatabaseLike {
  public prepareCalls: { query: string; values: unknown[] }[] = []

  constructor(private readonly data: FakeD1Data = {}) {}

  prepare(query: string): D1PreparedStatementLike {
    return new FakeD1Statement(query, this.data, this.prepareCalls)
  }

  batch(statements: D1PreparedStatementLike[]): Promise<D1RunResultLike[]> {
    return Promise.resolve([])
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
    const rows = this.getRows<T>()
    return Promise.resolve(rows[0] ?? null)
  }

  all<T>(): Promise<D1ResultLike<T>> {
    this.calls.push({ query: this.query, values: this.boundValues })
    const rows = this.getRows<T>()
    return Promise.resolve({ results: rows })
  }

  run(): Promise<D1RunResultLike> {
    this.calls.push({ query: this.query, values: this.boundValues })
    return Promise.resolve({ success: true, meta: { changes: 1 } })
  }

  private getRows<T>(): T[] {
    if (this.query.includes('COUNT(*)')) {
      const companyId = this.boundValues[0] as string
      const count = this.data.workspaces?.filter((w) => w.company_id === companyId && w.status !== 'archived').length ?? 0
      return [{ count }] as T[]
    }
    if (this.query.includes('FROM companies')) {
      if (this.query.includes('WHERE id = ?')) {
        const id = this.boundValues[0] as string
        const company = this.data.companies?.find((c) => c.id === id)
        return (company ? [company] : []) as T[]
      }
      return (this.data.companies ?? []) as T[]
    }
    if (this.query.includes('FROM workspaces')) {
      if (this.query.includes('WHERE company_id = ?')) {
        const companyId = this.boundValues[0] as string
        return (this.data.workspaces?.filter((w) => w.company_id === companyId) ?? []) as T[]
      }
      if (this.query.includes('WHERE id = ?')) {
        const id = this.boundValues[0] as string
        const workspace = this.data.workspaces?.find((w) => w.id === id)
        return (workspace ? [workspace] : []) as T[]
      }
      return (this.data.workspaces ?? []) as T[]
    }
    if (this.query.includes('FROM platform_limits')) {
      const companyId = this.boundValues[0] as string
      const limit = this.data.platform_limits?.find((l) => l.company_id === companyId)
      return (limit ? [limit] : []) as T[]
    }
    return []
  }
}

function repository(db: FakeD1Database): PlatformAdminRepository {
  return new ControlPlanePlatformAdminRepository(db, () => 1000)
}

const company = { id: 'c1', name: 'Acme', slug: 'acme', status: 'active', created_at: 1000, updated_at: 1000 }

const workspace = (id: string, status: string) => ({ id, company_id: 'c1', name: id, slug: id, status, created_at: 1000, updated_at: 1000 })

describe('ControlPlanePlatformAdminRepository', () => {
  it('listCompanies returns all companies', async () => {
    const db = new FakeD1Database({ companies: [company] })
    const repo = repository(db)
    const companies = await repo.listCompanies()
    expect(companies).toHaveLength(1)
    expect(companies[0]!.name).toBe('Acme')
    expect(companies[0]!.slug).toBe('acme')
  })

  it('getCompany returns null for unknown id', async () => {
    const db = new FakeD1Database()
    const repo = repository(db)
    expect(await repo.getCompany('unknown')).toBeNull()
  })

  it('createCompany returns the company with active status', async () => {
    const db = new FakeD1Database()
    const repo = repository(db)
    const created = await repo.createCompany({ id: 'c2', name: 'BioPharma' })
    expect(created.id).toBe('c2')
    expect(created.status).toBe('active')
    expect(created.slug).toBe('biopharma')
  })

  it('updateCompanyStatus returns true when updated', async () => {
    const db = new FakeD1Database({ companies: [company] })
    const repo = repository(db)
    expect(await repo.updateCompanyStatus('c1', 'suspended')).toBe(true)
  })

  it('listWorkspaces filters by company', async () => {
    const db = new FakeD1Database({
      workspaces: [workspace('w1', 'active'), { ...workspace('w2', 'active'), company_id: 'c2' }],
    })
    const repo = repository(db)
    const workspaces = await repo.listWorkspaces('c1')
    expect(workspaces).toHaveLength(1)
    expect(workspaces[0]!.id).toBe('w1')
  })

  it('createWorkspace returns the workspace with active status', async () => {
    const db = new FakeD1Database()
    const repo = repository(db)
    const created = await repo.createWorkspace({ id: 'w1', companyId: 'c1', name: 'Tehran' })
    expect(created.status).toBe('active')
    expect(created.slug).toBe('tehran')
  })

  it('getLimits uses safe defaults when the row is missing', async () => {
    const db = new FakeD1Database()
    const repo = repository(db)
    const limits = await repo.getLimits('c1')
    expect(limits!.maxWorkspaces).toBe(5)
    expect(limits!.maxUsersPerWorkspace).toBe(50)
    expect(limits!.maxStorageMb).toBe(1000)
    expect(limits!.maxImportsPerCycle).toBe(10)
  })

  it('getLimits merges stored row and usage', async () => {
    const db = new FakeD1Database({
      platform_limits: [{ company_id: 'c1', max_workspaces: 3, max_users_per_workspace: 25, max_storage_mb: 500, max_imports_per_cycle: 5 }],
      workspaces: [workspace('w1', 'active'), workspace('w2', 'archived')],
    })
    const repo = repository(db)
    const limits = await repo.getLimits('c1')
    expect(limits!.maxWorkspaces).toBe(3)
    expect(limits!.usedWorkspaces).toBe(1)
  })

  it('getWorkspaceCount excludes archived workspaces', async () => {
    const db = new FakeD1Database({ workspaces: [workspace('w1', 'active'), workspace('w2', 'archived')] })
    const repo = repository(db)
    expect(await repo.getWorkspaceCount('c1')).toBe(1)
  })

  it('updateLimits upserts the limits row', async () => {
    const db = new FakeD1Database({
      platform_limits: [{ company_id: 'c1', max_workspaces: 3, max_users_per_workspace: 25, max_storage_mb: 500, max_imports_per_cycle: 5 }],
    })
    const repo = repository(db)
    const result = await repo.updateLimits('c1', { maxWorkspaces: 10 })
    expect(result).toBe(true)
  })
})
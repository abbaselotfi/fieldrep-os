import type {
  Company,
  CompanyStatus,
  CreateCompanyInput,
  CreateWorkspaceInput,
  PlatformLimits,
  UpdateLimitsInput,
  Workspace,
  WorkspaceStatus,
} from '@fieldrep/domain'
import { slugifyName } from '@fieldrep/domain'

import type { D1DatabaseLike } from './contracts'

/**
 * Platform administration repository (P10-A1).
 *
 * Control-plane access over migration-0001 tables (companies/workspaces) plus
 * the migration-0002 `platform_limits` ledger. Fail-closed: unknown entities
 * return null, limits are read with safe defaults when the row is missing.
 */

export interface PlatformAdminRepository {
  listCompanies(): Promise<readonly Company[]>
  getCompany(id: string): Promise<Company | null>
  createCompany(input: CreateCompanyInput): Promise<Company>
  updateCompanyStatus(id: string, status: CompanyStatus): Promise<boolean>
  listWorkspaces(companyId: string): Promise<readonly Workspace[]>
  getWorkspace(id: string): Promise<Workspace | null>
  createWorkspace(input: CreateWorkspaceInput): Promise<Workspace>
  updateWorkspaceStatus(id: string, status: WorkspaceStatus): Promise<boolean>
  getLimits(companyId: string): Promise<PlatformLimits | null>
  updateLimits(companyId: string, patch: UpdateLimitsInput): Promise<boolean>
  getWorkspaceCount(companyId: string): Promise<number>
  getUserCount(workspaceId: string): Promise<number>
}

interface CompanyRow {
  id: string
  name: string
  slug: string
  status: string
  created_at: number
  updated_at: number
}

interface WorkspaceRow {
  id: string
  company_id: string
  name: string
  slug: string
  status: string
  created_at: number
  updated_at: number
}

interface LimitsRow {
  company_id: string
  max_workspaces: number
  max_users_per_workspace: number
  max_storage_mb: number
  max_imports_per_cycle: number
}

const COMPANY_COLUMNS = 'id, name, slug, status, created_at, updated_at'
const WORKSPACE_COLUMNS = 'id, company_id, name, slug, status, created_at, updated_at'

export class ControlPlanePlatformAdminRepository implements PlatformAdminRepository {
  constructor(
    private readonly db: D1DatabaseLike,
    private readonly now: () => number = Date.now,
  ) {}

  async listCompanies(): Promise<readonly Company[]> {
    const stmt = this.db.prepare(`SELECT ${COMPANY_COLUMNS} FROM companies ORDER BY created_at, id`)
    const rows = await stmt.all<CompanyRow>()
    return rows.results.map(toCompany)
  }

  async getCompany(id: string): Promise<Company | null> {
    const stmt = this.db.prepare(`SELECT ${COMPANY_COLUMNS} FROM companies WHERE id = ? LIMIT 1`)
    const row = await stmt.bind(id).first<CompanyRow>()
    return row ? toCompany(row) : null
  }

  async createCompany(input: CreateCompanyInput): Promise<Company> {
    const now = this.now()
    const slug = input.slug ?? slugifyName(input.name)
    const stmt = this.db.prepare(
      `INSERT INTO companies (id, name, slug, legal_name, country, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
    )
    await stmt.bind(input.id, input.name, slug, input.legalName ?? null, input.country ?? null, now, now).run?.()
    return {
      id: input.id,
      name: input.name,
      slug,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }
  }

  async updateCompanyStatus(id: string, status: CompanyStatus): Promise<boolean> {
    const stmt = this.db.prepare('UPDATE companies SET status = ?, updated_at = ? WHERE id = ?')
    const result = await stmt.bind(status, this.now(), id).run?.()
    return toChanged(result)
  }

  async listWorkspaces(companyId: string): Promise<readonly Workspace[]> {
    const stmt = this.db.prepare(
      `SELECT ${WORKSPACE_COLUMNS} FROM workspaces WHERE company_id = ? ORDER BY created_at, id`,
    )
    const rows = await stmt.bind(companyId).all<WorkspaceRow>()
    return rows.results.map(toWorkspace)
  }

  async getWorkspace(id: string): Promise<Workspace | null> {
    const stmt = this.db.prepare(`SELECT ${WORKSPACE_COLUMNS} FROM workspaces WHERE id = ? LIMIT 1`)
    const row = await stmt.bind(id).first<WorkspaceRow>()
    return row ? toWorkspace(row) : null
  }

  async createWorkspace(input: CreateWorkspaceInput): Promise<Workspace> {
    const now = this.now()
    const slug = input.slug ?? slugifyName(input.name)
    const stmt = this.db.prepare(
      `INSERT INTO workspaces (id, company_id, name, slug, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?)`,
    )
    await stmt.bind(input.id, input.companyId, input.name, slug, now, now).run?.()
    return {
      id: input.id,
      companyId: input.companyId,
      name: input.name,
      slug,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }
  }

  async updateWorkspaceStatus(id: string, status: WorkspaceStatus): Promise<boolean> {
    const stmt = this.db.prepare('UPDATE workspaces SET status = ?, updated_at = ? WHERE id = ?')
    const result = await stmt.bind(status, this.now(), id).run?.()
    return toChanged(result)
  }

  async getLimits(companyId: string): Promise<PlatformLimits | null> {
    const stmt = this.db.prepare(
      'SELECT company_id, max_workspaces, max_users_per_workspace, max_storage_mb, max_imports_per_cycle FROM platform_limits WHERE company_id = ? LIMIT 1',
    )
    const row = await stmt.bind(companyId).first<LimitsRow>()
    return {
      companyId,
      maxWorkspaces: row?.max_workspaces ?? 5,
      maxUsersPerWorkspace: row?.max_users_per_workspace ?? 50,
      maxStorageMb: row?.max_storage_mb ?? 1000,
      maxImportsPerCycle: row?.max_imports_per_cycle ?? 10,
      usedWorkspaces: await this.getWorkspaceCount(companyId),
      usedUsers: 0,
    }
  }

  async updateLimits(companyId: string, patch: UpdateLimitsInput): Promise<boolean> {
    const now = this.now()
    const current = await this.getLimits(companyId)
    if (current === null) return false
    const stmt = this.db.prepare(
      `INSERT INTO platform_limits (company_id, max_workspaces, max_users_per_workspace, max_storage_mb, max_imports_per_cycle, updated_by_user_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(company_id) DO UPDATE SET
         max_workspaces = excluded.max_workspaces,
         max_users_per_workspace = excluded.max_users_per_workspace,
         max_storage_mb = excluded.max_storage_mb,
         max_imports_per_cycle = excluded.max_imports_per_cycle,
         updated_by_user_id = excluded.updated_by_user_id,
         updated_at = excluded.updated_at`,
    )
    const result = await stmt
      .bind(
        companyId,
        patch.maxWorkspaces ?? current.maxWorkspaces,
        patch.maxUsersPerWorkspace ?? current.maxUsersPerWorkspace,
        patch.maxStorageMb ?? current.maxStorageMb,
        patch.maxImportsPerCycle ?? current.maxImportsPerCycle,
        patch.updatedByUserId ?? null,
        now,
      )
      .run?.()
    return result?.success === true
  }

  async getWorkspaceCount(companyId: string): Promise<number> {
    const stmt = this.db.prepare(
      "SELECT COUNT(*) AS count FROM workspaces WHERE company_id = ? AND status <> 'archived'",
    )
    const row = await stmt.bind(companyId).first<{ count: number }>()
    return row?.count ?? 0
  }

  async getUserCount(_workspaceId: string): Promise<number> {
    return 0
  }
}

function toCompany(row: CompanyRow): Company {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status as CompanyStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    slug: row.slug,
    status: row.status as WorkspaceStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toChanged(result: { success: boolean; meta?: { changes?: number } } | undefined): boolean {
  return result?.success === true && (result.meta?.changes ?? 0) > 0
}
import { describe, expect, it } from 'vitest'

import type {
  D1DatabaseLike,
  D1PreparedStatementLike,
  D1ResultLike,
  D1RunResultLike,
} from './contracts'
import {
  ControlPlanePlatformSettingsRepository,
  type PlatformSettingsRepository,
} from './platform-settings-repository'

interface EntitlementRowLike {
  id: string
  company_id: string
  workspace_id: string | null
  feature_key: string
  status: string
  starts_at: number | null
  ends_at: number | null
  config_json: string | null
  created_at: number
  updated_at: number
}

interface FakeD1Data {
  platform_settings?: Array<{ key: string; value_json: string; updated_at: number }>
  feature_entitlements?: EntitlementRowLike[]
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

  all<T>(): Promise<D1ResultLike<T>> {
    this.calls.push({ query: this.query, values: this.boundValues })
    return Promise.resolve({ results: this.getRows<T>() })
  }

  run(): Promise<D1RunResultLike> {
    if (this.executed) return Promise.resolve({ success: true, meta: { changes: 0 } })
    this.executed = true
    this.calls.push({ query: this.query, values: this.boundValues })
    if (this.query.includes('INSERT INTO platform_settings')) {
      this.data.platform_settings = [
        { key: this.boundValues[0] as string, value_json: this.boundValues[1] as string, updated_at: this.boundValues[3] as number },
      ]
    }
    if (this.query.includes('INSERT INTO feature_entitlements')) {
      this.data.feature_entitlements = [
        ...(this.data.feature_entitlements ?? []),
        {
          id: this.boundValues[0] as string,
          company_id: this.boundValues[1] as string,
          workspace_id: this.boundValues[2] as string | null,
          feature_key: this.boundValues[3] as string,
          status: this.boundValues[4] as string,
          config_json: this.boundValues[5] as string | null,
          starts_at: this.boundValues[6] as number | null,
          ends_at: this.boundValues[7] as number | null,
          created_at: this.boundValues[8] as number,
          updated_at: this.boundValues[9] as number,
        },
      ]
    }
    if (this.query.includes('UPDATE feature_entitlements')) {
      const id = this.boundValues[5] as string
      const row = this.data.feature_entitlements?.find((e) => e.id === id)
      if (row) {
        row.status = this.boundValues[0] as string
        row.config_json = this.boundValues[1] as string | null
        row.starts_at = this.boundValues[2] as number | null
        row.ends_at = this.boundValues[3] as number | null
        row.updated_at = this.boundValues[4] as number
      }
    }
    return Promise.resolve({ success: true, meta: { changes: 1 } })
  }

  private getRows<T>(): T[] {
    if (this.query.includes('FROM platform_settings')) {
      const key = this.boundValues[0] as string
      return (this.data.platform_settings ?? []).filter((s) => s.key === key) as T[]
    }
    if (this.query.includes('FROM feature_entitlements')) {
      const companyId = this.boundValues[0] as string
      const featureKey = this.boundValues[1] as string
      let rows = (this.data.feature_entitlements ?? []).filter((e) => e.company_id === companyId)
      if (this.query.includes('feature_key = ?')) {
        rows = rows.filter((e) => e.feature_key === featureKey)
        if (this.query.includes('workspace_id IS NULL')) {
          rows = rows.filter((e) => e.workspace_id === null)
        } else if (this.query.includes('workspace_id = ?')) {
          rows = rows.filter((e) => e.workspace_id === this.boundValues[2])
        }
      }
      return [...rows].sort(
        (a, b) =>
          a.feature_key.localeCompare(b.feature_key) ||
          (a.workspace_id ?? '').localeCompare(b.workspace_id ?? ''),
      ) as T[]
    }
    return []
  }
}

function repository(db: FakeD1Database): PlatformSettingsRepository {
  return new ControlPlanePlatformSettingsRepository(db, () => 9000)
}

const entitlementRow = (
  id: string,
  overrides: Partial<EntitlementRowLike> = {},
): EntitlementRowLike => ({
  id,
  company_id: 'c1',
  workspace_id: null,
  feature_key: 'ai_planning',
  status: 'enabled',
  starts_at: null,
  ends_at: null,
  config_json: null,
  created_at: 1000,
  updated_at: 1000,
  ...overrides,
})

describe('ControlPlanePlatformSettingsRepository — global settings', () => {
  it('returns fail-safe defaults when no row exists', async () => {
    const settings = await repository(new FakeD1Database()).getGlobalSettings()
    expect(settings.allowWorkspaceSelfService).toBe(false)
    expect(settings.requireSupportAccessApproval).toBe(true)
    expect(settings.supportAccessDefaultDurationMs).toBe(4 * 60 * 60 * 1000)
  })

  it('merges stored values over the defaults', async () => {
    const db = new FakeD1Database({
      platform_settings: [
        { key: 'global', value_json: JSON.stringify({ allowWorkspaceSelfService: true }), updated_at: 1000 },
      ],
    })
    const settings = await repository(db).getGlobalSettings()
    expect(settings.allowWorkspaceSelfService).toBe(true)
    expect(settings.requireSupportAccessApproval).toBe(true)
  })

  it('falls back to defaults on corrupt stored JSON', async () => {
    const db = new FakeD1Database({
      platform_settings: [{ key: 'global', value_json: '{not json', updated_at: 1000 }],
    })
    const settings = await repository(db).getGlobalSettings()
    expect(settings).toEqual({
      allowWorkspaceSelfService: false,
      requireSupportAccessApproval: true,
      supportAccessDefaultDurationMs: 4 * 60 * 60 * 1000,
      defaultWorkspaceSchemaVersion: 1,
    })
  })

  it('upserts a clamped settings document', async () => {
    const db = new FakeD1Database()
    const settings = await repository(db).updateGlobalSettings({
      supportAccessDefaultDurationMs: 1,
      updatedByUserId: 'platform-admin-1',
    })
    expect(settings.supportAccessDefaultDurationMs).toBe(5 * 60 * 1000)
    const insertCall = db.prepareCalls.find((call) =>
      call.query.includes('INSERT INTO platform_settings'),
    )!
    expect(insertCall.values[2]).toBe('platform-admin-1')
  })
})

describe('ControlPlanePlatformSettingsRepository — entitlements', () => {
  it('lists entitlements for a company sorted by feature key', async () => {
    const db = new FakeD1Database({
      feature_entitlements: [
        entitlementRow('e1', { feature_key: 'visit_verification' }),
        entitlementRow('e2', { feature_key: 'ai_planning' }),
        entitlementRow('e3', { feature_key: 'ai_planning', company_id: 'c2' }),
      ],
    })
    const entitlements = await repository(db).listEntitlements('c1')
    expect(entitlements.map((e) => e.id)).toEqual(['e2', 'e1'])
  })

  it('resolves a company-level entitlement (workspace_id IS NULL)', async () => {
    const db = new FakeD1Database({
      feature_entitlements: [
        entitlementRow('e1'),
        entitlementRow('e2', { workspace_id: 'w1' }),
      ],
    })
    const repo = repository(db)
    expect((await repo.getEntitlement('c1', 'ai_planning'))?.id).toBe('e1')
    expect((await repo.getEntitlement('c1', 'ai_planning', 'w1'))?.id).toBe('e2')
    expect(await repo.getEntitlement('c1', 'maps_location')).toBeNull()
  })

  it('inserts a new entitlement when none exists', async () => {
    const db = new FakeD1Database()
    const entitlement = await repository(db).upsertEntitlement({
      id: 'e9',
      companyId: 'c1',
      featureKey: 'ai_planning',
      status: 'enabled',
      config: { model: 'advisory' },
    })
    expect(entitlement.id).toBe('e9')
    expect(entitlement.createdAt).toBe(9000)
    expect(entitlement.status).toBe('enabled')
  })

  it('updates an existing entitlement in place, preserving created_at', async () => {
    const db = new FakeD1Database({ feature_entitlements: [entitlementRow('e1')] })
    const repo = repository(db)
    const updated = await repo.upsertEntitlement({
      id: 'ignored-new-id',
      companyId: 'c1',
      featureKey: 'ai_planning',
      status: 'disabled',
    })
    expect(updated.id).toBe('e1')
    expect(updated.status).toBe('disabled')
    expect(updated.createdAt).toBe(1000)
    expect(updated.updatedAt).toBe(9000)
  })
})
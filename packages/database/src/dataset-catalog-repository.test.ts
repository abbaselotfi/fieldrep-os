import { describe, expect, it } from 'vitest'

import type {
  D1DatabaseLike,
  D1PreparedStatementLike,
  D1ResultLike,
  D1RunResultLike,
} from './contracts'
import {
  ControlPlaneDatasetCatalogRepository,
  type DatasetCatalogRepository,
} from './dataset-catalog-repository'

interface FakeD1Data {
  datasets?: Array<Record<string, unknown>>
  dataset_versions?: Array<Record<string, unknown>>
  dataset_assignments?: Array<Record<string, unknown>>
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
    if (this.query.includes('INSERT INTO datasets')) {
      this.data.datasets = [
        ...(this.data.datasets ?? []),
        {
          id: values[0],
          owner_type: values[1],
          owner_id: values[2],
          name: values[3],
          dataset_type: values[4],
          status: 'draft',
          source_type: values[5],
          created_at: values[6],
          updated_at: values[7],
        },
      ]
    }
    if (this.query.includes('INSERT INTO dataset_versions')) {
      this.data.dataset_versions = [
        ...(this.data.dataset_versions ?? []),
        {
          id: values[0],
          dataset_id: values[1],
          version_label: values[2],
          status: 'draft',
          record_count: values[3],
          created_by: values[4],
          source_import_id: values[5],
          created_at: values[6],
          published_at: null,
        },
      ]
    }
    if (this.query.includes('INSERT INTO dataset_assignments')) {
      this.data.dataset_assignments = [
        ...(this.data.dataset_assignments ?? []),
        {
          id: values[0],
          dataset_id: values[1],
          dataset_version_id: values[2],
          recipient_company_id: values[3],
          recipient_workspace_id: values[4],
          mode: values[5],
          status: values[6],
          valid_from: values[7],
          valid_until: values[8],
          created_at: values[9],
          updated_at: values[10],
        },
      ]
    }
    if (this.query.includes('UPDATE dataset_versions SET status = ?, published_at = ?')) {
      const row = this.data.dataset_versions?.find((v) => v.id === values[2])
      if (row) {
        row.status = values[0]
        row.published_at = values[1]
      }
    } else if (this.query.includes('UPDATE dataset_versions SET status = ?')) {
      const row = this.data.dataset_versions?.find((v) => v.id === values[1])
      if (row) row.status = values[0]
    }
    if (this.query.includes('UPDATE dataset_assignments')) {
      const row = this.data.dataset_assignments?.find((a) => a.id === values[2])
      if (row) {
        row.status = values[0]
        row.updated_at = values[1]
      }
    }
    return Promise.resolve({ success: true, meta: { changes: 1 } })
  }

  private getRows<T>(): T[] {
    if (this.query.includes('FROM datasets')) {
      const rows = [...(this.data.datasets ?? [])].sort(
        (a, b) => String(a.name).localeCompare(String(b.name)),
      )
      if (this.query.includes('WHERE id = ?')) {
        return rows.filter((r) => r.id === this.boundValues[0]) as T[]
      }
      return rows as T[]
    }
    if (this.query.includes('FROM dataset_versions')) {
      let rows = this.data.dataset_versions ?? []
      if (this.query.includes('WHERE dataset_id = ?')) {
        rows = rows.filter((r) => r.dataset_id === this.boundValues[0])
      } else if (this.query.includes('WHERE id = ?')) {
        rows = rows.filter((r) => r.id === this.boundValues[0])
      }
      return rows as T[]
    }
    if (this.query.includes('FROM dataset_assignments')) {
      let rows = this.data.dataset_assignments ?? []
      if (this.query.includes('WHERE dataset_id = ?')) {
        rows = rows.filter((r) => r.dataset_id === this.boundValues[0])
      } else if (this.query.includes('WHERE id = ?')) {
        rows = rows.filter((r) => r.id === this.boundValues[0])
      }
      return rows as T[]
    }
    return []
  }
}

function repository(db: FakeD1Database): DatasetCatalogRepository {
  return new ControlPlaneDatasetCatalogRepository(db, () => 10_000)
}

const datasetRow = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  owner_type: 'platform',
  owner_id: null,
  name: `Dataset ${id}`,
  dataset_type: 'practitioners',
  status: 'draft',
  source_type: 'import',
  created_at: 1000,
  updated_at: 1000,
  ...overrides,
})

const versionRow = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  dataset_id: 'd1',
  version_label: id,
  status: 'draft',
  record_count: 10,
  created_by: null,
  source_import_id: null,
  created_at: 1000,
  published_at: null,
  ...overrides,
})

describe('ControlPlaneDatasetCatalogRepository — datasets', () => {
  it('creates a dataset in draft state owned by the platform', async () => {
    const dataset = await repository(new FakeD1Database()).createDataset({
      id: 'd1',
      name: 'Iran practitioners',
      datasetType: 'practitioners',
      sourceType: 'purchase',
    })
    expect(dataset.status).toBe('draft')
    expect(dataset.ownerType).toBe('platform')
    expect(dataset.sourceType).toBe('purchase')
  })

  it('lists datasets sorted by name and returns null for unknown ids', async () => {
    const db = new FakeD1Database({
      datasets: [datasetRow('d2', { name: 'Beta' }), datasetRow('d1', { name: 'Alpha' })],
    })
    const repo = repository(db)
    const datasets = await repo.listDatasets()
    expect(datasets.map((d) => d.name)).toEqual(['Alpha', 'Beta'])
    expect(await repo.getDataset('missing')).toBeNull()
  })
})

describe('ControlPlaneDatasetCatalogRepository — versions', () => {
  it('creates draft versions', async () => {
    const db = new FakeD1Database()
    const version = await repository(db).createVersion({
      id: 'v1',
      datasetId: 'd1',
      versionLabel: '2026-09',
      recordCount: 1200,
    })
    expect(version.status).toBe('draft')
    expect(version.recordCount).toBe(1200)
    expect(version.publishedAt).toBeNull()
  })

  it('refuses to publish a non-draft version', async () => {
    const db = new FakeD1Database({ dataset_versions: [versionRow('v1', { status: 'published' })] })
    const result = await repository(db).publishVersion('v1')
    expect(result?.outcome).toBe('rejected')
    expect(result?.version.status).toBe('published')
  })

  it('refuses to publish an empty draft', async () => {
    const db = new FakeD1Database({ dataset_versions: [versionRow('v1', { record_count: 0 })] })
    const result = await repository(db).publishVersion('v1')
    expect(result?.outcome).toBe('rejected')
  })

  it('publishes a draft and supersedes the previous published version', async () => {
    const db = new FakeD1Database({
      dataset_versions: [
        versionRow('v1', { status: 'published', published_at: 500 }),
        versionRow('v2', { record_count: 50 }),
      ],
    })
    const result = await repository(db).publishVersion('v2')
    expect(result?.outcome).toBe('published')
    expect(result?.version.status).toBe('published')
    expect(result?.version.publishedAt).toBe(10_000)
    const previous = (db.data.dataset_versions ?? []).find((v) => v.id === 'v1')
    expect(previous!.status).toBe('superseded')
  })

  it('returns null when publishing an unknown version', async () => {
    expect(await repository(new FakeD1Database()).publishVersion('missing')).toBeNull()
  })
})

describe('ControlPlaneDatasetCatalogRepository — assignments', () => {
  it('creates an immediately active assignment with an open window', async () => {
    const result = await repository(new FakeD1Database()).createAssignment({
      id: 'a1',
      datasetId: 'd1',
      recipientCompanyId: 'c1',
      mode: 'live',
    })
    expect(result.outcome).toBe('created')
    expect(result.assignment.status).toBe('active')
  })

  it('creates a pending assignment for a future start date', async () => {
    const result = await repository(new FakeD1Database()).createAssignment({
      id: 'a1',
      datasetId: 'd1',
      recipientCompanyId: 'c1',
      mode: 'live',
      validFrom: 50_000,
    })
    expect(result.assignment.status).toBe('pending')
  })

  it('rejects a snapshot assignment without a pinned version', async () => {
    const result = await repository(new FakeD1Database()).createAssignment({
      id: 'a1',
      datasetId: 'd1',
      recipientCompanyId: 'c1',
      mode: 'snapshot',
    })
    expect(result.outcome).toBe('rejected')
  })

  it('rejects a live assignment that pins a version', async () => {
    const result = await repository(new FakeD1Database()).createAssignment({
      id: 'a1',
      datasetId: 'd1',
      recipientCompanyId: 'c1',
      mode: 'live',
      datasetVersionId: 'v1',
    })
    expect(result.outcome).toBe('rejected')
  })

  it('rejects an inverted validity window', async () => {
    const result = await repository(new FakeD1Database()).createAssignment({
      id: 'a1',
      datasetId: 'd1',
      recipientCompanyId: 'c1',
      mode: 'snapshot',
      datasetVersionId: 'v1',
      validFrom: 5000,
      validUntil: 4000,
    })
    expect(result.outcome).toBe('rejected')
  })

  it('accepts a snapshot assignment with a pinned version', async () => {
    const result = await repository(new FakeD1Database()).createAssignment({
      id: 'a1',
      datasetId: 'd1',
      recipientCompanyId: 'c1',
      mode: 'snapshot',
      datasetVersionId: 'v1',
    })
    expect(result.outcome).toBe('created')
    expect(result.assignment.datasetVersionId).toBe('v1')
  })

  it('revokes an assignment once and rejects a repeat revocation', async () => {
    const db = new FakeD1Database({
      dataset_assignments: [
        {
          id: 'a1',
          dataset_id: 'd1',
          dataset_version_id: null,
          recipient_company_id: 'c1',
          recipient_workspace_id: null,
          mode: 'live',
          status: 'active',
          valid_from: null,
          valid_until: null,
          created_at: 1000,
          updated_at: 1000,
        },
      ],
    })
    const repo = repository(db)
    const first = await repo.revokeAssignment('a1')
    expect(first?.outcome).toBe('revoked')
    expect(first?.assignment.status).toBe('revoked')
    const second = await repo.revokeAssignment('a1')
    expect(second?.outcome).toBe('rejected')
    expect(await repo.revokeAssignment('missing')).toBeNull()
  })

  it('resolves the fail-closed effective state', async () => {
    const db = new FakeD1Database({
      dataset_assignments: [
        {
          id: 'a1',
          dataset_id: 'd1',
          dataset_version_id: null,
          recipient_company_id: 'c1',
          recipient_workspace_id: null,
          mode: 'live',
          status: 'active',
          valid_from: null,
          valid_until: 9_000,
          created_at: 1000,
          updated_at: 1000,
        },
      ],
    })
    const repo = repository(db)
    expect(await repo.resolveState('a1', 8000)).toBe('active')
    expect(await repo.resolveState('a1', 9000)).toBe('inactive')
    expect(await repo.resolveState('missing', 8000)).toBeNull()
  })
})
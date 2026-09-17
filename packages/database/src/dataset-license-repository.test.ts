import { describe, expect, it } from 'vitest'

import type {
  D1DatabaseLike,
  D1PreparedStatementLike,
  D1ResultLike,
  D1RunResultLike,
} from './contracts'
import {
  ControlPlaneDatasetLicenseRepository,
  type DatasetLicenseRepository,
} from './dataset-license-repository'

interface FakeD1Data {
  datasets?: Array<Record<string, unknown>>
  dataset_licenses?: Array<Record<string, unknown>>
  dataset_exports?: Array<Record<string, unknown>>
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
    if (this.query.includes('INSERT INTO dataset_licenses')) {
      const datasetId = values[0] as string
      const rest = (this.data.dataset_licenses ?? []).filter((l) => l.dataset_id !== datasetId)
      this.data.dataset_licenses = [
        ...rest,
        {
          dataset_id: datasetId,
          license_reference: values[1],
          export_allowed: values[2],
          redistribution_allowed: values[3],
          max_export_records: values[4],
          territory: values[5],
          updated_at: values[6],
        },
      ]
    }
    if (this.query.includes('INSERT INTO dataset_exports')) {
      this.data.dataset_exports = [
        ...(this.data.dataset_exports ?? []),
        {
          id: values[0],
          dataset_id: values[1],
          dataset_version_id: values[2],
          format: values[3],
          record_count: values[4],
          reason: values[5],
          requested_by: values[6],
          status: 'pending',
          created_at: values[7],
          completed_at: null,
        },
      ]
    }
    if (this.query.includes('UPDATE dataset_exports')) {
      const id = values[3] as string
      const row = this.data.dataset_exports?.find((e) => e.id === id)
      if (row) {
        row.status = values[0]
        row.completed_at = values[1]
        row.reason = values[2]
      }
    }
    return Promise.resolve({ success: true, meta: { changes: 1 } })
  }

  private getRows<T>(): T[] {
    if (this.query.includes('source_type FROM datasets')) {
      const row = (this.data.datasets ?? []).find((d) => d.id === this.boundValues[0])
      return (row === undefined ? [] : [{ source_type: row.source_type }]) as T[]
    }
    if (this.query.includes('FROM dataset_licenses')) {
      let rows = this.data.dataset_licenses ?? []
      if (this.query.includes('WHERE dataset_id = ?')) {
        rows = rows.filter((l) => l.dataset_id === this.boundValues[0])
      }
      return [...rows].sort((a, b) =>
        String(a.dataset_id).localeCompare(String(b.dataset_id)),
      ) as T[]
    }
    if (this.query.includes('FROM dataset_exports')) {
      let rows = this.data.dataset_exports ?? []
      if (this.query.includes('WHERE dataset_id = ?')) {
        rows = rows.filter((e) => e.dataset_id === this.boundValues[0])
        return [...rows].sort((a, b) => (b.created_at as number) - (a.created_at as number)) as T[]
      }
      if (this.query.includes('WHERE id = ?')) {
        rows = rows.filter((e) => e.id === this.boundValues[0])
      }
      return rows as T[]
    }
    if (this.query.includes('FROM dataset_assignments')) {
      let rows = this.data.dataset_assignments ?? []
      rows = rows.filter((a) => a.recipient_company_id === this.boundValues[0])
      if (this.query.includes('recipient_workspace_id = ?')) {
        rows = rows.filter(
          (a) =>
            a.recipient_workspace_id === null ||
            a.recipient_workspace_id === this.boundValues[1],
        )
      }
      return rows as T[]
    }
    return []
  }
}

function repository(db: FakeD1Database, now: () => number = () => 3000): DatasetLicenseRepository {
  return new ControlPlaneDatasetLicenseRepository(db, now)
}

const EXPORT_CONTEXT = {
  versionStatus: 'published' as const,
  publishedVersionId: 'v1',
  atMs: 3000,
}

function datasetRow(id: string, sourceType: string): Record<string, unknown> {
  return { id, source_type: sourceType }
}

describe('dataset licenses', () => {
  it('up-inserts normalized terms (redistribution implies export, caps clamped)', async () => {
    const db = new FakeD1Database({ datasets: [datasetRow('d1', 'purchase')] })
    const repo = repository(db)
    const stored = await repo.upsertLicense('d1', {
      exportAllowed: false,
      redistributionAllowed: true,
      maxExportRecords: -3,
      licenseReference: 'IQVIA-2026',
    })
    expect(stored.exportAllowed).toBe(true)
    expect(stored.maxExportRecords).toBeNull()
    expect(stored.licenseReference).toBe('IQVIA-2026')
    expect((await repo.getLicense('d1'))?.redistributionAllowed).toBe(true)
  })

  it('falls back to fail-closed provenance defaults when no license exists', async () => {
    const db = new FakeD1Database({
      datasets: [datasetRow('d-internal', 'internal'), datasetRow('d-bought', 'purchase')],
    })
    const repo = repository(db)
    expect((await repo.resolveLicense('d-internal'))?.exportAllowed).toBe(true)
    expect((await repo.resolveLicense('d-bought'))?.exportAllowed).toBe(false)
    expect(await repo.resolveLicense('missing')).toBeNull()
  })

  it('prefers an explicit license over the provenance default', async () => {
    const db = new FakeD1Database({
      datasets: [datasetRow('d-bought', 'purchase')],
      dataset_licenses: [
        {
          dataset_id: 'd-bought',
          license_reference: 'LIC-1',
          export_allowed: 1,
          redistribution_allowed: 0,
          max_export_records: 500,
          territory: 'IR',
          updated_at: 1000,
        },
      ],
    })
    const resolved = await repository(db).resolveLicense('d-bought')
    expect(resolved?.exportAllowed).toBe(true)
    expect(resolved?.maxExportRecords).toBe(500)
  })

  it('lists licenses deterministically by dataset', async () => {
    const db = new FakeD1Database({
      dataset_licenses: [
        { dataset_id: 'd-b', license_reference: null, export_allowed: 1, redistribution_allowed: 0, max_export_records: null, territory: null, updated_at: 1 },
        { dataset_id: 'd-a', license_reference: null, export_allowed: 1, redistribution_allowed: 0, max_export_records: null, territory: null, updated_at: 1 },
      ],
    })
    expect((await repository(db).listLicenses()).map((l) => l.datasetId)).toEqual(['d-a', 'd-b'])
  })
})

describe('dataset exports', () => {
  // Fresh fixture per test: the fake writes back into the data it is given.
  const licensedData = (): FakeD1Data => ({
    datasets: [datasetRow('d1', 'purchase')],
    dataset_licenses: [
      {
        dataset_id: 'd1',
        license_reference: 'LIC-1',
        export_allowed: 1,
        redistribution_allowed: 0,
        max_export_records: null,
        territory: null,
        updated_at: 1000,
      },
    ],
  })

  it('creates an export ledger entry for a licensed published head', async () => {
    const db = new FakeD1Database(licensedData())
    const repo = repository(db)
    const result = await repo.createExport(
      {
        id: 'e1',
        datasetId: 'd1',
        datasetVersionId: 'v1',
        format: 'csv',
        recordCount: 100,
        requestedBy: 'platform-admin-1',
      },
      EXPORT_CONTEXT,
    )
    expect(result.outcome).toBe('created')
    expect(result.evaluation.effectiveVersionId).toBe('v1')
    expect(result.draft.status).toBe('pending')
    expect((await repo.listExports('d1'))[0]!.id).toBe('e1')
  })

  it('refuses an unlicensed dataset without writing a ledger row', async () => {
    const db = new FakeD1Database({ datasets: [datasetRow('d2', 'purchase')] })
    const repo = repository(db)
    const result = await repo.createExport(
      { id: 'e2', datasetId: 'd2', datasetVersionId: 'v1', format: 'csv', recordCount: 10 },
      EXPORT_CONTEXT,
    )
    expect(result.outcome).toBe('rejected')
    expect(result.evaluation.outcome).toBe('license_denied')
    expect(await repo.listExports('d2')).toHaveLength(0)
  })

  it('refuses an unpublished version and a request beyond the license cap', async () => {
    const db = new FakeD1Database({
      datasets: [datasetRow('d1', 'purchase')],
      dataset_licenses: [
        {
          dataset_id: 'd1',
          license_reference: null,
          export_allowed: 1,
          redistribution_allowed: 0,
          max_export_records: 50,
          territory: null,
          updated_at: 1,
        },
      ],
    })
    const repo = repository(db)
    const draft = await repo.createExport(
      { id: 'e3', datasetId: 'd1', datasetVersionId: 'v1', format: 'csv', recordCount: 10 },
      { ...EXPORT_CONTEXT, versionStatus: 'draft' },
    )
    expect(draft.evaluation.outcome).toBe('version_not_published')

    const tooBig = await repo.createExport(
      { id: 'e4', datasetId: 'd1', datasetVersionId: 'v1', format: 'csv', recordCount: 60 },
      EXPORT_CONTEXT,
    )
    expect(tooBig.evaluation.outcome).toBe('record_limit_exceeded')
    expect(await repo.listExports('d1')).toHaveLength(0)
  })

  it('governs an assignment-scoped export by mode, window and version pin', async () => {
    const db = new FakeD1Database(licensedData())
    const repo = repository(db)
    const snapshot = {
      status: 'active' as const,
      validFrom: null,
      validUntil: null,
      mode: 'snapshot' as const,
      datasetVersionId: 'v1',
    }
    const allowed = await repo.createExport(
      { id: 'e5', datasetId: 'd1', datasetVersionId: 'v1', format: 'json', recordCount: 10 },
      { ...EXPORT_CONTEXT, assignment: snapshot },
    )
    expect(allowed.outcome).toBe('created')

    const mismatch = await repo.createExport(
      { id: 'e6', datasetId: 'd1', datasetVersionId: 'v2', format: 'json', recordCount: 10 },
      { ...EXPORT_CONTEXT, assignment: snapshot },
    )
    expect(mismatch.evaluation.outcome).toBe('assignment_version_mismatch')

    const revoked = await repo.createExport(
      { id: 'e7', datasetId: 'd1', datasetVersionId: 'v1', format: 'json', recordCount: 10 },
      { ...EXPORT_CONTEXT, assignment: { ...snapshot, status: 'revoked' } },
    )
    expect(revoked.evaluation.outcome).toBe('assignment_inactive')

    const banned = await repo.createExport(
      { id: 'e8', datasetId: 'd1', datasetVersionId: 'v1', format: 'json', recordCount: 10 },
      { ...EXPORT_CONTEXT, assignment: snapshot, assignmentExportAllowed: false },
    )
    expect(banned.evaluation.outcome).toBe('license_denied')
    expect((await repo.listExports('d1')).map((e) => e.id)).toEqual(['e5'])
  })

  it('completes an export once and refuses a second decision', async () => {
    const db = new FakeD1Database(licensedData())
    const repo = repository(db)
    await repo.createExport(
      { id: 'e9', datasetId: 'd1', datasetVersionId: 'v1', format: 'xlsx', recordCount: 10 },
      EXPORT_CONTEXT,
    )
    const completed = await repo.decideExport('e9', 'completed')
    expect(completed?.outcome).toBe('decided')
    expect(completed?.export.status).toBe('completed')
    expect(completed?.export.completedAt).toBe(3000)

    const again = await repo.decideExport('e9', 'rejected', 'late')
    expect(again?.outcome).toBe('refused')
    expect(again?.export.status).toBe('completed')
    expect(await repo.decideExport('missing', 'completed')).toBeNull()
  })

  it('reads a rejected export with its recorded reason', async () => {
    const db = new FakeD1Database(licensedData())
    const repo = repository(db)
    await repo.createExport(
      { id: 'e10', datasetId: 'd1', datasetVersionId: 'v1', format: 'ndjson', recordCount: 10 },
      EXPORT_CONTEXT,
    )
    const rejected = await repo.decideExport('e10', 'rejected', 'not approved')
    expect(rejected?.export.status).toBe('rejected')
    expect(rejected?.export.reason).toBe('not approved')
    expect((await repo.getExport('e10'))?.status).toBe('rejected')
  })
})

describe('tenant assignment enforcement read', () => {
  const assignmentRow = (overrides: Record<string, unknown>): Record<string, unknown> => ({
    id: 'a1',
    dataset_id: 'd1',
    dataset_version_id: 'v1',
    recipient_company_id: 'c1',
    recipient_workspace_id: null,
    mode: 'snapshot',
    status: 'active',
    export_allowed: 1,
    valid_from: null,
    valid_until: null,
    created_at: 1000,
    updated_at: 1000,
    ...overrides,
  })

  it('returns company-wide and workspace-scoped rows of the recipient company only', async () => {
    const db = new FakeD1Database({
      dataset_assignments: [
        assignmentRow({ id: 'a1' }),
        assignmentRow({ id: 'a2', recipient_workspace_id: 'w-other', recipient_company_id: 'c2' }),
        assignmentRow({ id: 'a3', recipient_workspace_id: 'w-a' }),
      ],
    })
    const repo = repository(db)
    expect((await repo.listTenantAssignments('c1')).map((a) => a.id)).toEqual(['a1', 'a3'])
    expect((await repo.listTenantAssignments('c1', 'w-a')).map((a) => a.id)).toEqual(['a1', 'a3'])
    expect((await repo.listTenantAssignments('c2', 'w-a')).map((a) => a.id)).toEqual([])
  })

  it('exposes the assignment-level export flag for enforcement', async () => {
    const db = new FakeD1Database({
      dataset_assignments: [assignmentRow({ export_allowed: 0 })],
    })
    const [assignment] = await repository(db).listTenantAssignments('c1')
    expect(assignment!.exportAllowed).toBe(false)
  })
})

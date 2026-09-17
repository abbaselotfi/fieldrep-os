import { describe, expect, it } from 'vitest'

import type {
  D1DatabaseLike,
  D1PreparedStatementLike,
  D1ResultLike,
  D1RunResultLike,
} from './contracts'
import {
  ControlPlaneDatasetImportRepository,
  type DatasetImportRepository,
} from './dataset-import-repository'

interface FakeD1Data {
  dataset_imports?: Array<Record<string, unknown>>
  dataset_duplicate_candidates?: Array<Record<string, unknown>>
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
    if (this.query.includes('INSERT INTO dataset_imports')) {
      this.data.dataset_imports = [
        ...(this.data.dataset_imports ?? []),
        {
          id: values[0],
          dataset_id: values[1],
          source_file_reference: values[2],
          original_filename: values[3],
          imported_by: values[4],
          imported_at: values[5],
          status: 'received',
          row_count: 0,
          valid_count: 0,
          invalid_count: 0,
          manifest_json: values[6],
        },
      ]
    }
    if (this.query.includes('UPDATE dataset_imports')) {
      const id = values[values.length - 1] as string
      const row = this.data.dataset_imports?.find((r) => r.id === id)
      if (row) {
        if (this.query.includes('row_count')) {
          row.status = values[0]
          row.row_count = values[1]
          row.valid_count = values[2]
          row.invalid_count = values[3]
        } else {
          row.status = values[0]
        }
      }
    }
    if (this.query.includes('INSERT INTO dataset_duplicate_candidates')) {
      this.data.dataset_duplicate_candidates = [
        ...(this.data.dataset_duplicate_candidates ?? []),
        {
          id: values[0],
          dataset_id: values[1],
          import_id: values[2],
          match_key: values[3],
          record_refs_json: values[4],
          status: 'pending',
          decided_by: null,
          decided_at: null,
          created_at: values[5],
          updated_at: values[6],
        },
      ]
    }
    if (this.query.includes('UPDATE dataset_duplicate_candidates')) {
      const id = values[values.length - 1] as string
      const row = this.data.dataset_duplicate_candidates?.find((r) => r.id === id)
      if (row) {
        row.status = values[0]
        row.decided_by = values[1]
        row.decided_at = values[2]
        row.updated_at = values[3]
      }
    }
    return Promise.resolve({ success: true, meta: { changes: 1 } })
  }

  private getRows<T>(): T[] {
    if (this.query.includes('FROM dataset_imports')) {
      let rows = this.data.dataset_imports ?? []
      if (this.query.includes('WHERE dataset_id = ?')) {
        rows = rows.filter((r) => r.dataset_id === this.boundValues[0])
        // Mirrors ORDER BY imported_at DESC, id from the repository query.
        rows = [...rows].sort((a, b) => (b.imported_at as number) - (a.imported_at as number))
      } else if (this.query.includes('WHERE id = ?')) {
        rows = rows.filter((r) => r.id === this.boundValues[0])
      }
      return rows as T[]
    }
    if (this.query.includes('FROM dataset_duplicate_candidates')) {
      let rows = this.data.dataset_duplicate_candidates ?? []
      if (this.query.includes('WHERE dataset_id = ?')) {
        rows = rows.filter((r) => r.dataset_id === this.boundValues[0])
        if (this.query.includes('AND status = ?')) {
          rows = rows.filter((r) => r.status === this.boundValues[1])
        }
      } else if (this.query.includes('WHERE id = ?')) {
        rows = rows.filter((r) => r.id === this.boundValues[0])
      }
      return rows as T[]
    }
    return []
  }
}

function repository(db: FakeD1Database, now: () => number = () => 1700): DatasetImportRepository {
  return new ControlPlaneDatasetImportRepository(db, now)
}

const IMPORT_ROW = {
  id: 'imp1',
  dataset_id: 'd1',
  source_file_reference: 's3://raw/imp1.ndjson',
  original_filename: 'practitioners.csv',
  imported_by: 'platform-admin-1',
  imported_at: 1000,
  status: 'received',
  row_count: 0,
  valid_count: 0,
  invalid_count: 0,
  manifest_json: null,
}

describe('import ledger', () => {
  it('creates a received import with zero counts', async () => {
    const db = new FakeD1Database()
    const repo = repository(db)
    const created = await repo.createImport({
      id: 'imp9',
      datasetId: 'd1',
      originalFilename: 'new.csv',
      sourceFileReference: 's3://raw/imp9.ndjson',
      importedBy: 'platform-admin-1',
    })
    expect(created.status).toBe('received')
    expect(created.rowCount).toBe(0)
    expect((await repo.getImport('imp9'))?.status).toBe('received')
  })

  it('lists imports of a dataset newest-first', async () => {
    const db = new FakeD1Database({
      dataset_imports: [
        { ...IMPORT_ROW, id: 'imp-old', imported_at: 900 },
        { ...IMPORT_ROW, id: 'imp-new', imported_at: 1100 },
      ],
    })
    const imports = await repository(db).listImports('d1')
    expect(imports.map((i) => i.id)).toEqual(['imp-new', 'imp-old'])
  })

  it('completes normalization when counts partition and quality holds', async () => {
    const db = new FakeD1Database({ dataset_imports: [{ ...IMPORT_ROW }] })
    const result = await repository(db).completeNormalization('imp1', {
      rowCount: 100,
      validCount: 95,
      invalidCount: 5,
    })
    expect(result?.outcome).toBe('normalized')
    expect(result?.datasetImport.status).toBe('normalized')
  })

  it('fails the import (ledger outcome, not rejection) below the quality floor', async () => {
    const db = new FakeD1Database({ dataset_imports: [{ ...IMPORT_ROW }] })
    const result = await repository(db).completeNormalization('imp1', {
      rowCount: 100,
      validCount: 30,
      invalidCount: 70,
    })
    expect(result?.outcome).toBe('failed')
    expect(result?.datasetImport.status).toBe('failed')
  })

  it('rejects non-partitioning counts without a write', async () => {
    const db = new FakeD1Database({ dataset_imports: [{ ...IMPORT_ROW }] })
    const repo = repository(db)
    const result = await repo.completeNormalization('imp1', {
      rowCount: 100,
      validCount: 95,
      invalidCount: 10,
    })
    expect(result?.outcome).toBe('rejected')
    expect((await repo.getImport('imp1'))?.status).toBe('received')
  })

  it('refuses normalization of an already normalized (immutable) import', async () => {
    const db = new FakeD1Database({
      dataset_imports: [{ ...IMPORT_ROW, status: 'normalized', row_count: 5, valid_count: 5 }],
    })
    const result = await repository(db).completeNormalization('imp1', {
      rowCount: 5,
      validCount: 5,
      invalidCount: 0,
    })
    expect(result?.outcome).toBe('rejected')
  })

  it('reopens a failed import for retry but never a normalized one', async () => {
    const db = new FakeD1Database({
      dataset_imports: [
        { ...IMPORT_ROW, id: 'imp-f', status: 'failed' },
        { ...IMPORT_ROW, id: 'imp-n', status: 'normalized' },
      ],
    })
    const repo = repository(db)
    const retried = await repo.retryImport('imp-f')
    expect(retried?.outcome).toBe('reopened')
    expect(retried?.datasetImport.status).toBe('received')
    expect((await repo.retryImport('imp-n'))?.outcome).toBe('rejected')
    expect(await repo.retryImport('missing')).toBeNull()
  })
})

describe('duplicate review', () => {
  it('records a pending candidate grouping two records', async () => {
    const db = new FakeD1Database()
    const result = await repository(db).recordCandidate({
      id: 'dup1',
      datasetId: 'd1',
      importId: 'imp1',
      matchKey: 'nid:4567891234',
      recordRefs: ['row-1', 'row-2'],
    })
    expect(result.outcome).toBe('recorded')
    expect(result.candidate.status).toBe('pending')
    expect(await repository(db).listCandidates('d1')).toHaveLength(1)
  })

  it('rejects a candidate with fewer than two distinct records', async () => {
    const db = new FakeD1Database()
    const repo = repository(db)
    const result = await repo.recordCandidate({
      id: 'dup1',
      datasetId: 'd1',
      importId: 'imp1',
      matchKey: 'nid:4567891234',
      recordRefs: ['row-1'],
    })
    expect(result.outcome).toBe('rejected')
    expect(await repo.listCandidates('d1')).toHaveLength(0)
  })

  it('decides a pending candidate terminally', async () => {
    const db = new FakeD1Database()
    const repo = repository(db)
    await repo.recordCandidate({
      id: 'dup1',
      datasetId: 'd1',
      importId: 'imp1',
      matchKey: 'nid:4567891234',
      recordRefs: ['row-1', 'row-2'],
    })
    const decided = await repo.decideCandidate({
      id: 'dup1',
      decision: 'merged',
      decidedBy: 'platform-admin-1',
    })
    expect(decided?.outcome).toBe('decided')
    expect(decided?.candidate.status).toBe('merged')
    expect(decided?.candidate.decidedBy).toBe('platform-admin-1')
    expect(decided?.candidate.decidedAt).toBe(1700)
  })

  it('refuses a second decision on a decided candidate', async () => {
    const db = new FakeD1Database()
    const repo = repository(db)
    await repo.recordCandidate({
      id: 'dup1',
      datasetId: 'd1',
      importId: 'imp1',
      matchKey: 'nid:4567891234',
      recordRefs: ['row-1', 'row-2'],
    })
    await repo.decideCandidate({ id: 'dup1', decision: 'merged', decidedBy: 'pa1' })
    const again = await repo.decideCandidate({
      id: 'dup1',
      decision: 'kept_both',
      decidedBy: 'pa2',
    })
    expect(again?.outcome).toBe('rejected')
    expect(again?.candidate.status).toBe('merged')
  })

  it('returns null for an unknown candidate', async () => {
    expect(
      await repository(new FakeD1Database()).decideCandidate({
        id: 'nope',
        decision: 'merged',
        decidedBy: 'pa1',
      }),
    ).toBeNull()
  })
})
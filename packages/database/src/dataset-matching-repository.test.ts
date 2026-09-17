import { describe, expect, it } from 'vitest'

import type {
  D1DatabaseLike,
  D1PreparedStatementLike,
  D1ResultLike,
  D1RunResultLike,
} from './contracts'
import {
  ControlPlaneDatasetMatchingRepository,
  type DatasetMatchingRepository,
} from './dataset-matching-repository'

interface FakeD1Data {
  practitioner_source_records?: Array<Record<string, unknown>>
  dataset_builds?: Array<Record<string, unknown>>
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
    if (this.query.includes('INSERT INTO practitioner_source_records')) {
      this.data.practitioner_source_records = [
        ...(this.data.practitioner_source_records ?? []),
        {
          id: values[0],
          dataset_id: values[1],
          dataset_version_id: values[2],
          source_record_ref: values[3],
          match_key: values[4],
          full_name: values[5],
          national_id: values[6],
          phone: values[7],
          license_id: values[8],
          match_status: values[9],
          practitioner_id: values[10],
          decided_by: null,
          decided_at: null,
          created_at: values[11],
          updated_at: values[12],
        },
      ]
    }
    if (this.query.includes('UPDATE practitioner_source_records')) {
      const id = values[values.length - 1] as string
      const row = this.data.practitioner_source_records?.find((r) => r.id === id)
      if (row) {
        row.match_status = values[0]
        row.practitioner_id = values[1]
        row.decided_by = values[2]
        row.decided_at = values[3]
        row.updated_at = values[4]
      }
    }
    if (this.query.includes('INSERT INTO dataset_builds')) {
      this.data.dataset_builds = [
        ...(this.data.dataset_builds ?? []),
        {
          id: values[0],
          source_dataset_id: values[1],
          source_version_id: values[2],
          target_dataset_id: values[3],
          target_version_id: values[4],
          definition_json: values[5],
          record_count: values[6],
          created_by: values[7],
          created_at: values[8],
        },
      ]
    }
    return Promise.resolve({ success: true, meta: { changes: 1 } })
  }

  private getRows<T>(): T[] {
    if (this.query.includes('FROM practitioner_source_records')) {
      let rows = this.data.practitioner_source_records ?? []
      if (this.query.includes('WHERE dataset_version_id = ?')) {
        rows = rows.filter((r) => r.dataset_version_id === this.boundValues[0])
        if (this.query.includes('AND match_status = ?')) {
          rows = rows.filter((r) => r.match_status === this.boundValues[1])
        }
        // Mirrors ORDER BY source_record_ref.
        rows = [...rows].sort((a, b) =>
          String(a.source_record_ref).localeCompare(String(b.source_record_ref)),
        )
      } else if (this.query.includes('WHERE id = ?')) {
        rows = rows.filter((r) => r.id === this.boundValues[0])
      }
      return rows as T[]
    }
    if (this.query.includes('FROM dataset_builds')) {
      let rows = this.data.dataset_builds ?? []
      if (this.query.includes('WHERE source_version_id = ?')) {
        rows = rows.filter((r) => r.source_version_id === this.boundValues[0])
        rows = [...rows].sort((a, b) => (a.created_at as number) - (b.created_at as number))
      }
      return rows as T[]
    }
    return []
  }
}

function repository(db: FakeD1Database, now: () => number = () => 2000): DatasetMatchingRepository {
  return new ControlPlaneDatasetMatchingRepository(db, now)
}

const RECORD_ROW = {
  id: 'rec1',
  dataset_id: 'd1',
  dataset_version_id: 'v1',
  source_record_ref: 'row-1',
  match_key: 'nid:4567891234',
  full_name: 'علی رضایی',
  national_id: '4567891234',
  phone: '09123456789',
  license_id: null,
  match_status: 'candidate',
  practitioner_id: null,
  decided_by: null,
  decided_at: null,
  created_at: 1000,
  updated_at: 1000,
}

const PUBLISHED_VERSION = { status: 'published' as const, recordCount: 10 }

describe('practitioner source records', () => {
  it('registers a record as unmatched by default', async () => {
    const db = new FakeD1Database()
    const repo = repository(db)
    const registered = await repo.registerRecord({
      id: 'rec9',
      datasetId: 'd1',
      datasetVersionId: 'v1',
      sourceRecordRef: 'row-9',
      matchKey: 'tel:9123456789',
      fullName: 'مریم کاظمی',
    })
    expect(registered.matchStatus).toBe('unmatched')
    expect(registered.practitionerId).toBeNull()
    expect((await repo.getRecord('rec9'))?.matchStatus).toBe('unmatched')
  })

  it('lists records of a version filtered by status, ordered by ref', async () => {
    const db = new FakeD1Database({
      practitioner_source_records: [
        { ...RECORD_ROW, id: 'rec-b', source_record_ref: 'row-2' },
        { ...RECORD_ROW, id: 'rec-a', source_record_ref: 'row-1' },
        { ...RECORD_ROW, id: 'rec-c', source_record_ref: 'row-3', match_status: 'unmatched' },
      ],
    })
    const repo = repository(db)
    const candidates = await repo.listRecords('v1', 'candidate')
    expect(candidates.map((r) => r.sourceRecordRef)).toEqual(['row-1', 'row-2'])
    expect((await repo.listRecords('v1')).length).toBe(3)
  })

  it('links a candidate record to the canonical registry with review evidence', async () => {
    const db = new FakeD1Database({ practitioner_source_records: [{ ...RECORD_ROW }] })
    const result = await repository(db).linkMatch({
      id: 'rec1',
      practitionerId: 'pract-7',
      decidedBy: 'platform-admin-1',
    })
    expect(result?.outcome).toBe('linked')
    expect(result?.record.matchStatus).toBe('matched')
    expect(result?.record.practitionerId).toBe('pract-7')
    expect(result?.record.decidedBy).toBe('platform-admin-1')
    expect(result?.record.decidedAt).toBe(2000)
  })

  it('refuses to link without a practitioner id and never writes', async () => {
    const db = new FakeD1Database({
      practitioner_source_records: [{ ...RECORD_ROW, match_status: 'unmatched' }],
    })
    const repo = repository(db)
    const result = await repo.linkMatch({ id: 'rec1', practitionerId: '', decidedBy: 'pa1' })
    expect(result?.outcome).toBe('rejected')
    expect((await repo.getRecord('rec1'))?.matchStatus).toBe('unmatched')
  })

  it('refuses a second review decision on a decided record', async () => {
    const db = new FakeD1Database({
      practitioner_source_records: [
        { ...RECORD_ROW, match_status: 'matched', practitioner_id: 'pract-7' },
      ],
    })
    const result = await repository(db).confirmUnmatched('rec1', 'pa2')
    expect(result?.outcome).toBe('rejected')
    expect(result?.record.matchStatus).toBe('matched')
  })

  it('confirms unmatched terminally without a practitioner link', async () => {
    const db = new FakeD1Database({ practitioner_source_records: [{ ...RECORD_ROW }] })
    const result = await repository(db).confirmUnmatched('rec1', 'platform-admin-1')
    expect(result?.outcome).toBe('linked')
    expect(result?.record.matchStatus).toBe('confirmed_unmatched')
    expect(result?.record.practitionerId).toBeNull()
  })

  it('returns null for an unknown record', async () => {
    expect(await repository(new FakeD1Database()).linkMatch({
      id: 'nope',
      practitionerId: 'p1',
      decidedBy: 'pa1',
    })).toBeNull()
  })
})

describe('dataset builds', () => {
  const buildInput = {
    id: 'b1',
    sourceDatasetId: 'd1',
    sourceVersionId: 'v1',
    targetDatasetId: 'd2',
    targetVersionId: 'v2',
    definition: { specialtyIds: ['cardiology'] },
    recordCount: 120,
    createdBy: 'platform-admin-1',
  }

  it('creates build lineage from a published source version', async () => {
    const db = new FakeD1Database()
    const repo = repository(db)
    const result = await repo.createBuild(buildInput, PUBLISHED_VERSION)
    expect(result.outcome).toBe('created')
    expect(result.build.recordCount).toBe(120)
    expect((await repo.listBuilds('v1'))[0]!.targetVersionId).toBe('v2')
  })

  it('refuses a build from a draft source without a write', async () => {
    const db = new FakeD1Database()
    const repo = repository(db)
    const draft = await repo.createBuild(buildInput, { status: 'draft', recordCount: 10 })
    expect(draft.outcome).toBe('rejected')
    expect(await repo.listBuilds('v1')).toHaveLength(0)
  })

  it('refuses an empty produced target', async () => {
    const db = new FakeD1Database()
    const repo = repository(db)
    const result = await repo.createBuild(
      { ...buildInput, recordCount: 0 },
      PUBLISHED_VERSION,
    )
    expect(result.outcome).toBe('rejected')
    expect(await repo.listBuilds('v1')).toHaveLength(0)
  })

  it('refuses a definition that selects nothing', async () => {
    const db = new FakeD1Database()
    const result = await repository(db).createBuild(
      { ...buildInput, definition: {} },
      PUBLISHED_VERSION,
    )
    expect(result.outcome).toBe('rejected')
  })

  it('lists builds oldest-first', async () => {
    const db = new FakeD1Database()
    const repo = repository(db)
    await repo.createBuild({ ...buildInput, id: 'b-old', targetVersionId: 'v-old' }, PUBLISHED_VERSION)
    await repo.createBuild(
      { ...buildInput, id: 'b-new', targetVersionId: 'v-new', createdBy: 'pa2' },
      { ...PUBLISHED_VERSION, recordCount: 10 },
    )
    const builds = await repository(db).listBuilds('v1')
    expect(builds.map((b) => b.id)).toEqual(['b-old', 'b-new'])
  })
})
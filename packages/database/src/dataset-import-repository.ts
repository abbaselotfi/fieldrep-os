import type {
  CreateDatasetImportInput,
  DatasetImport,
  DatasetImportStatus,
  DecideDuplicateCandidateInput,
  DuplicateReviewCandidate,
  DuplicateReviewStatus,
  ImportQualityPolicy,
  NormalizationCounts,
  RecordDuplicateCandidateInput,
} from '@fieldrep/domain'
import {
  evaluateImportQuality,
  isRecordableCandidate,
  normalizeImportQualityPolicy,
  validateCandidateStatusChange,
  validateNormalizationCounts,
} from '@fieldrep/domain'

import type { D1DatabaseLike } from './contracts'

/**
 * Dataset import & duplicate-review repository (P11-A2).
 *
 * Control-plane access over the migration-0005 `dataset_imports` ledger and
 * the migration-0006 `dataset_duplicate_candidates` review table. Domain
 * guards are re-validated before every write: a normalized import is never
 * mutated (it is the provenance of a version), a failed import may only be
 * explicitly reopened, and a decided duplicate candidate is immutable.
 */

export interface GuardedImportResult {
  datasetImport: DatasetImport
  outcome: 'normalized' | 'failed' | 'reopened' | 'rejected'
}

export interface GuardedCandidateResult {
  candidate: DuplicateReviewCandidate
  outcome: 'recorded' | 'decided' | 'rejected'
}

export interface DatasetImportRepository {
  listImports(datasetId: string): Promise<readonly DatasetImport[]>
  getImport(id: string): Promise<DatasetImport | null>
  createImport(input: CreateDatasetImportInput): Promise<DatasetImport>
  /**
   * Completes normalization for a `received` import. Counts are validated
   * against the partition invariant and the quality policy decides the
   * resulting status (`normalized` vs `failed`) — both are legitimate ledger
   * outcomes; only guard violations are rejected without a write.
   */
  completeNormalization(
    id: string,
    counts: NormalizationCounts,
    policy?: Partial<ImportQualityPolicy> | undefined,
  ): Promise<GuardedImportResult | null>
  /** Reopens a failed import as `received` for another normalization pass. */
  retryImport(id: string): Promise<GuardedImportResult | null>
  listCandidates(
    datasetId: string,
    status?: DuplicateReviewStatus | undefined,
  ): Promise<readonly DuplicateReviewCandidate[]>
  recordCandidate(input: RecordDuplicateCandidateInput): Promise<GuardedCandidateResult>
  decideCandidate(input: DecideDuplicateCandidateInput): Promise<GuardedCandidateResult | null>
}

interface ImportRow {
  id: string
  dataset_id: string
  source_file_reference: string | null
  original_filename: string
  imported_by: string | null
  imported_at: number
  status: string
  row_count: number
  valid_count: number
  invalid_count: number
  manifest_json: string | null
}

interface CandidateRow {
  id: string
  dataset_id: string
  import_id: string
  match_key: string
  record_refs_json: string
  status: string
  decided_by: string | null
  decided_at: number | null
  created_at: number
  updated_at: number
}

const IMPORT_COLUMNS =
  'id, dataset_id, source_file_reference, original_filename, imported_by, imported_at, status, row_count, valid_count, invalid_count, manifest_json'
const CANDIDATE_COLUMNS =
  'id, dataset_id, import_id, match_key, record_refs_json, status, decided_by, decided_at, created_at, updated_at'

export class ControlPlaneDatasetImportRepository implements DatasetImportRepository {
  constructor(
    private readonly db: D1DatabaseLike,
    private readonly now: () => number = Date.now,
  ) {}

  async listImports(datasetId: string): Promise<readonly DatasetImport[]> {
    const rows = await this.db
      .prepare(
        `SELECT ${IMPORT_COLUMNS} FROM dataset_imports
         WHERE dataset_id = ?
         ORDER BY imported_at DESC, id`,
      )
      .bind(datasetId)
      .all<ImportRow>()
    return rows.results.map(toImport)
  }

  async getImport(id: string): Promise<DatasetImport | null> {
    const row = await this.db
      .prepare(`SELECT ${IMPORT_COLUMNS} FROM dataset_imports WHERE id = ? LIMIT 1`)
      .bind(id)
      .first<ImportRow>()
    return row === null ? null : toImport(row)
  }

  async createImport(input: CreateDatasetImportInput): Promise<DatasetImport> {
    const importedAt = this.now()
    await this.db
      .prepare(
        `INSERT INTO dataset_imports
           (id, dataset_id, source_file_reference, original_filename, imported_by, imported_at, status, row_count, valid_count, invalid_count, manifest_json)
         VALUES (?, ?, ?, ?, ?, ?, 'received', 0, 0, 0, ?)`,
      )
      .bind(
        input.id,
        input.datasetId,
        input.sourceFileReference ?? null,
        input.originalFilename,
        input.importedBy ?? null,
        importedAt,
        input.manifest === undefined ? null : JSON.stringify(input.manifest),
      )
      .run?.()
    return {
      id: input.id,
      datasetId: input.datasetId,
      sourceFileReference: input.sourceFileReference ?? null,
      originalFilename: input.originalFilename,
      importedBy: input.importedBy ?? null,
      importedAt,
      status: 'received',
      rowCount: 0,
      validCount: 0,
      invalidCount: 0,
      manifest: input.manifest ?? null,
    }
  }

  async completeNormalization(
    id: string,
    counts: NormalizationCounts,
    policy?: Partial<ImportQualityPolicy> | undefined,
  ): Promise<GuardedImportResult | null> {
    const existing = await this.getImport(id)
    if (existing === null) return null
    // Only a freshly received import may complete normalization — a normalized
    // import is immutable provenance for a version and must never be re-written.
    if (existing.status !== 'received') {
      return { datasetImport: existing, outcome: 'rejected' }
    }
    if (validateNormalizationCounts(counts) !== 'ok') {
      return { datasetImport: existing, outcome: 'rejected' }
    }
    const { outcome } = evaluateImportQuality(counts, normalizeImportQualityPolicy(policy))
    const status: DatasetImportStatus = outcome === 'normalized' ? 'normalized' : 'failed'
    await this.db
      .prepare(
        'UPDATE dataset_imports SET status = ?, row_count = ?, valid_count = ?, invalid_count = ? WHERE id = ?',
      )
      .bind(status, counts.rowCount, counts.validCount, counts.invalidCount, id)
      .run?.()
    return { datasetImport: { ...existing, status, ...counts }, outcome }
  }

  async retryImport(id: string): Promise<GuardedImportResult | null> {
    const existing = await this.getImport(id)
    if (existing === null) return null
    // Retry is the explicit reopening of a failed import; a received import has
    // nothing to retry and a normalized one must never be reopened.
    if (existing.status !== 'failed') {
      return { datasetImport: existing, outcome: 'rejected' }
    }
    await this.db
      .prepare('UPDATE dataset_imports SET status = ? WHERE id = ?')
      .bind('received', id)
      .run?.()
    return { datasetImport: { ...existing, status: 'received' }, outcome: 'reopened' }
  }

  async listCandidates(
    datasetId: string,
    status?: DuplicateReviewStatus | undefined,
  ): Promise<readonly DuplicateReviewCandidate[]> {
    const query =
      status === undefined
        ? `SELECT ${CANDIDATE_COLUMNS} FROM dataset_duplicate_candidates
           WHERE dataset_id = ?
           ORDER BY match_key, id`
        : `SELECT ${CANDIDATE_COLUMNS} FROM dataset_duplicate_candidates
           WHERE dataset_id = ? AND status = ?
           ORDER BY match_key, id`
    const binds = status === undefined ? [datasetId] : [datasetId, status]
    const rows = await this.db.prepare(query).bind(...binds).all<CandidateRow>()
    return rows.results.map(toCandidate)
  }

  async recordCandidate(
    input: RecordDuplicateCandidateInput,
  ): Promise<GuardedCandidateResult> {
    const now = this.now()
    const rejected: DuplicateReviewCandidate = {
      id: input.id,
      datasetId: input.datasetId,
      importId: input.importId,
      matchKey: input.matchKey,
      recordRefs: [...input.recordRefs],
      status: 'pending',
      decidedBy: null,
      decidedAt: null,
      createdAt: now,
      updatedAt: now,
    }
    if (isRecordableCandidate(input) !== 'ok') {
      return { candidate: rejected, outcome: 'rejected' }
    }
    await this.db
      .prepare(
        `INSERT INTO dataset_duplicate_candidates
           (id, dataset_id, import_id, match_key, record_refs_json, status, decided_by, decided_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, ?)`,
      )
      .bind(input.id, input.datasetId, input.importId, input.matchKey, JSON.stringify(input.recordRefs), now, now)
      .run?.()
    return { candidate: rejected, outcome: 'recorded' }
  }

  async decideCandidate(
    input: DecideDuplicateCandidateInput,
  ): Promise<GuardedCandidateResult | null> {
    const candidate = await this.getCandidate(input.id)
    if (candidate === null) return null
    if (validateCandidateStatusChange(candidate.status, input.decision) !== 'ok') {
      return { candidate, outcome: 'rejected' }
    }
    const decidedAt = this.now()
    await this.db
      .prepare(
        'UPDATE dataset_duplicate_candidates SET status = ?, decided_by = ?, decided_at = ?, updated_at = ? WHERE id = ?',
      )
      .bind(input.decision, input.decidedBy, decidedAt, decidedAt, input.id)
      .run?.()
    return {
      candidate: {
        ...candidate,
        status: input.decision,
        decidedBy: input.decidedBy,
        decidedAt,
        updatedAt: decidedAt,
      },
      outcome: 'decided',
    }
  }

  private async getCandidate(id: string): Promise<DuplicateReviewCandidate | null> {
    const row = await this.db
      .prepare(`SELECT ${CANDIDATE_COLUMNS} FROM dataset_duplicate_candidates WHERE id = ? LIMIT 1`)
      .bind(id)
      .first<CandidateRow>()
    return row === null ? null : toCandidate(row)
  }
}

function toImport(row: ImportRow): DatasetImport {
  return {
    id: row.id,
    datasetId: row.dataset_id,
    sourceFileReference: row.source_file_reference,
    originalFilename: row.original_filename,
    importedBy: row.imported_by,
    importedAt: row.imported_at,
    status: row.status as DatasetImportStatus,
    rowCount: row.row_count,
    validCount: row.valid_count,
    invalidCount: row.invalid_count,
    manifest: row.manifest_json === null ? null : (JSON.parse(row.manifest_json) as Record<string, unknown>),
  }
}

function toCandidate(row: CandidateRow): DuplicateReviewCandidate {
  return {
    id: row.id,
    datasetId: row.dataset_id,
    importId: row.import_id,
    matchKey: row.match_key,
    recordRefs: JSON.parse(row.record_refs_json) as string[],
    status: row.status as DuplicateReviewStatus,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
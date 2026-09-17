import type {
  CreateDatasetBuildInput,
  DatasetBuild,
  DatasetVersion,
  LinkMatchInput,
  PractitionerMatchStatus,
  PractitionerSourceRecord,
  RegisterSourceRecordInput,
} from '@fieldrep/domain'
import {
  isRecordableBuildDefinition,
  validateBuildReadiness,
  validateMatchStatusChange,
} from '@fieldrep/domain'

import type { D1DatabaseLike } from './contracts'

/**
 * Practitioner matching & dataset build repository (P11-A3).
 *
 * Control-plane access over the migration-0007 `practitioner_source_records`
 * and `dataset_builds` tables. Match transitions are domain-guarded before
 * every write: a review decision (`matched` / `confirmed_unmatched`) is
 * terminal, and a build can only derive from a published source version.
 */

export interface GuardedMatchResult {
  record: PractitionerSourceRecord
  outcome: 'registered' | 'linked' | 'rejected'
}

export interface GuardedBuildResult {
  build: DatasetBuild
  outcome: 'created' | 'rejected'
}

export interface DatasetMatchingRepository {
  listRecords(
    versionId: string,
    status?: PractitionerMatchStatus | undefined,
  ): Promise<readonly PractitionerSourceRecord[]>
  getRecord(id: string): Promise<PractitionerSourceRecord | null>
  registerRecord(input: RegisterSourceRecordInput): Promise<PractitionerSourceRecord>
  /** Explicit review decision: links a record to the canonical registry. */
  linkMatch(input: LinkMatchInput): Promise<GuardedMatchResult | null>
  /** Explicit review decision: keeps the record unlinked, terminally. */
  confirmUnmatched(id: string, decidedBy: string): Promise<GuardedMatchResult | null>
  listBuilds(sourceVersionId: string): Promise<readonly DatasetBuild[]>
  /**
   * Creates the build lineage. The caller resolves the source version (via
   * the catalog repository) and passes it in; readiness is re-validated here
   * so a draft/superseded/empty source can never anchor a build.
   */
  createBuild(
    input: CreateDatasetBuildInput,
    sourceVersion: Pick<DatasetVersion, 'status' | 'recordCount'>,
  ): Promise<GuardedBuildResult>
}

interface RecordRow {
  id: string
  dataset_id: string
  dataset_version_id: string
  source_record_ref: string
  match_key: string | null
  full_name: string | null
  national_id: string | null
  phone: string | null
  license_id: string | null
  match_status: string
  practitioner_id: string | null
  decided_by: string | null
  decided_at: number | null
  created_at: number
  updated_at: number
}

interface BuildRow {
  id: string
  source_dataset_id: string
  source_version_id: string
  target_dataset_id: string
  target_version_id: string
  definition_json: string
  record_count: number
  created_by: string | null
  created_at: number
}

const RECORD_COLUMNS =
  'id, dataset_id, dataset_version_id, source_record_ref, match_key, full_name, national_id, phone, license_id, match_status, practitioner_id, decided_by, decided_at, created_at, updated_at'
const BUILD_COLUMNS =
  'id, source_dataset_id, source_version_id, target_dataset_id, target_version_id, definition_json, record_count, created_by, created_at'

export class ControlPlaneDatasetMatchingRepository implements DatasetMatchingRepository {
  constructor(
    private readonly db: D1DatabaseLike,
    private readonly now: () => number = Date.now,
  ) {}

  async listRecords(
    versionId: string,
    status?: PractitionerMatchStatus | undefined,
  ): Promise<readonly PractitionerSourceRecord[]> {
    const query =
      status === undefined
        ? `SELECT ${RECORD_COLUMNS} FROM practitioner_source_records
           WHERE dataset_version_id = ?
           ORDER BY source_record_ref`
        : `SELECT ${RECORD_COLUMNS} FROM practitioner_source_records
           WHERE dataset_version_id = ? AND match_status = ?
           ORDER BY source_record_ref`
    const binds = status === undefined ? [versionId] : [versionId, status]
    const rows = await this.db.prepare(query).bind(...binds).all<RecordRow>()
    return rows.results.map(toRecord)
  }

  async getRecord(id: string): Promise<PractitionerSourceRecord | null> {
    const row = await this.db
      .prepare(`SELECT ${RECORD_COLUMNS} FROM practitioner_source_records WHERE id = ? LIMIT 1`)
      .bind(id)
      .first<RecordRow>()
    return row === null ? null : toRecord(row)
  }

  async registerRecord(input: RegisterSourceRecordInput): Promise<PractitionerSourceRecord> {
    const now = this.now()
    // Default state is unmatched; only an exact-policy engine may seed a
    // different state, and a seeded `matched` still requires a practitioner.
    const status = input.matchStatus ?? 'unmatched'
    const record: PractitionerSourceRecord = {
      id: input.id,
      datasetId: input.datasetId,
      datasetVersionId: input.datasetVersionId,
      sourceRecordRef: input.sourceRecordRef,
      matchKey: input.matchKey ?? null,
      fullName: input.fullName ?? null,
      nationalId: input.nationalId ?? null,
      phone: input.phone ?? null,
      licenseId: input.licenseId ?? null,
      matchStatus: status,
      practitionerId: input.practitionerId ?? null,
      decidedBy: null,
      decidedAt: null,
      createdAt: now,
      updatedAt: now,
    }
    await this.db
      .prepare(
        `INSERT INTO practitioner_source_records
           (id, dataset_id, dataset_version_id, source_record_ref, match_key, full_name, national_id, phone, license_id, match_status, practitioner_id, decided_by, decided_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
      )
      .bind(
        record.id,
        record.datasetId,
        record.datasetVersionId,
        record.sourceRecordRef,
        record.matchKey,
        record.fullName,
        record.nationalId,
        record.phone,
        record.licenseId,
        record.matchStatus,
        record.practitionerId,
        now,
        now,
      )
      .run?.()
    return record
  }

  async linkMatch(input: LinkMatchInput): Promise<GuardedMatchResult | null> {
    return this.decide(input.id, 'matched', input.practitionerId, input.decidedBy, 'linked')
  }

  async confirmUnmatched(id: string, decidedBy: string): Promise<GuardedMatchResult | null> {
    return this.decide(id, 'confirmed_unmatched', null, decidedBy, 'linked')
  }

  private async decide(
    id: string,
    next: PractitionerMatchStatus,
    practitionerId: string | null,
    decidedBy: string,
    outcome: GuardedMatchResult['outcome'],
  ): Promise<GuardedMatchResult | null> {
    const existing = await this.getRecord(id)
    if (existing === null) return null
    // An empty/absent link target falls back to the existing link; a `matched`
    // decision still requires a non-empty canonical practitioner id.
    const supplied = practitionerId !== null && practitionerId !== '' ? practitionerId : null
    const effectivePractitionerId = supplied ?? existing.practitionerId
    if (
      validateMatchStatusChange(existing.matchStatus, next) !== 'ok' ||
      (next === 'matched' && effectivePractitionerId === null)
    ) {
      return { record: existing, outcome: 'rejected' }
    }
    const decidedAt = this.now()
    await this.db
      .prepare(
        'UPDATE practitioner_source_records SET match_status = ?, practitioner_id = ?, decided_by = ?, decided_at = ?, updated_at = ? WHERE id = ?',
      )
      .bind(next, effectivePractitionerId, decidedBy, decidedAt, decidedAt, id)
      .run?.()
    return {
      record: {
        ...existing,
        matchStatus: next,
        practitionerId: effectivePractitionerId,
        decidedBy,
        decidedAt,
        updatedAt: decidedAt,
      },
      outcome,
    }
  }

  async listBuilds(sourceVersionId: string): Promise<readonly DatasetBuild[]> {
    const rows = await this.db
      .prepare(
        `SELECT ${BUILD_COLUMNS} FROM dataset_builds
         WHERE source_version_id = ?
         ORDER BY created_at, id`,
      )
      .bind(sourceVersionId)
      .all<BuildRow>()
    return rows.results.map(toBuild)
  }

  async createBuild(
    input: CreateDatasetBuildInput,
    sourceVersion: Pick<DatasetVersion, 'status' | 'recordCount'>,
  ): Promise<GuardedBuildResult> {
    const now = this.now()
    const build: DatasetBuild = {
      id: input.id,
      sourceDatasetId: input.sourceDatasetId,
      sourceVersionId: input.sourceVersionId,
      targetDatasetId: input.targetDatasetId,
      targetVersionId: input.targetVersionId,
      definition: input.definition,
      recordCount: input.recordCount,
      createdBy: input.createdBy ?? null,
      createdAt: now,
    }
    // Fail-closed: readiness guards AND the produced record count must both
    // hold; an empty target must never enter the lineage ledger.
    if (
      validateBuildReadiness(sourceVersion, input.definition) !== 'ok' ||
      input.recordCount <= 0 ||
      !isRecordableBuildDefinition(input.definition)
    ) {
      return { build, outcome: 'rejected' }
    }
    await this.db
      .prepare(
        `INSERT INTO dataset_builds
           (id, source_dataset_id, source_version_id, target_dataset_id, target_version_id, definition_json, record_count, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.id,
        input.sourceDatasetId,
        input.sourceVersionId,
        input.targetDatasetId,
        input.targetVersionId,
        JSON.stringify(input.definition),
        input.recordCount,
        input.createdBy ?? null,
        now,
      )
      .run?.()
    return { build, outcome: 'created' }
  }
}

function toBuild(row: BuildRow): DatasetBuild {
  return {
    id: row.id,
    sourceDatasetId: row.source_dataset_id,
    sourceVersionId: row.source_version_id,
    targetDatasetId: row.target_dataset_id,
    targetVersionId: row.target_version_id,
    definition: JSON.parse(row.definition_json) as DatasetBuild['definition'],
    recordCount: row.record_count,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

function toRecord(row: RecordRow): PractitionerSourceRecord {
  return {
    id: row.id,
    datasetId: row.dataset_id,
    datasetVersionId: row.dataset_version_id,
    sourceRecordRef: row.source_record_ref,
    matchKey: row.match_key,
    fullName: row.full_name,
    nationalId: row.national_id,
    phone: row.phone,
    licenseId: row.license_id,
    matchStatus: row.match_status as PractitionerMatchStatus,
    practitionerId: row.practitioner_id,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
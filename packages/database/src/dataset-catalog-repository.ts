import type {
  CreateDatasetAssignmentInput,
  CreateDatasetInput,
  Dataset,
  DatasetAssignment,
  DatasetAssignmentStatus,
  DatasetSourceType,
  DatasetStatus,
  DatasetType,
  DatasetVersion,
  DatasetVersionStatus,
} from '@fieldrep/domain'
import {
  isDatasetStatus,
  isDatasetType,
  resolveAssignmentState,
  validateAssignmentMode,
  validateAssignmentWindow,
  validateDatasetVersionStatusChange,
  validatePublicationReadiness,
} from '@fieldrep/domain'

import type { D1DatabaseLike } from './contracts'

/**
 * Dataset catalog repository (P11-A1).
 *
 * Control-plane access over the migration-0005 dataset tables. Domain guards
 * are re-validated before every write: publication refuses non-draft or empty
 * versions, assignment creation refuses inverted windows and incoherent
 * mode/version pairs, and revocation is terminal.
 */

export interface CreateVersionInput {
  id: string
  datasetId: string
  versionLabel: string
  recordCount: number
  createdBy?: string | undefined
  sourceImportId?: string | undefined
}

export interface GuardedVersionResult {
  version: DatasetVersion
  outcome: 'published' | 'rejected'
}

export interface GuardedAssignmentResult {
  assignment: DatasetAssignment
  outcome: 'created' | 'revoked' | 'rejected'
}

export interface DatasetCatalogRepository {
  listDatasets(): Promise<readonly Dataset[]>
  getDataset(id: string): Promise<Dataset | null>
  createDataset(input: CreateDatasetInput): Promise<Dataset>
  listVersions(datasetId: string): Promise<readonly DatasetVersion[]>
  getVersion(versionId: string): Promise<DatasetVersion | null>
  createVersion(input: CreateVersionInput): Promise<DatasetVersion>
  publishVersion(versionId: string): Promise<GuardedVersionResult | null>
  listAssignments(datasetId: string): Promise<readonly DatasetAssignment[]>
  getAssignment(id: string): Promise<DatasetAssignment | null>
  createAssignment(input: CreateDatasetAssignmentInput): Promise<GuardedAssignmentResult>
  revokeAssignment(id: string): Promise<GuardedAssignmentResult | null>
  /** Effective (fail-closed) state of one assignment at a point in time. */
  resolveState(id: string, atMs: number): Promise<'active' | 'inactive' | null>
}

interface DatasetRow {
  id: string
  owner_type: string
  owner_id: string | null
  name: string
  dataset_type: string
  status: string
  source_type: string
  created_at: number
  updated_at: number
}

interface VersionRow {
  id: string
  dataset_id: string
  version_label: string
  status: string
  record_count: number
  created_by: string | null
  source_import_id: string | null
  created_at: number
  published_at: number | null
}

interface AssignmentRow {
  id: string
  dataset_id: string
  dataset_version_id: string | null
  recipient_company_id: string
  recipient_workspace_id: string | null
  mode: string
  status: string
  valid_from: number | null
  valid_until: number | null
  created_at: number
  updated_at: number
}

const DATASET_COLUMNS = 'id, owner_type, owner_id, name, dataset_type, status, source_type, created_at, updated_at'
const VERSION_COLUMNS =
  'id, dataset_id, version_label, status, record_count, created_by, source_import_id, created_at, published_at'
const ASSIGNMENT_COLUMNS =
  'id, dataset_id, dataset_version_id, recipient_company_id, recipient_workspace_id, mode, status, valid_from, valid_until, created_at, updated_at'

export class ControlPlaneDatasetCatalogRepository implements DatasetCatalogRepository {
  constructor(
    private readonly db: D1DatabaseLike,
    private readonly now: () => number = Date.now,
  ) {}

  async listDatasets(): Promise<readonly Dataset[]> {
    const rows = await this.db
      .prepare(`SELECT ${DATASET_COLUMNS} FROM datasets ORDER BY name, id`)
      .bind()
      .all<DatasetRow>()
    return rows.results.map(toDataset)
  }

  async getDataset(id: string): Promise<Dataset | null> {
    const row = await this.db
      .prepare(`SELECT ${DATASET_COLUMNS} FROM datasets WHERE id = ? LIMIT 1`)
      .bind(id)
      .first<DatasetRow>()
    return row ? toDataset(row) : null
  }

  async createDataset(input: CreateDatasetInput): Promise<Dataset> {
    const now = this.now()
    const ownerType = input.ownerType ?? 'platform'
    const stmt = this.db.prepare(
      `INSERT INTO datasets
         (id, owner_type, owner_id, name, dataset_type, status, source_type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
    )
    await stmt
      .bind(
        input.id,
        ownerType,
        input.ownerId ?? null,
        input.name,
        input.datasetType,
        input.sourceType,
        now,
        now,
      )
      .run?.()
    return {
      id: input.id,
      ownerType,
      ownerId: input.ownerId ?? null,
      name: input.name,
      datasetType: input.datasetType,
      status: 'draft',
      sourceType: input.sourceType,
      createdAt: now,
      updatedAt: now,
    }
  }

  async listVersions(datasetId: string): Promise<readonly DatasetVersion[]> {
    const rows = await this.db
      .prepare(
        `SELECT ${VERSION_COLUMNS} FROM dataset_versions
         WHERE dataset_id = ?
         ORDER BY created_at DESC, id`,
      )
      .bind(datasetId)
      .all<VersionRow>()
    return rows.results.map(toVersion)
  }

  async getVersion(versionId: string): Promise<DatasetVersion | null> {
    const row = await this.db
      .prepare(`SELECT ${VERSION_COLUMNS} FROM dataset_versions WHERE id = ? LIMIT 1`)
      .bind(versionId)
      .first<VersionRow>()
    return row ? toVersion(row) : null
  }

  async createVersion(input: CreateVersionInput): Promise<DatasetVersion> {
    const now = this.now()
    const stmt = this.db.prepare(
      `INSERT INTO dataset_versions
         (id, dataset_id, version_label, status, record_count, created_by, source_import_id, created_at, published_at)
       VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, NULL)`,
    )
    await stmt
      .bind(
        input.id,
        input.datasetId,
        input.versionLabel,
        input.recordCount,
        input.createdBy ?? null,
        input.sourceImportId ?? null,
        now,
      )
      .run?.()
    return {
      id: input.id,
      datasetId: input.datasetId,
      versionLabel: input.versionLabel,
      status: 'draft',
      recordCount: input.recordCount,
      createdBy: input.createdBy ?? null,
      sourceImportId: input.sourceImportId ?? null,
      createdAt: now,
      publishedAt: null,
    }
  }

  async publishVersion(versionId: string): Promise<GuardedVersionResult | null> {
    const version = await this.getVersion(versionId)
    if (version === null) return null
    if (validatePublicationReadiness(version) !== 'ok') {
      return { version, outcome: 'rejected' }
    }
    const now = this.now()

    // Single published head per dataset: the previously published version is
    // superseded (DATA-MODEL §6.3 — published versions are immutable).
    const previous = await this.listVersions(version.datasetId)
    for (const candidate of previous) {
      if (candidate.id !== version.id && candidate.status === 'published') {
        if (validateDatasetVersionStatusChange(candidate.status, 'superseded') === 'ok') {
          await this.db
            .prepare('UPDATE dataset_versions SET status = ? WHERE id = ?')
            .bind('superseded', candidate.id)
            .run?.()
        }
      }
    }

    await this.db
      .prepare('UPDATE dataset_versions SET status = ?, published_at = ? WHERE id = ?')
      .bind('published', now, version.id)
      .run?.()
    return {
      version: { ...version, status: 'published', publishedAt: now },
      outcome: 'published',
    }
  }

  async listAssignments(datasetId: string): Promise<readonly DatasetAssignment[]> {
    const rows = await this.db
      .prepare(
        `SELECT ${ASSIGNMENT_COLUMNS} FROM dataset_assignments
         WHERE dataset_id = ?
         ORDER BY created_at DESC, id`,
      )
      .bind(datasetId)
      .all<AssignmentRow>()
    return rows.results.map(toAssignment)
  }

  async getAssignment(id: string): Promise<DatasetAssignment | null> {
    const row = await this.db
      .prepare(`SELECT ${ASSIGNMENT_COLUMNS} FROM dataset_assignments WHERE id = ? LIMIT 1`)
      .bind(id)
      .first<AssignmentRow>()
    return row ? toAssignment(row) : null
  }

  async createAssignment(
    input: CreateDatasetAssignmentInput,
  ): Promise<GuardedAssignmentResult> {
    const now = this.now()
    const datasetVersionId = input.datasetVersionId ?? null
    const validFrom = input.validFrom ?? null
    const validUntil = input.validUntil ?? null

    const rejected: DatasetAssignment = {
      id: input.id,
      datasetId: input.datasetId,
      datasetVersionId,
      recipientCompanyId: input.recipientCompanyId,
      recipientWorkspaceId: input.recipientWorkspaceId ?? null,
      mode: input.mode,
      status: 'pending',
      validFrom,
      validUntil,
      createdAt: now,
      updatedAt: now,
    }

    if (validateAssignmentMode(input.mode, datasetVersionId) !== 'ok') {
      return { assignment: rejected, outcome: 'rejected' }
    }
    if (validateAssignmentWindow(validFrom, validUntil) !== 'ok') {
      return { assignment: rejected, outcome: 'rejected' }
    }

    // Deterministic initial state: an assignment whose window already opened is
    // active immediately, a future-dated one waits as `pending`.
    const openedNow = validFrom === null || validFrom <= now
    const status: DatasetAssignmentStatus = openedNow ? 'active' : 'pending'
    const assignment: DatasetAssignment = { ...rejected, status }

    const stmt = this.db.prepare(
      `INSERT INTO dataset_assignments
         (id, dataset_id, dataset_version_id, recipient_company_id, recipient_workspace_id, mode, status, valid_from, valid_until, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    await stmt
      .bind(
        assignment.id,
        assignment.datasetId,
        assignment.datasetVersionId,
        assignment.recipientCompanyId,
        assignment.recipientWorkspaceId,
        assignment.mode,
        assignment.status,
        assignment.validFrom,
        assignment.validUntil,
        now,
        now,
      )
      .run?.()
    return { assignment, outcome: 'created' }
  }

  async revokeAssignment(id: string): Promise<GuardedAssignmentResult | null> {
    const assignment = await this.getAssignment(id)
    if (assignment === null) return null
    // Revocation is terminal and idempotent-safe: an already-revoked grant is
    // reported back without a second write.
    if (assignment.status === 'revoked') {
      return { assignment, outcome: 'rejected' }
    }
    const now = this.now()
    await this.db
      .prepare('UPDATE dataset_assignments SET status = ?, updated_at = ? WHERE id = ?')
      .bind('revoked', now, id)
      .run?.()
    return { assignment: { ...assignment, status: 'revoked', updatedAt: now }, outcome: 'revoked' }
  }

  /** Effective (fail-closed) state of one assignment at a point in time. */
  async resolveState(
    id: string,
    atMs: number,
  ): Promise<'active' | 'inactive' | null> {
    const assignment = await this.getAssignment(id)
    return assignment === null ? null : resolveAssignmentState(assignment, atMs)
  }
}

function toDataset(row: DatasetRow): Dataset {
  return {
    id: row.id,
    ownerType: row.owner_type as Dataset['ownerType'],
    ownerId: row.owner_id,
    name: row.name,
    datasetType: isDatasetType(row.dataset_type) ? row.dataset_type : 'mixed',
    status: isDatasetStatus(row.status) ? row.status : 'draft',
    sourceType: row.source_type as DatasetSourceType,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toVersion(row: VersionRow): DatasetVersion {
  return {
    id: row.id,
    datasetId: row.dataset_id,
    versionLabel: row.version_label,
    status: row.status as DatasetVersionStatus,
    recordCount: row.record_count,
    createdBy: row.created_by,
    sourceImportId: row.source_import_id,
    createdAt: row.created_at,
    publishedAt: row.published_at,
  }
}

function toAssignment(row: AssignmentRow): DatasetAssignment {
  return {
    id: row.id,
    datasetId: row.dataset_id,
    datasetVersionId: row.dataset_version_id,
    recipientCompanyId: row.recipient_company_id,
    recipientWorkspaceId: row.recipient_workspace_id,
    mode: row.mode as DatasetAssignment['mode'],
    status: row.status as DatasetAssignmentStatus,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
import type {
  CreateDatasetExportInput,
  DatasetAssignment,
  DatasetExportEvaluation,
  DatasetExportRecord,
  DatasetExportStatus,
  DatasetLicense,
  DatasetLicenseInput,
  DatasetSourceType,
  DatasetVersionStatus,
} from '@fieldrep/domain'
import {
  evaluateDatasetExport,
  normalizeLicenseTerms,
  resolveDatasetLicense,
  validateExportStatusChange,
} from '@fieldrep/domain'

import type { D1DatabaseLike } from './contracts'

/**
 * Dataset licensing & export ledger repository (P11-A4).
 *
 * Control-plane access over the migration-0008 `dataset_licenses` and
 * `dataset_exports` tables plus the assignment-enforcement read used by the
 * tenant data path. Every export is re-validated against the resolved license
 * *before* a ledger row exists, and a decided export is immutable.
 */

export interface DatasetExportContext {
  versionStatus: DatasetVersionStatus
  publishedVersionId: string | null
  assignment?: Pick<
    DatasetAssignment,
    'status' | 'validFrom' | 'validUntil' | 'mode' | 'datasetVersionId'
  > | null | undefined
  assignmentExportAllowed?: boolean | undefined
  atMs: number
}

export interface GuardedExportResult {
  draft: DatasetExportRecord
  outcome: 'created' | 'rejected'
  evaluation: DatasetExportEvaluation
}

export interface ExportDecisionResult {
  export: DatasetExportRecord
  outcome: 'decided' | 'refused'
}

export interface DatasetLicenseRepository {
  listLicenses(): Promise<readonly DatasetLicense[]>
  getLicense(datasetId: string): Promise<DatasetLicense | null>
  /** Effective terms: the explicit license row, or the provenance default. */
  resolveLicense(datasetId: string): Promise<DatasetLicense | null>
  upsertLicense(datasetId: string, input: DatasetLicenseInput): Promise<DatasetLicense>
  listExports(datasetId: string): Promise<readonly DatasetExportRecord[]>
  getExport(id: string): Promise<DatasetExportRecord | null>
  createExport(
    input: CreateDatasetExportInput,
    context: DatasetExportContext,
  ): Promise<GuardedExportResult>
  decideExport(
    id: string,
    decision: Exclude<DatasetExportStatus, 'pending'>,
    reason?: string | undefined,
  ): Promise<ExportDecisionResult | null>
  /** Assignments granted to one recipient company/workspace (enforcement read). */
  listTenantAssignments(
    companyId: string,
    workspaceId?: string | undefined,
  ): Promise<readonly DatasetAssignment[]>
}

interface LicenseRow {
  dataset_id: string
  license_reference: string | null
  export_allowed: number
  redistribution_allowed: number
  max_export_records: number | null
  territory: string | null
  updated_at: number
}

interface ExportRow {
  id: string
  dataset_id: string
  dataset_version_id: string
  format: string
  record_count: number
  reason: string | null
  requested_by: string | null
  status: string
  created_at: number
  completed_at: number | null
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
  export_allowed: number
}

const LICENSE_COLUMNS =
  'dataset_id, license_reference, export_allowed, redistribution_allowed, max_export_records, territory, updated_at'
const EXPORT_COLUMNS =
  'id, dataset_id, dataset_version_id, format, record_count, reason, requested_by, status, created_at, completed_at'
const ASSIGNMENT_COLUMNS =
  'id, dataset_id, dataset_version_id, recipient_company_id, recipient_workspace_id, mode, status, valid_from, valid_until, created_at, updated_at, export_allowed'

export class ControlPlaneDatasetLicenseRepository implements DatasetLicenseRepository {
  constructor(
    private readonly db: D1DatabaseLike,
    private readonly now: () => number = Date.now,
  ) {}

  async listLicenses(): Promise<readonly DatasetLicense[]> {
    const rows = await this.db
      .prepare(`SELECT ${LICENSE_COLUMNS} FROM dataset_licenses ORDER BY dataset_id`)
      .all<LicenseRow>()
    return rows.results.map(toLicense)
  }

  async getLicense(datasetId: string): Promise<DatasetLicense | null> {
    const row = await this.db
      .prepare(`SELECT ${LICENSE_COLUMNS} FROM dataset_licenses WHERE dataset_id = ? LIMIT 1`)
      .bind(datasetId)
      .first<LicenseRow>()
    return row === null ? null : toLicense(row)
  }

  /**
   * Fail-closed effective terms: an explicit license row wins; otherwise the
   * provenance default for the dataset's source type applies (§6.2).
   */
  async resolveLicense(datasetId: string): Promise<DatasetLicense | null> {
    const [license, sourceType] = await Promise.all([
      this.getLicense(datasetId),
      this.getDatasetSourceType(datasetId),
    ])
    if (sourceType === null) return null
    return resolveDatasetLicense(license, sourceType, datasetId)
  }

  async upsertLicense(
    datasetId: string,
    input: DatasetLicenseInput,
  ): Promise<DatasetLicense> {
    const terms = normalizeLicenseTerms(input)
    const updatedAt = this.now()
    await this.db
      .prepare(
        `INSERT INTO dataset_licenses
           (dataset_id, license_reference, export_allowed, redistribution_allowed, max_export_records, territory, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(dataset_id) DO UPDATE SET
           license_reference = excluded.license_reference,
           export_allowed = excluded.export_allowed,
           redistribution_allowed = excluded.redistribution_allowed,
           max_export_records = excluded.max_export_records,
           territory = excluded.territory,
           updated_at = excluded.updated_at`,
      )
      .bind(
        datasetId,
        terms.licenseReference,
        terms.exportAllowed ? 1 : 0,
        terms.redistributionAllowed ? 1 : 0,
        terms.maxExportRecords,
        terms.territory,
        updatedAt,
      )
      .run?.()
    return { datasetId, updatedAt, ...terms }
  }

  async listExports(datasetId: string): Promise<readonly DatasetExportRecord[]> {
    const rows = await this.db
      .prepare(
        `SELECT ${EXPORT_COLUMNS} FROM dataset_exports
         WHERE dataset_id = ?
         ORDER BY created_at DESC, id`,
      )
      .bind(datasetId)
      .all<ExportRow>()
    return rows.results.map(toExport)
  }

  async getExport(id: string): Promise<DatasetExportRecord | null> {
    const row = await this.db
      .prepare(`SELECT ${EXPORT_COLUMNS} FROM dataset_exports WHERE id = ? LIMIT 1`)
      .bind(id)
      .first<ExportRow>()
    return row === null ? null : toExport(row)
  }

  async createExport(
    input: CreateDatasetExportInput,
    context: DatasetExportContext,
  ): Promise<GuardedExportResult> {
    const now = this.now()
    const license = await this.resolveLicense(input.datasetId)
    // An unknown dataset has no provenance default → fail closed.
    const evaluation = evaluateDatasetExport({
      license: license ?? { exportAllowed: false, maxExportRecords: null },
      versionStatus: context.versionStatus,
      publishedVersionId: context.publishedVersionId,
      requestedVersionId: input.datasetVersionId,
      requestedRecordCount: input.recordCount,
      atMs: context.atMs,
      assignment: context.assignment ?? null,
      assignmentExportAllowed: context.assignmentExportAllowed,
    })
    const draft: DatasetExportRecord = {
      id: input.id,
      datasetId: input.datasetId,
      datasetVersionId: evaluation.effectiveVersionId ?? input.datasetVersionId,
      format: input.format,
      recordCount: input.recordCount,
      reason: input.reason ?? null,
      requestedBy: input.requestedBy ?? null,
      status: 'pending',
      createdAt: now,
      completedAt: null,
    }
    if (evaluation.outcome !== 'allowed' || evaluation.effectiveVersionId === null) {
      return { draft, outcome: 'rejected', evaluation }
    }
    await this.db
      .prepare(
        `INSERT INTO dataset_exports
           (id, dataset_id, dataset_version_id, format, record_count, reason, requested_by, status, created_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, NULL)`,
      )
      .bind(
        draft.id,
        draft.datasetId,
        evaluation.effectiveVersionId,
        draft.format,
        draft.recordCount,
        draft.reason,
        draft.requestedBy,
        now,
      )
      .run?.()
    return {
      draft: { ...draft, datasetVersionId: evaluation.effectiveVersionId },
      outcome: 'created',
      evaluation,
    }
  }

  async decideExport(
    id: string,
    decision: Exclude<DatasetExportStatus, 'pending'>,
    reason?: string | undefined,
  ): Promise<ExportDecisionResult | null> {
    const existing = await this.getExport(id)
    if (existing === null) return null
    // Terminal ledger: a decided export is audit evidence and is never re-run.
    if (validateExportStatusChange(existing.status, decision) !== 'ok') {
      return { export: existing, outcome: 'refused' }
    }
    const completedAt = this.now()
    const nextReason = reason ?? existing.reason
    await this.db
      .prepare(
        'UPDATE dataset_exports SET status = ?, completed_at = ?, reason = ? WHERE id = ?',
      )
      .bind(decision, completedAt, nextReason, id)
      .run?.()
    return {
      export: { ...existing, status: decision, completedAt, reason: nextReason },
      outcome: 'decided',
    }
  }

  async listTenantAssignments(
    companyId: string,
    workspaceId?: string | undefined,
  ): Promise<readonly DatasetAssignment[]> {
    const query =
      workspaceId === undefined
        ? `SELECT ${ASSIGNMENT_COLUMNS} FROM dataset_assignments
           WHERE recipient_company_id = ?
           ORDER BY dataset_id, id`
        : `SELECT ${ASSIGNMENT_COLUMNS} FROM dataset_assignments
           WHERE recipient_company_id = ?
             AND (recipient_workspace_id IS NULL OR recipient_workspace_id = ?)
           ORDER BY dataset_id, id`
    const binds = workspaceId === undefined ? [companyId] : [companyId, workspaceId]
    const rows = await this.db.prepare(query).bind(...binds).all<AssignmentRow>()
    return rows.results.map(toAssignment)
  }

  private async getDatasetSourceType(datasetId: string): Promise<DatasetSourceType | null> {
    const row = await this.db
      .prepare('SELECT source_type FROM datasets WHERE id = ? LIMIT 1')
      .bind(datasetId)
      .first<{ source_type: string }>()
    return row === null ? null : (row.source_type as DatasetSourceType)
  }
}

function toLicense(row: LicenseRow): DatasetLicense {
  return {
    datasetId: row.dataset_id,
    licenseReference: row.license_reference,
    exportAllowed: row.export_allowed !== 0,
    redistributionAllowed: row.redistribution_allowed !== 0,
    maxExportRecords: row.max_export_records,
    territory: row.territory === null ? null : String(row.territory),
    updatedAt: row.updated_at,
  }
}

function toExport(row: ExportRow): DatasetExportRecord {
  return {
    id: row.id,
    datasetId: row.dataset_id,
    datasetVersionId: row.dataset_version_id,
    format: row.format as DatasetExportRecord['format'],
    recordCount: row.record_count,
    reason: row.reason,
    requestedBy: row.requested_by,
    status: row.status as DatasetExportStatus,
    createdAt: row.created_at,
    completedAt: row.completed_at,
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
    status: row.status as DatasetAssignment['status'],
    exportAllowed: row.export_allowed !== 0,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
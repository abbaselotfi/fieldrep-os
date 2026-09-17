import type { DatasetAssignment, DatasetSourceType, DatasetVersionStatus } from './dataset-catalog'
import { resolveAssignmentState } from './dataset-catalog'
import type { GuardResult } from './dataset-catalog'
import type { UserId } from './identity'

/**
 * Dataset licensing, export control & assignment enforcement (P11-A4).
 *
 * Mirrors DATA-MODEL.md §6.2 (provenance/license metadata), §6.5 (assignment
 * modes) and the PERMISSION-MATRIX §11 export governance: an export must be
 * licensed, must target a *published* version, and — when a tenant assignment
 * is in play — must stay inside that assignment's mode/window. Pure contracts
 * + deterministic guards — no storage access here.
 */

export type DatasetExportFormat = 'csv' | 'xlsx' | 'json' | 'ndjson'

export type DatasetExportStatus = 'pending' | 'completed' | 'rejected'

export interface DatasetLicense {
  datasetId: string
  licenseReference: string | null
  exportAllowed: boolean
  redistributionAllowed: boolean
  /** null = unlimited; otherwise a hard ceiling per export event. */
  maxExportRecords: number | null
  territory: string | null
  updatedAt: number
}

export interface DatasetLicenseInput {
  licenseReference?: string | null | undefined
  exportAllowed: boolean
  redistributionAllowed?: boolean | undefined
  maxExportRecords?: number | null | undefined
  territory?: string | null | undefined
}

export interface DatasetExportRecord {
  id: string
  datasetId: string
  datasetVersionId: string
  format: DatasetExportFormat
  recordCount: number
  reason: string | null
  requestedBy: string | null
  status: DatasetExportStatus
  createdAt: number
  completedAt: number | null
}

export interface CreateDatasetExportInput {
  id: string
  datasetId: string
  datasetVersionId: string
  format: DatasetExportFormat
  recordCount: number
  reason?: string | undefined
  requestedBy?: UserId | undefined
}

/**
 * Deterministic default terms by provenance when no explicit license row
 * exists (§6.2): internally curated data may be exported without
 * redistribution, while purchased/partner/imported data stays locked until a
 * license is registered explicitly. This is the fail-closed default.
 */
export function defaultLicenseTerms(sourceType: DatasetSourceType): Pick<
  DatasetLicense,
  'exportAllowed' | 'redistributionAllowed' | 'maxExportRecords'
> {
  const internal = sourceType === 'internal' || sourceType === 'curated'
  return {
    exportAllowed: internal,
    redistributionAllowed: false,
    maxExportRecords: null,
  }
}

/** Clamps license terms: redistribution requires export, caps stay integral. */
export function normalizeLicenseTerms(input: DatasetLicenseInput): {
  licenseReference: string | null
  exportAllowed: boolean
  redistributionAllowed: boolean
  maxExportRecords: number | null
  territory: string | null
} {
  const cap = input.maxExportRecords
  const maxExportRecords =
    cap === null || cap === undefined || !Number.isFinite(cap) || cap < 0 ? null : Math.floor(cap)
  const redistributionAllowed = input.redistributionAllowed === true
  return {
    licenseReference: input.licenseReference ?? null,
    // Redistribution is a strictly stronger right than export.
    exportAllowed: input.exportAllowed || redistributionAllowed,
    redistributionAllowed,
    maxExportRecords,
    territory: input.territory ?? null,
  }
}

/** Resolves the effective terms for a dataset (explicit license or default). */
export function resolveDatasetLicense(
  license: DatasetLicense | null,
  sourceType: DatasetSourceType,
  datasetId: string,
): DatasetLicense {
  if (license !== null) return license
  return { datasetId, licenseReference: null, updatedAt: 0, territory: null, ...defaultLicenseTerms(sourceType) }
}

export type DatasetExportOutcome =
  | 'allowed'
  | 'license_denied'
  | 'version_not_published'
  | 'assignment_inactive'
  | 'assignment_version_mismatch'
  | 'record_limit_exceeded'

export interface DatasetExportEvaluation {
  outcome: DatasetExportOutcome
  /** The version an allowed export must read from (never a draft). */
  effectiveVersionId: string | null
}

export interface DatasetExportEvaluationInput {
  license: Pick<DatasetLicense, 'exportAllowed' | 'maxExportRecords'>
  versionStatus: DatasetVersionStatus
  /** The dataset's current published head (null when none is published). */
  publishedVersionId: string | null
  /** The version the caller asked to export (null = the effective version). */
  requestedVersionId: string | null
  requestedRecordCount: number
  atMs: number
  /** Present only for tenant-scoped exports (assignment-governed path). */
  assignment?: Pick<
    DatasetAssignment,
    'status' | 'validFrom' | 'validUntil' | 'mode' | 'datasetVersionId'
  > | null | undefined
  /** Assignment-level export ban (§11: assignment governs redistribution). */
  assignmentExportAllowed?: boolean | undefined
}

/**
 * Fail-closed export gate. Order matters: an unpublished version can never be
 * exported even if licensed, and an assignment-governed export must be inside
 * an active window *and* coherent with the assignment's mode.
 */
export function evaluateDatasetExport(
  input: DatasetExportEvaluationInput,
): DatasetExportEvaluation {
  if (input.versionStatus !== 'published') {
    return { outcome: 'version_not_published', effectiveVersionId: null }
  }
  if (!input.license.exportAllowed) {
    return { outcome: 'license_denied', effectiveVersionId: null }
  }

  let effectiveVersionId = input.requestedVersionId ?? input.publishedVersionId
  const assignment = input.assignment ?? null
  if (assignment !== null) {
    if (input.assignmentExportAllowed === false) {
      return { outcome: 'license_denied', effectiveVersionId: null }
    }
    if (resolveAssignmentState(assignment, input.atMs) !== 'active') {
      return { outcome: 'assignment_inactive', effectiveVersionId: null }
    }
    // Snapshot assignments pin one immutable version; live ones read the head.
    effectiveVersionId =
      assignment.mode === 'snapshot' ? assignment.datasetVersionId : input.publishedVersionId
    if (effectiveVersionId === null || effectiveVersionId !== input.requestedVersionId) {
      return { outcome: 'assignment_version_mismatch', effectiveVersionId: null }
    }
  } else if (effectiveVersionId !== input.publishedVersionId) {
    // A platform export may only read the current published head.
    return { outcome: 'version_not_published', effectiveVersionId: null }
  }

  if (effectiveVersionId === null) {
    return { outcome: 'version_not_published', effectiveVersionId: null }
  }
  const cap = input.license.maxExportRecords
  if (!isValidExportRecordCount(input.requestedRecordCount)) {
    return { outcome: 'record_limit_exceeded', effectiveVersionId: null }
  }
  if (cap !== null && input.requestedRecordCount > cap) {
    return { outcome: 'record_limit_exceeded', effectiveVersionId: null }
  }
  return { outcome: 'allowed', effectiveVersionId }
}

export function isValidExportRecordCount(value: number): boolean {
  return Number.isInteger(value) && value >= 0
}

const EXPORT_STATUS_TRANSITIONS: Readonly<
  Record<DatasetExportStatus, readonly DatasetExportStatus[]>
> = {
  pending: ['pending', 'completed', 'rejected'],
  // Terminal: the export ledger is the audit record of what left the platform.
  completed: ['completed'],
  rejected: ['rejected'],
}

export function validateExportStatusChange(
  current: DatasetExportStatus,
  next: DatasetExportStatus,
): GuardResult {
  return EXPORT_STATUS_TRANSITIONS[current].includes(next) ? 'ok' : 'invalid_state'
}

export function isExportDecided(status: DatasetExportStatus): boolean {
  return status !== 'pending'
}

/**
 * Assignment enforcement for the tenant data path (§6.5 / invariant 11:
 * assignment never merges recipient operational data — it only grants
 * governed read access to catalog records).
 */
export interface TenantDatasetAccess {
  datasetId: string
  assignmentId: string
  mode: 'snapshot' | 'live'
  /** Snapshot: the pinned version. Live: null → follow the published head. */
  versionId: string | null
  validFrom: number | null
  validUntil: number | null
}

/**
 * Fail-closed: only assignments that are active *at `atMs`* produce an access
 * entry, ordered deterministically by dataset then assignment. A dataset with
 * no active assignment yields nothing at all.
 */
export function resolveTenantDatasetAccess(
  assignments: readonly DatasetAssignment[],
  atMs: number,
): TenantDatasetAccess[] {
  return assignments
    .filter((assignment) => resolveAssignmentState(assignment, atMs) === 'active')
    .map((assignment) => ({
      datasetId: assignment.datasetId,
      assignmentId: assignment.id,
      mode: assignment.mode,
      versionId: assignment.mode === 'snapshot' ? assignment.datasetVersionId : null,
      validFrom: assignment.validFrom,
      validUntil: assignment.validUntil,
    }))
    .sort((a, b) =>
      a.datasetId === b.datasetId
        ? a.assignmentId.localeCompare(b.assignmentId)
        : a.datasetId.localeCompare(b.datasetId),
    )
}

/**
 * Resolves the concrete version a tenant may read. Snapshot access is pinned
 * (and must be pinned — an incoherent row resolves to null, never to the
 * head); live access follows the published head.
 */
export function resolveTenantAccessVersionId(
  access: TenantDatasetAccess,
  publishedHeadVersionId: string | null,
): string | null {
  if (access.mode === 'snapshot') return access.versionId
  return publishedHeadVersionId
}

/** Access entry for one dataset, if any, in deterministic order. */
export function findTenantDatasetAccess(
  assignments: readonly DatasetAssignment[],
  datasetId: string,
  atMs: number,
): TenantDatasetAccess | null {
  const access = resolveTenantDatasetAccess(
    assignments.filter((assignment) => assignment.datasetId === datasetId),
    atMs,
  )
  return access[0] ?? null
}
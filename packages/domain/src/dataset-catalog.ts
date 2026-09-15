import type { CompanyId, WorkspaceId } from './identity'

/**
 * Dataset catalog contracts (P11-A1).
 *
 * Mirrors DATA-MODEL.md §6 (datasets / dataset_sources / dataset_versions /
 * dataset_imports / dataset_assignments). Datasets are control-plane entities
 * (DATA-MODEL §1: identity, tenancy, licensing and datasets live platform-side).
 * Pure contracts + deterministic guards — no storage access here.
 */

export type DatasetOwnerType = 'platform' | 'company' | 'workspace'

export type DatasetType = 'practitioners' | 'pharmacies' | 'hospitals' | 'clinics' | 'mixed'

export type DatasetStatus = 'draft' | 'published' | 'archived'

export type DatasetSourceType = 'import' | 'purchase' | 'curated' | 'internal' | 'partner'

export type DatasetVersionStatus = 'draft' | 'published' | 'superseded'

export type AssignmentMode = 'snapshot' | 'live'

export type DatasetAssignmentStatus = 'pending' | 'active' | 'expired' | 'revoked'

export interface Dataset {
  id: string
  ownerType: DatasetOwnerType
  ownerId: string | null
  name: string
  datasetType: DatasetType
  status: DatasetStatus
  sourceType: DatasetSourceType
  createdAt: number
  updatedAt: number
}

export interface DatasetVersion {
  id: string
  datasetId: string
  versionLabel: string
  status: DatasetVersionStatus
  recordCount: number
  createdBy: string | null
  sourceImportId: string | null
  createdAt: number
  publishedAt: number | null
}

export interface DatasetAssignment {
  id: string
  datasetId: string
  datasetVersionId: string | null
  recipientCompanyId: CompanyId
  recipientWorkspaceId: WorkspaceId | null
  mode: AssignmentMode
  status: DatasetAssignmentStatus
  validFrom: number | null
  validUntil: number | null
  createdAt: number
  updatedAt: number
}

export interface CreateDatasetInput {
  id: string
  name: string
  datasetType: DatasetType
  sourceType: DatasetSourceType
  ownerType?: DatasetOwnerType | undefined
  ownerId?: string | undefined
}

export interface CreateDatasetAssignmentInput {
  id: string
  datasetId: string
  recipientCompanyId: CompanyId
  mode: AssignmentMode
  datasetVersionId?: string | undefined
  recipientWorkspaceId?: WorkspaceId | undefined
  validFrom?: number | undefined
  validUntil?: number | undefined
}

export type GuardResult = 'ok' | 'invalid_state' | 'invalid_window' | 'version_required'

const DATASET_VERSION_TRANSITIONS: Readonly<
  Record<DatasetVersionStatus, readonly DatasetVersionStatus[]>
> = {
  // Immutable after publication: published versions may only be superseded.
  draft: ['draft', 'published'],
  published: ['published', 'superseded'],
  superseded: ['superseded'],
}

export function validateDatasetVersionStatusChange(
  current: DatasetVersionStatus,
  next: DatasetVersionStatus,
): GuardResult {
  return DATASET_VERSION_TRANSITIONS[current].includes(next) ? 'ok' : 'invalid_state'
}

/** DATA-MODEL §6.3: only draft versions are mutable. */
export function isDatasetVersionMutable(status: DatasetVersionStatus): boolean {
  return status === 'draft'
}

/**
 * Publication readiness: only a draft with ingested records may be published —
 * an empty version must never become the assignable truth.
 */
export function validatePublicationReadiness(
  version: Pick<DatasetVersion, 'status' | 'recordCount'>,
): GuardResult {
  if (version.status !== 'draft') return 'invalid_state'
  return version.recordCount > 0 ? 'ok' : 'invalid_state'
}

export function validateAssignmentWindow(
  validFrom: number | null,
  validUntil: number | null,
): GuardResult {
  if (validFrom === null || validUntil === null) return 'ok'
  return validUntil >= validFrom ? 'ok' : 'invalid_window'
}

/**
 * Mode/version coherence: a snapshot assignment pins an immutable version;
 * a live assignment must not pin one (it follows the published head).
 */
export function validateAssignmentMode(
  mode: AssignmentMode,
  datasetVersionId: string | null,
): GuardResult {
  if (mode === 'snapshot') return datasetVersionId === null ? 'version_required' : 'ok'
  return datasetVersionId === null ? 'ok' : 'invalid_state'
}

/**
 * Fail-closed effective state: only an `active` assignment inside its window
 * grants access. `pending` (future `valid_from`) resolves to inactive.
 */
export function resolveAssignmentState(
  assignment: Pick<DatasetAssignment, 'status' | 'validFrom' | 'validUntil'>,
  atMs: number,
): 'active' | 'inactive' {
  if (assignment.status !== 'active') return 'inactive'
  if (assignment.validFrom !== null && assignment.validFrom > atMs) return 'inactive'
  if (assignment.validUntil !== null && assignment.validUntil <= atMs) return 'inactive'
  return 'active'
}

export function isDatasetStatus(value: string): value is DatasetStatus {
  return value === 'draft' || value === 'published' || value === 'archived'
}

export function isDatasetType(value: string): value is DatasetType {
  return (
    value === 'practitioners' ||
    value === 'pharmacies' ||
    value === 'hospitals' ||
    value === 'clinics' ||
    value === 'mixed'
  )
}
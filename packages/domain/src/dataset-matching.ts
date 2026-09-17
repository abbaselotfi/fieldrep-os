import type { DatasetVersion, GuardResult } from './dataset-catalog'
import type { UserId } from './identity'

/**
 * Practitioner matching & dataset build contracts (P11-A3).
 *
 * Mirrors DATA-MODEL.md §6.6 (canonical practitioner registry), §6.7
 * (practitioner source records with match status/confidence) and the
 * version-build lineage of §6.3. Pure contracts + deterministic guards —
 * no storage access here.
 *
 * Core policy from §6.7: potential duplicate matching must remain reviewable;
 * uncertain records must never be silently merged.
 */

export type PractitionerMatchStatus = 'unmatched' | 'candidate' | 'matched' | 'confirmed_unmatched'

export interface PractitionerSourceRecord {
  id: string
  datasetId: string
  datasetVersionId: string
  /** Opaque reference to the row inside the version's record store. */
  sourceRecordRef: string
  matchKey: string | null
  fullName: string | null
  nationalId: string | null
  phone: string | null
  licenseId: string | null
  matchStatus: PractitionerMatchStatus
  /** Canonical registry id — null until a review links the record. */
  practitionerId: string | null
  decidedBy: string | null
  decidedAt: number | null
  createdAt: number
  updatedAt: number
}

export interface RegisterSourceRecordInput {
  id: string
  datasetId: string
  datasetVersionId: string
  sourceRecordRef: string
  matchKey?: string | null | undefined
  fullName?: string | null | undefined
  nationalId?: string | null | undefined
  phone?: string | null | undefined
  licenseId?: string | null | undefined
  /** Only an exact-policy engine may seed `matched`; default is `unmatched`. */
  matchStatus?: PractitionerMatchStatus | undefined
  practitionerId?: string | undefined
}

export type MatchGuardResult = GuardResult

const MATCH_STATUS_TRANSITIONS: Readonly<
  Record<PractitionerMatchStatus, readonly PractitionerMatchStatus[]>
> = {
  unmatched: ['unmatched', 'candidate', 'matched', 'confirmed_unmatched'],
  candidate: ['candidate', 'matched', 'confirmed_unmatched'],
  // A review decision is terminal audit evidence in either direction.
  matched: ['matched'],
  confirmed_unmatched: ['confirmed_unmatched'],
}

export function validateMatchStatusChange(
  current: PractitionerMatchStatus,
  next: PractitionerMatchStatus,
): MatchGuardResult {
  return MATCH_STATUS_TRANSITIONS[current].includes(next) ? 'ok' : 'invalid_state'
}

/** A review decision (linked or explicitly rejected) is immutable. */
export function isMatchDecided(status: PractitionerMatchStatus): boolean {
  return status === 'matched' || status === 'confirmed_unmatched'
}

export interface LinkMatchInput {
  id: string
  practitionerId: string
  decidedBy: UserId
}

/**
 * Deterministic match scoring (no fuzzy heuristics — every input maps to one
 * confidence value). Evidence equality is evaluated by the caller using the
 * P11-A2 Persian-folding helpers.
 */
export interface MatchEvidence {
  nationalIdEqual: boolean
  phoneEqual: boolean
  nameEqual: boolean
  licenseEqual: boolean
}

export const MATCH_CONFIDENCE_EXACT = 1
export const MATCH_CONFIDENCE_HIGH = 0.9
export const MATCH_CONFIDENCE_MEDIUM = 0.6
export const MATCH_CONFIDENCE_NAME_ONLY = 0.5
export const MATCH_CONFIDENCE_NONE = 0

export function scoreMatchEvidence(evidence: MatchEvidence): number {
  // Two strong identifiers (national id + name) are an exact identity.
  if (evidence.nationalIdEqual && evidence.nameEqual) return MATCH_CONFIDENCE_EXACT
  if (evidence.nationalIdEqual) return MATCH_CONFIDENCE_HIGH
  if (evidence.licenseEqual) return MATCH_CONFIDENCE_HIGH
  if (evidence.phoneEqual && evidence.nameEqual) return 0.8
  if (evidence.phoneEqual) return MATCH_CONFIDENCE_MEDIUM
  if (evidence.nameEqual) return MATCH_CONFIDENCE_NAME_ONLY
  return MATCH_CONFIDENCE_NONE
}

export interface MatchPolicy {
  /** Minimum confidence for a record pair to become a review candidate. */
  candidateMinConfidence: number
}

export const DEFAULT_MATCH_POLICY: MatchPolicy = { candidateMinConfidence: 0.6 }

export function normalizeMatchPolicy(
  value: Partial<MatchPolicy> | null | undefined,
): MatchPolicy {
  const raw = value?.candidateMinConfidence
  if (raw === undefined || !Number.isFinite(raw)) return DEFAULT_MATCH_POLICY
  return { candidateMinConfidence: Math.min(Math.max(raw, 0), 1) }
}

export type MatchClassification = 'no_match' | 'candidate' | 'exact'

/**
 * Classification only ever *marks* a review candidate — it never merges.
 * Silent merging is forbidden by §6.7; only an explicit `linkMatch` decision
 * writes a practitioner link.
 */
export function classifyMatchConfidence(
  confidence: number,
  policy: MatchPolicy = DEFAULT_MATCH_POLICY,
): MatchClassification {
  if (confidence >= 1) return 'exact'
  if (confidence >= policy.candidateMinConfidence) return 'candidate'
  return 'no_match'
}

/**
 * Dataset build lineage (§6.3): a build derives a target version from a
 * *published* source version. Splits (target dataset ≠ source) and refreshes
 * (same dataset, new version) share this ledger.
 */
export interface DatasetBuild {
  id: string
  sourceDatasetId: string
  sourceVersionId: string
  targetDatasetId: string
  targetVersionId: string
  definition: DatasetBuildDefinition
  recordCount: number
  createdBy: string | null
  createdAt: number
}

export interface DatasetBuildDefinition {
  /** Keep only records whose specialty is listed (empty = keep all). */
  specialtyIds?: readonly string[] | undefined
}

export interface CreateDatasetBuildInput {
  id: string
  sourceDatasetId: string
  sourceVersionId: string
  targetDatasetId: string
  targetVersionId: string
  definition: DatasetBuildDefinition
  recordCount: number
  createdBy?: string | undefined
}

/** A definition must express at least one criterion to be reviewable. */
export function isRecordableBuildDefinition(definition: DatasetBuildDefinition): boolean {
  return (definition.specialtyIds ?? []).length > 0
}

/**
 * Build readiness: the source version must be published (immutable
 * provenance) and non-empty; the definition must select something. An empty
 * target must never be produced.
 */
export function validateBuildReadiness(
  sourceVersion: Pick<DatasetVersion, 'status' | 'recordCount'>,
  definition: DatasetBuildDefinition,
): GuardResult {
  if (sourceVersion.status !== 'published') return 'invalid_state'
  if (sourceVersion.recordCount <= 0) return 'invalid_state'
  if (!isRecordableBuildDefinition(definition)) return 'invalid_state'
  return 'ok'
}

export interface BuildRecordRef {
  recordRef: string
  specialtyId: string | null
}

/**
 * Deterministic build execution over record refs: keeps records whose
 * specialty is listed in the definition (records without a specialty never
 * survive a specialty-filtered split).
 */
export function executeBuildDefinition(
  records: readonly BuildRecordRef[],
  definition: DatasetBuildDefinition,
): readonly string[] {
  const specialties = definition.specialtyIds
  if (specialties === undefined || specialties.length === 0) {
    return records.map((r) => r.recordRef)
  }
  const allowed = new Set(specialties)
  return records.filter((r) => r.specialtyId !== null && allowed.has(r.specialtyId)).map((r) => r.recordRef)
}
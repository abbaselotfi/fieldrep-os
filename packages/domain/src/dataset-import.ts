import type { UserId } from './identity'

/**
 * Dataset import & normalization contracts (P11-A2).
 *
 * Covers the `dataset_imports` ledger (DATA-MODEL §6.4), the normalization
 * completion gate and the duplicate-review workflow. Pure contracts +
 * deterministic guards — no storage access here.
 */

export type DatasetImportStatus = 'received' | 'normalized' | 'failed'

export type DuplicateReviewDecision = 'merged' | 'kept_both' | 'discarded'

export type DuplicateReviewStatus = 'pending' | DuplicateReviewDecision

export interface DatasetImport {
  id: string
  datasetId: string
  sourceFileReference: string | null
  originalFilename: string
  importedBy: string | null
  importedAt: number
  status: DatasetImportStatus
  rowCount: number
  validCount: number
  invalidCount: number
  manifest: Record<string, unknown> | null
}

export interface CreateDatasetImportInput {
  id: string
  datasetId: string
  originalFilename: string
  sourceFileReference?: string | undefined
  importedBy?: UserId | undefined
  manifest?: Record<string, unknown> | undefined
}

export interface NormalizationCounts {
  rowCount: number
  validCount: number
  invalidCount: number
}

export interface ImportQualityPolicy {
  /** Minimum share of valid rows required for a normalized import. */
  minValidRatio: number
}

export const DEFAULT_IMPORT_QUALITY_POLICY: ImportQualityPolicy = { minValidRatio: 0.5 }

export function normalizeImportQualityPolicy(
  value: Partial<ImportQualityPolicy> | null | undefined,
): ImportQualityPolicy {
  const raw = value?.minValidRatio
  if (raw === undefined || !Number.isFinite(raw)) return DEFAULT_IMPORT_QUALITY_POLICY
  return { minValidRatio: Math.min(Math.max(raw, 0), 1) }
}

/** Invariant: valid + invalid must account for every ingested row. */
export function validateNormalizationCounts(
  counts: NormalizationCounts,
): 'ok' | 'invalid_counts' {
  const { rowCount, validCount, invalidCount } = counts
  if (rowCount < 0 || validCount < 0 || invalidCount < 0) return 'invalid_counts'
  if (validCount + invalidCount !== rowCount) return 'invalid_counts'
  return 'ok'
}

/**
 * Deterministic quality gate: an empty import, or one below the policy's
 * valid-ratio floor, is `failed` and must not feed a dataset version.
 */
export function evaluateImportQuality(
  counts: NormalizationCounts,
  policy: ImportQualityPolicy = DEFAULT_IMPORT_QUALITY_POLICY,
): { outcome: 'normalized' | 'failed'; validRatio: number } {
  const { rowCount, validCount } = counts
  if (rowCount <= 0) return { outcome: 'failed', validRatio: 0 }
  const validRatio = validCount / rowCount
  return { outcome: validRatio >= policy.minValidRatio ? 'normalized' : 'failed', validRatio }
}

const IMPORT_STATUS_TRANSITIONS: Readonly<
  Record<DatasetImportStatus, readonly DatasetImportStatus[]>
> = {
  received: ['received', 'normalized', 'failed'],
  // Normalized imports are the immutable provenance of a version.
  normalized: ['normalized'],
  // A failed import may be explicitly retried, which reopens it as received.
  failed: ['failed', 'received'],
}

export function validateImportStatusChange(
  current: DatasetImportStatus,
  next: DatasetImportStatus,
): 'ok' | 'invalid_state' {
  return IMPORT_STATUS_TRANSITIONS[current].includes(next) ? 'ok' : 'invalid_state'
}

/**
 * Duplicate-review workflow (DATA-MODEL §6.4 — normalization dedup review).
 * A candidate groups two or more imported records that share a matching key;
 * a reviewer either merges them, keeps both, or discards one. A decision is
 * terminal — a decided candidate is immutable audit evidence.
 */

export interface DuplicateReviewCandidate {
  id: string
  datasetId: string
  importId: string
  matchKey: string
  recordRefs: string[]
  status: DuplicateReviewStatus
  decidedBy: string | null
  decidedAt: number | null
  createdAt: number
  updatedAt: number
}

export interface RecordDuplicateCandidateInput {
  id: string
  datasetId: string
  importId: string
  matchKey: string
  recordRefs: readonly string[]
}

export interface DecideDuplicateCandidateInput {
  id: string
  decision: DuplicateReviewDecision
  decidedBy: UserId
}

const CANDIDATE_STATUS_TRANSITIONS: Readonly<
  Record<DuplicateReviewStatus, readonly DuplicateReviewStatus[]>
> = {
  pending: ['pending', 'merged', 'kept_both', 'discarded'],
  merged: ['merged'],
  kept_both: ['kept_both'],
  discarded: ['discarded'],
}

export function validateCandidateStatusChange(
  current: DuplicateReviewStatus,
  next: DuplicateReviewStatus,
): 'ok' | 'invalid_state' {
  return CANDIDATE_STATUS_TRANSITIONS[current].includes(next) ? 'ok' : 'invalid_state'
}

/**
 * A duplicate candidate is only actionable while pending; once decided the
 * ledger row is the provenance of why two records share (or do not share) a
 * practitioner identity.
 */
export function isCandidateDecided(status: DuplicateReviewStatus): boolean {
  return status !== 'pending'
}

/** A candidate must group at least two distinct records to be reviewable. */
export function isRecordableCandidate(
  input: Pick<RecordDuplicateCandidateInput, 'matchKey' | 'recordRefs'>,
): 'ok' | 'invalid_candidate' {
  const refs = new Set(input.recordRefs)
  return input.matchKey.trim() !== '' && refs.size >= 2 ? 'ok' : 'invalid_candidate'
}

/**
 * Persian-aware text folding for practitioner matching keys.
 *
 * Deterministically maps Arabic/Persian orthography variants onto one form so
 * that "علی", "علي" (Arabic yaa), "علی‌رضا" (ZWNJ) and diacritic-bearing
 * variants of the same name always produce the same key:
 *  - NFC normalization, then harakat/tatweel/superscript-alef removal;
 *  - ZWNJ and other invisible joiners removed;
 *  - Arabic yaa/kaf/teh-marbuta and hamza variants folded onto Persian forms;
 *  - Persian/Arabic-Indic digits mapped to ASCII digits;
 *  - non letter/digit runs collapsed to single spaces, lowercased.
 */
const CHAR_FOLD_MAP: Readonly<Record<string, string>> = {
  'ي': 'ی',
  'ى': 'ی',
  'ئ': 'ی',
  'ك': 'ک',
  'ڪ': 'ک',
  'ة': 'ه',
  'ۀ': 'ه',
  'أ': 'ا',
  'إ': 'ا',
  'آ': 'ا',
  'ٱ': 'ا',
  'ؤ': 'و',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
}

const ARABIC_MARKS = /[\u064B-\u065F\u0670\u0640\u06D6-\u06ED]/gu
const INVISIBLE_JOINERS = /[\u200B-\u200F\u202A-\u202E\uFEFF]/gu

export function normalizePersianText(value: string): string {
  return value
    .normalize('NFC')
    // ZWNJ/ZWJ behave like a space in Persian names ("علی‌رضا" ≡ "علی رضا").
    .replace(INVISIBLE_JOINERS, ' ')
    .replace(ARABIC_MARKS, '')
    .replace(/[\u064A\u0649\u0626]/gu, 'ی')
    .replace(/[\u0643\u06AA]/gu, 'ک')
    .replace(/[\u0629\u06C0]/gu, 'ه')
    .replace(/[\u0623\u0625\u0622\u0671]/gu, 'ا')
    .replace(/\u0624/gu, 'و')
    .replace(/[٠-٩۰-۹]/gu, (d) => CHAR_FOLD_MAP[d] ?? d)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase()
}

/** Phone digits only — separators and leading zero padding are irrelevant. */
export function normalizePhoneKey(value: string): string {
  const digits = normalizePersianText(value).replace(/\D/gu, '')
  // Fold an optional single leading trunk zero (0912…) and +98/0098 country
  // prefixes onto the canonical 9xxxxxxxxx core.
  const withoutCountry = digits.replace(/^(?:0098|\+?98)/u, '')
  return withoutCountry.replace(/^0/u, '')
}

export interface MatchingKeyInput {
  fullName?: string | null | undefined
  nationalId?: string | null | undefined
  phone?: string | null | undefined
}

/**
 * Deterministic practitioner matching key. Priority: national id (10 digits)
 * > phone > full name. `null` when nothing usable is present — such records
 * must never match anything.
 */
export function buildMatchingKey(input: MatchingKeyInput): string | null {
  const nationalId = normalizePersianText(input.nationalId ?? '').replace(/\D/gu, '')
  if (nationalId.length === 10) return `nid:${nationalId}`
  const phone = normalizePhoneKey(input.phone ?? '')
  if (phone.length >= 9) return `tel:${phone}`
  const name = normalizePersianText(input.fullName ?? '')
  if (name !== '') return `name:${name}`
  return null
}
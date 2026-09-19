import type { SloBudget, SloSample } from './observability'
import { evaluateSlo, normalizeSloBudget } from './observability'

/**
 * Workload budgets & release readiness (P12-A4).
 *
 * SECURITY-THREAT-MODEL §28 mitigation "bounded pagination / quotas" made
 * explicit: every list/batch/export surface has a hard, normalized ceiling so
 * work per request stays predictably bounded (no unbounded scans, no
 * unbounded payloads), and a release only counts as ready when its evidence
 * gates actually passed. Pure contracts + deterministic guards.
 */

export interface WorkloadBudget {
  maxPageSize: number
  maxBatchSize: number
  maxExportRecords: number
}

export const DEFAULT_WORKLOAD_BUDGET: WorkloadBudget = {
  maxPageSize: 200,
  maxBatchSize: 1_000,
  maxExportRecords: 50_000,
}

export type WorkloadSurface = 'audit' | 'export' | 'import' | 'sync'

export const WORKLOAD_BUDGETS: Readonly<Record<WorkloadSurface, WorkloadBudget>> = {
  // Audit reads are the most interactive surface — keep them tight.
  audit: { maxPageSize: 200, maxBatchSize: 200, maxExportRecords: 5_000 },
  export: { maxPageSize: 200, maxBatchSize: 1_000, maxExportRecords: 50_000 },
  import: { maxPageSize: 200, maxBatchSize: 1_000, maxExportRecords: 50_000 },
  sync: { maxPageSize: 500, maxBatchSize: 2_000, maxExportRecords: 50_000 },
}

export function workloadBudgetFor(surface: WorkloadSurface): WorkloadBudget {
  return WORKLOAD_BUDGETS[surface]
}

export function normalizeWorkloadBudget(
  value: Partial<WorkloadBudget> | null | undefined,
): WorkloadBudget {
  const pick = (raw: number | undefined, fallback: number): number =>
    raw !== undefined && Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : fallback
  return {
    maxPageSize: pick(value?.maxPageSize, DEFAULT_WORKLOAD_BUDGET.maxPageSize),
    maxBatchSize: pick(value?.maxBatchSize, DEFAULT_WORKLOAD_BUDGET.maxBatchSize),
    maxExportRecords: pick(value?.maxExportRecords, DEFAULT_WORKLOAD_BUDGET.maxExportRecords),
  }
}

/** Deep paging has a hard floor too — offsets may never run away. */
export const MAX_PAGE_INDEX = 10_000

export interface PageRequest {
  page?: number | null | undefined
  pageSize?: number | null | undefined
}

export interface PageWindow {
  page: number
  pageSize: number
  offset: number
  /** True when the caller asked for more than the budget allows. */
  clamped: boolean
}

/**
 * Deterministic, fail-closed pagination window: garbage values degrade to the
 * default page size (never to "everything"), an oversized page size is clamped
 * to the budget, and the page index is bounded so a deep offset cannot be used
 * to force an unbounded scan.
 */
export function resolvePageWindow(
  request: PageRequest,
  budget: WorkloadBudget = DEFAULT_WORKLOAD_BUDGET,
): PageWindow {
  const normalized = normalizeWorkloadBudget(budget)
  const rawPage = request.page
  const rawPageSize = request.pageSize

  // Absent values are simply defaults (not a clamp); present-but-garbage
  // values are degraded *and* reported as clamped.
  const pagePresent = rawPage !== null && rawPage !== undefined
  const pageSizePresent = rawPageSize !== null && rawPageSize !== undefined
  const pageValid = pagePresent && Number.isFinite(rawPage) && (rawPage as number) >= 1
  const pageSizeValid = pageSizePresent && Number.isFinite(rawPageSize) && (rawPageSize as number) >= 1

  const validPage = pageValid ? Math.floor(rawPage as number) : 1
  const validPageSize = pageSizeValid
    ? Math.floor(rawPageSize as number)
    : Math.min(normalized.maxPageSize, 50)

  const page = Math.min(validPage, MAX_PAGE_INDEX)
  const pageSize = Math.min(validPageSize, normalized.maxPageSize)
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    clamped:
      (pagePresent && !pageValid) ||
      (pageSizePresent && !pageSizeValid) ||
      page !== validPage ||
      pageSize !== validPageSize,
  }
}

export type BatchGuardResult = 'ok' | 'invalid_size' | 'too_large'

/** Batch/export ceilings: a caller cannot ask for more than the budget. */
export function validateBatchSize(
  size: number,
  budget: WorkloadBudget = DEFAULT_WORKLOAD_BUDGET,
  kind: 'batch' | 'export' = 'batch',
): BatchGuardResult {
  if (!Number.isInteger(size) || size < 1) return 'invalid_size'
  const normalized = normalizeWorkloadBudget(budget)
  const ceiling = kind === 'export' ? normalized.maxExportRecords : normalized.maxBatchSize
  return size > ceiling ? 'too_large' : 'ok'
}

/**
 * Load/regression profiles: a run is only meaningful when it actually
 * exercised the expected sample count, so coverage below 90 % is itself a
 * breach (a "fast" run that barely ran proves nothing).
 */
export interface LoadProfile {
  name: string
  requestsPerSecond: number
  durationSeconds: number
  concurrency: number
  budget: SloBudget
}

export const DEFAULT_LOAD_PROFILE: LoadProfile = {
  name: 'baseline',
  requestsPerSecond: 20,
  durationSeconds: 30,
  concurrency: 4,
  budget: { p50Ms: 300, p95Ms: 1_200, p99Ms: 3_000, errorRate: 0.01 },
}

export const MIN_SAMPLE_COVERAGE = 0.9

export function normalizeLoadProfile(
  value:
    | (Partial<Omit<LoadProfile, 'budget'>> & {
        name?: string | undefined
        budget?: Partial<SloBudget> | null | undefined
      })
    | null
    | undefined,
): LoadProfile {
  const positive = (raw: number | undefined, fallback: number): number =>
    raw !== undefined && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback
  const name = (value?.name ?? '').trim()
  return {
    name: name === '' ? DEFAULT_LOAD_PROFILE.name : name,
    requestsPerSecond: positive(value?.requestsPerSecond, DEFAULT_LOAD_PROFILE.requestsPerSecond),
    durationSeconds: positive(value?.durationSeconds, DEFAULT_LOAD_PROFILE.durationSeconds),
    concurrency: positive(value?.concurrency, DEFAULT_LOAD_PROFILE.concurrency),
    budget: normalizeSloBudget(value?.budget),
  }
}

export interface LoadRunEvaluation {
  profile: string
  expectedSamples: number
  observedSamples: number
  sampleCoverage: number
  withinBudget: boolean
  breaches: string[]
}

export function evaluateLoadRun(
  profile: LoadProfile,
  samples: readonly SloSample[],
): LoadRunEvaluation {
  const normalized = normalizeLoadProfile(profile)
  const expectedSamples = normalized.requestsPerSecond * normalized.durationSeconds
  const slo = evaluateSlo(samples, normalized.budget)
  const sampleCoverage =
    expectedSamples === 0 ? 0 : Math.min(samples.length / expectedSamples, 1)
  const breaches = [...slo.breaches]
  if (sampleCoverage < MIN_SAMPLE_COVERAGE) breaches.push('insufficient_samples')
  return {
    profile: normalized.name,
    expectedSamples,
    observedSamples: samples.length,
    sampleCoverage,
    withinBudget: breaches.length === 0,
    breaches,
  }
}

export type ReleaseCheckStatus = 'passed' | 'failed' | 'skipped'

export interface ReleaseCheck {
  id: string
  required: boolean
  status: ReleaseCheckStatus
  detail?: string | null | undefined
}

export interface ReleaseReadiness {
  verdict: 'ready' | 'blocked'
  passed: number
  total: number
  /** Required checks that failed. */
  blockers: string[]
  /** Required checks with no evidence at all (skipped). */
  missingEvidence: string[]
}

/**
 * Fail-closed release gate: only *every* required check passing yields
 * `ready`. A required check that was skipped counts as missing evidence — an
 * unproven guarantee is not an assurance.
 */
export function evaluateReleaseReadiness(
  checks: readonly ReleaseCheck[],
): ReleaseReadiness {
  const ordered = [...checks].sort((a, b) => a.id.localeCompare(b.id))
  const blockers = ordered
    .filter((check) => check.required && check.status === 'failed')
    .map((check) => check.id)
  const missingEvidence = ordered
    .filter((check) => check.required && check.status === 'skipped')
    .map((check) => check.id)
  const passed = ordered.filter((check) => check.status === 'passed').length
  return {
    verdict: blockers.length === 0 && missingEvidence.length === 0 ? 'ready' : 'blocked',
    passed,
    total: ordered.length,
    blockers,
    missingEvidence,
  }
}
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_WORKLOAD_BUDGET,
  MAX_PAGE_INDEX,
  evaluateLoadRun,
  evaluateReleaseReadiness,
  normalizeLoadProfile,
  normalizeWorkloadBudget,
  resolvePageWindow,
  validateBatchSize,
  workloadBudgetFor,
} from './workload-budget'

describe('workload budgets', () => {
  it('bounds audit reads more tightly than sync traffic', () => {
    expect(workloadBudgetFor('audit').maxPageSize).toBeLessThanOrEqual(200)
    expect(workloadBudgetFor('audit').maxBatchSize).toBeLessThan(workloadBudgetFor('sync').maxBatchSize)
    expect(workloadBudgetFor('sync').maxPageSize).toBeGreaterThan(workloadBudgetFor('export').maxPageSize)
  })

  it('normalizes invalid budgets back to the fail-closed baseline', () => {
    expect(normalizeWorkloadBudget(undefined)).toEqual(DEFAULT_WORKLOAD_BUDGET)
    expect(normalizeWorkloadBudget({ maxPageSize: 0 })).toEqual(DEFAULT_WORKLOAD_BUDGET)
    expect(normalizeWorkloadBudget({ maxBatchSize: Number.NaN })).toEqual(DEFAULT_WORKLOAD_BUDGET)
    expect(normalizeWorkloadBudget({ maxPageSize: 25.9, maxBatchSize: 10, maxExportRecords: 100 })).toEqual({
      maxPageSize: 25,
      maxBatchSize: 10,
      maxExportRecords: 100,
    })
  })
})

describe('resolvePageWindow', () => {
  const budget = { maxPageSize: 100, maxBatchSize: 100, maxExportRecords: 100 }

  it('returns a bounded default window for an empty request', () => {
    const window = resolvePageWindow({}, budget)
    expect(window).toEqual({ page: 1, pageSize: 50, offset: 0, clamped: false })
  })

  it('clamps an oversized page size to the budget and marks it', () => {
    expect(resolvePageWindow({ page: 2, pageSize: 5_000 }, budget)).toEqual({
      page: 2,
      pageSize: 100,
      offset: 100,
      clamped: true,
    })
  })

  it('degrades garbage values to page 1 instead of "everything"', () => {
    expect(resolvePageWindow({ page: -3, pageSize: 0 }, budget)).toMatchObject({
      page: 1,
      offset: 0,
      clamped: true,
    })
    expect(resolvePageWindow({ page: Number.NaN, pageSize: Number.NaN }, budget)).toMatchObject({
      page: 1,
      pageSize: 50,
    })
  })

  it('bounds deep paging so offsets cannot run away', () => {
    const window = resolvePageWindow({ page: 10_000_000, pageSize: 10 }, budget)
    expect(window.page).toBe(MAX_PAGE_INDEX)
    expect(window.offset).toBe((MAX_PAGE_INDEX - 1) * 10)
    expect(window.clamped).toBe(true)
  })
})

describe('validateBatchSize', () => {
  const budget = { maxPageSize: 10, maxBatchSize: 25, maxExportRecords: 500 }

  it('accepts sizes inside the ceiling and refuses anything above it', () => {
    expect(validateBatchSize(25, budget)).toBe('ok')
    expect(validateBatchSize(26, budget)).toBe('too_large')
    expect(validateBatchSize(500, budget, 'export')).toBe('ok')
    expect(validateBatchSize(501, budget, 'export')).toBe('too_large')
  })

  it('rejects non-positive or fractional sizes', () => {
    expect(validateBatchSize(0, budget)).toBe('invalid_size')
    expect(validateBatchSize(-5, budget)).toBe('invalid_size')
    expect(validateBatchSize(2.5, budget)).toBe('invalid_size')
  })
})

describe('load profiles and runs', () => {
  it('normalizes a profile with usable defaults', () => {
    expect(normalizeLoadProfile(undefined).name).toBe('baseline')
    expect(normalizeLoadProfile({ name: '  peak  ', requestsPerSecond: 0 })).toMatchObject({
      name: 'peak',
      requestsPerSecond: 20,
    })
    expect(normalizeLoadProfile({ durationSeconds: 12.7, concurrency: 2 })).toMatchObject({
      durationSeconds: 12,
      concurrency: 2,
    })
  })

  it('passes a run that met its sample coverage and latency budget', () => {
    const profile = normalizeLoadProfile({
      name: 'smoke',
      requestsPerSecond: 10,
      durationSeconds: 2,
    })
    const samples = Array.from({ length: 20 }, () => ({ latencyMs: 100, errored: false }))
    const evaluation = evaluateLoadRun(profile, samples)
    expect(evaluation.expectedSamples).toBe(20)
    expect(evaluation.sampleCoverage).toBe(1)
    expect(evaluation.withinBudget).toBe(true)
    expect(evaluation.breaches).toEqual([])
  })

  it('flags insufficient coverage — a run that barely ran proves nothing', () => {
    const profile = normalizeLoadProfile({ requestsPerSecond: 100, durationSeconds: 10 })
    const evaluation = evaluateLoadRun(profile, [{ latencyMs: 50, errored: false }])
    expect(evaluation.sampleCoverage).toBeLessThan(0.9)
    expect(evaluation.withinBudget).toBe(false)
    expect(evaluation.breaches).toContain('insufficient_samples')
  })

  it('surfaces latency and error breaches through the shared SLO evaluation', () => {
    const profile = normalizeLoadProfile({
      requestsPerSecond: 1,
      durationSeconds: 3,
      budget: { p95Ms: 100, errorRate: 0.1 },
    })
    const evaluation = evaluateLoadRun(profile, [
      { latencyMs: 50, errored: false },
      { latencyMs: 5_000, errored: true },
      { latencyMs: 5_000, errored: false },
    ])
    expect(evaluation.withinBudget).toBe(false)
    expect(evaluation.breaches).toEqual(
      expect.arrayContaining(['p50_latency', 'p95_latency', 'p99_latency', 'error_rate']),
    )
  })
})

describe('evaluateReleaseReadiness', () => {
  it('is ready only when every required check passed', () => {
    const readiness = evaluateReleaseReadiness([
      { id: 'tests', required: true, status: 'passed' },
      { id: 'load', required: true, status: 'passed' },
      { id: 'docs', required: false, status: 'skipped' },
    ])
    expect(readiness.verdict).toBe('ready')
    expect(readiness.passed).toBe(2)
    expect(readiness.total).toBe(3)
    expect(readiness.blockers).toEqual([])
    expect(readiness.missingEvidence).toEqual([])
  })

  it('blocks on a failed required check and lists it as a blocker', () => {
    const readiness = evaluateReleaseReadiness([
      { id: 'migrations', required: true, status: 'failed' },
      { id: 'typecheck', required: true, status: 'passed' },
    ])
    expect(readiness.verdict).toBe('blocked')
    expect(readiness.blockers).toEqual(['migrations'])
  })

  it('treats a skipped required check as missing evidence, not as a pass', () => {
    const readiness = evaluateReleaseReadiness([
      { id: 'restore_drill', required: true, status: 'skipped' },
      { id: 'typecheck', required: true, status: 'passed' },
    ])
    expect(readiness.verdict).toBe('blocked')
    expect(readiness.missingEvidence).toEqual(['restore_drill'])
    expect(readiness.blockers).toEqual([])
  })

  it('reports ordered, deterministic blocker lists', () => {
    const readiness = evaluateReleaseReadiness([
      { id: 'zz', required: true, status: 'failed' },
      { id: 'aa', required: true, status: 'failed' },
      { id: 'mm', required: true, status: 'skipped' },
    ])
    expect(readiness.blockers).toEqual(['aa', 'zz'])
    expect(readiness.missingEvidence).toEqual(['mm'])
  })
})
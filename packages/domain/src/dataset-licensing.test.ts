import type { DatasetAssignment } from './dataset-catalog'
import { describe, expect, it } from 'vitest'

import {
  defaultLicenseTerms,
  evaluateDatasetExport,
  findTenantDatasetAccess,
  isExportDecided,
  isValidExportRecordCount,
  normalizeLicenseTerms,
  resolveDatasetLicense,
  resolveTenantAccessVersionId,
  resolveTenantDatasetAccess,
  validateExportStatusChange,
} from './dataset-licensing'

const license = {
  datasetId: 'd1',
  licenseReference: 'IQVIA-2026',
  exportAllowed: true,
  redistributionAllowed: false,
  maxExportRecords: null,
  territory: null,
  updatedAt: 1000,
}

function assignment(overrides: Partial<DatasetAssignment> = {}): DatasetAssignment {
  return {
    id: 'a1',
    datasetId: 'd1',
    datasetVersionId: 'v1',
    recipientCompanyId: 'company-1',
    recipientWorkspaceId: null,
    mode: 'snapshot',
    status: 'active',
    validFrom: null,
    validUntil: null,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  }
}

describe('defaultLicenseTerms', () => {
  it('allows export for internal/curated provenance without redistribution', () => {
    expect(defaultLicenseTerms('internal')).toEqual({
      exportAllowed: true,
      redistributionAllowed: false,
      maxExportRecords: null,
    })
    expect(defaultLicenseTerms('curated').exportAllowed).toBe(true)
  })

  it('denies export for purchased/partner/imported provenance until licensed', () => {
    for (const source of ['purchase', 'partner', 'import'] as const) {
      expect(defaultLicenseTerms(source).exportAllowed).toBe(false)
    }
  })

  it('resolves an explicit license over the provenance default', () => {
    expect(resolveDatasetLicense(license, 'purchase', 'd1')).toBe(license)
    const fallback = resolveDatasetLicense(null, 'purchase', 'd1')
    expect(fallback.exportAllowed).toBe(false)
    expect(fallback.datasetId).toBe('d1')
  })
})

describe('normalizeLicenseTerms', () => {
  it('treats redistribution as a strictly stronger right than export', () => {
    expect(normalizeLicenseTerms({ exportAllowed: false, redistributionAllowed: true })).toEqual({
      licenseReference: null,
      exportAllowed: true,
      redistributionAllowed: true,
      maxExportRecords: null,
      territory: null,
    })
  })

  it('clamps record caps onto non-negative integers or unlimited', () => {
    expect(normalizeLicenseTerms({ exportAllowed: true, maxExportRecords: -5 }).maxExportRecords).toBeNull()
    expect(normalizeLicenseTerms({ exportAllowed: true, maxExportRecords: Number.NaN }).maxExportRecords).toBeNull()
    expect(normalizeLicenseTerms({ exportAllowed: true, maxExportRecords: 10.7 }).maxExportRecords).toBe(10)
    expect(normalizeLicenseTerms({ exportAllowed: true, maxExportRecords: 0 }).maxExportRecords).toBe(0)
  })
})

describe('evaluateDatasetExport', () => {
  const base = {
    license,
    versionStatus: 'published' as const,
    publishedVersionId: 'v1',
    requestedVersionId: 'v1',
    requestedRecordCount: 100,
    atMs: 5000,
  }

  it('allows a licensed export of the published head', () => {
    expect(evaluateDatasetExport(base)).toEqual({ outcome: 'allowed', effectiveVersionId: 'v1' })
  })

  it('refuses an unpublished version above every other rule', () => {
    expect(
      evaluateDatasetExport({ ...base, versionStatus: 'draft', license: { ...license, exportAllowed: true } }),
    ).toEqual({ outcome: 'version_not_published', effectiveVersionId: null })
  })

  it('refuses an unlicensed dataset even for a published version', () => {
    expect(
      evaluateDatasetExport({ ...base, license: { ...license, exportAllowed: false } }),
    ).toEqual({ outcome: 'license_denied', effectiveVersionId: null })
  })

  it('refuses a non-head version on the platform path', () => {
    expect(evaluateDatasetExport({ ...base, requestedVersionId: 'v0' })).toEqual({
      outcome: 'version_not_published',
      effectiveVersionId: null,
    })
  })

  it('enforces the license record cap and rejects invalid counts', () => {
    expect(
      evaluateDatasetExport({ ...base, license: { ...license, maxExportRecords: 50 } }),
    ).toEqual({ outcome: 'record_limit_exceeded', effectiveVersionId: null })
    expect(evaluateDatasetExport({ ...base, requestedRecordCount: -1 })).toEqual({
      outcome: 'record_limit_exceeded',
      effectiveVersionId: null,
    })
    expect(isValidExportRecordCount(0)).toBe(true)
    expect(isValidExportRecordCount(1.5)).toBe(false)
  })
})

describe('evaluateDatasetExport — assignment-governed path', () => {
  const base = {
    license,
    versionStatus: 'published' as const,
    publishedVersionId: 'v1',
    requestedVersionId: 'v1',
    requestedRecordCount: 100,
    atMs: 5000,
  }

  it('allows a snapshot export of the pinned version', () => {
    expect(evaluateDatasetExport({ ...base, assignment: assignment() })).toEqual({
      outcome: 'allowed',
      effectiveVersionId: 'v1',
    })
  })

  it('refuses a snapshot export that asks for another version', () => {
    expect(
      evaluateDatasetExport({ ...base, assignment: assignment(), requestedVersionId: 'v2' }),
    ).toEqual({ outcome: 'assignment_version_mismatch', effectiveVersionId: null })
  })

  it('resolves a live assignment to the published head', () => {
    expect(
      evaluateDatasetExport({
        ...base,
        assignment: assignment({ mode: 'live', datasetVersionId: null }),
      }),
    ).toEqual({ outcome: 'allowed', effectiveVersionId: 'v1' })
  })

  it('refuses an inactive/expired/future assignment', () => {
    expect(
      evaluateDatasetExport({ ...base, assignment: assignment({ status: 'revoked' }) }),
    ).toEqual({ outcome: 'assignment_inactive', effectiveVersionId: null })
    expect(
      evaluateDatasetExport({ ...base, assignment: assignment({ validUntil: 4000 }) }),
    ).toEqual({ outcome: 'assignment_inactive', effectiveVersionId: null })
    expect(
      evaluateDatasetExport({ ...base, assignment: assignment({ validFrom: 9000 }) }),
    ).toEqual({ outcome: 'assignment_inactive', effectiveVersionId: null })
  })

  it('honors an assignment-level export ban as a license denial', () => {
    expect(
      evaluateDatasetExport({ ...base, assignment: assignment(), assignmentExportAllowed: false }),
    ).toEqual({ outcome: 'license_denied', effectiveVersionId: null })
  })
})

describe('export status transitions', () => {
  it('allows pending → completed/rejected and idempotent repeats', () => {
    expect(validateExportStatusChange('pending', 'completed')).toBe('ok')
    expect(validateExportStatusChange('pending', 'rejected')).toBe('ok')
    expect(validateExportStatusChange('completed', 'completed')).toBe('ok')
  })

  it('treats a decided export as terminal audit evidence', () => {
    expect(validateExportStatusChange('completed', 'rejected')).toBe('invalid_state')
    expect(validateExportStatusChange('rejected', 'completed')).toBe('invalid_state')
    expect(isExportDecided('pending')).toBe(false)
    expect(isExportDecided('completed')).toBe(true)
    expect(isExportDecided('rejected')).toBe(true)
  })
})

describe('tenant data path enforcement', () => {
  it('returns only active assignments, ordered by dataset then assignment', () => {
    const access = resolveTenantDatasetAccess(
      [
        assignment({ id: 'a-b', datasetId: 'd2' }),
        assignment({ id: 'a-a', datasetId: 'd2' }),
        assignment({ id: 'a-c', datasetId: 'd1', validUntil: 1000 }),
        assignment({ id: 'a-d', datasetId: 'd3', status: 'revoked' }),
      ],
      5000,
    )
    expect(access.map((a) => `${a.datasetId}:${a.assignmentId}`)).toEqual(['d2:a-a', 'd2:a-b'])
  })

  it('fails closed for a fully inactive set', () => {
    expect(
      resolveTenantDatasetAccess([assignment({ status: 'revoked' })], 5000),
    ).toEqual([])
  })

  it('pins snapshots and lets live access follow the head', () => {
    const snapshot = resolveTenantDatasetAccess([assignment()], 5000)[0]!
    const live = resolveTenantDatasetAccess(
      [assignment({ mode: 'live', datasetVersionId: null })],
      5000,
    )[0]!
    expect(resolveTenantAccessVersionId(snapshot, 'v9')).toBe('v1')
    expect(resolveTenantAccessVersionId(live, 'v9')).toBe('v9')
    expect(resolveTenantAccessVersionId(live, null)).toBeNull()
  })

  it('finds access for one dataset only when an assignment is active', () => {
    const active = [assignment()]
    expect(findTenantDatasetAccess(active, 'd1', 5000)?.assignmentId).toBe('a1')
    expect(findTenantDatasetAccess(active, 'd2', 5000)).toBeNull()
    expect(findTenantDatasetAccess([assignment({ status: 'revoked' })], 'd1', 5000)).toBeNull()
    expect(findTenantDatasetAccess([assignment({ validFrom: 9000 })], 'd1', 5000)).toBeNull()
  })
})
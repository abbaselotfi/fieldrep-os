import { describe, expect, it } from 'vitest'

import {
  DEFAULT_IMPORT_QUALITY_POLICY,
  buildMatchingKey,
  evaluateImportQuality,
  isCandidateDecided,
  isRecordableCandidate,
  normalizeImportQualityPolicy,
  normalizePersianText,
  normalizePhoneKey,
  validateCandidateStatusChange,
  validateImportStatusChange,
  validateNormalizationCounts,
} from './dataset-import'

describe('validateImportStatusChange', () => {
  it('allows received → normalized and received → failed', () => {
    expect(validateImportStatusChange('received', 'normalized')).toBe('ok')
    expect(validateImportStatusChange('received', 'failed')).toBe('ok')
  })

  it('treats a normalized import as immutable (version provenance)', () => {
    expect(validateImportStatusChange('normalized', 'failed')).toBe('invalid_state')
    expect(validateImportStatusChange('normalized', 'received')).toBe('invalid_state')
  })

  it('allows an explicit retry of a failed import back to received', () => {
    expect(validateImportStatusChange('failed', 'received')).toBe('ok')
  })
})

describe('validateNormalizationCounts', () => {
  it('accepts exact partitions', () => {
    expect(validateNormalizationCounts({ rowCount: 100, validCount: 80, invalidCount: 20 })).toBe('ok')
    expect(validateNormalizationCounts({ rowCount: 0, validCount: 0, invalidCount: 0 })).toBe('ok')
  })

  it('rejects partitions that do not cover every row', () => {
    expect(
      validateNormalizationCounts({ rowCount: 100, validCount: 80, invalidCount: 10 }),
    ).toBe('invalid_counts')
    expect(
      validateNormalizationCounts({ rowCount: 100, validCount: 120, invalidCount: 0 }),
    ).toBe('invalid_counts')
  })

  it('rejects negative counts', () => {
    expect(
      validateNormalizationCounts({ rowCount: -1, validCount: 0, invalidCount: -1 }),
    ).toBe('invalid_counts')
  })
})

describe('evaluateImportQuality', () => {
  it('normalizes an import that meets the valid-ratio floor', () => {
    const result = evaluateImportQuality(
      { rowCount: 100, validCount: 90, invalidCount: 10 },
      DEFAULT_IMPORT_QUALITY_POLICY,
    )
    expect(result.outcome).toBe('normalized')
    expect(result.validRatio).toBeCloseTo(0.9)
  })

  it('fails an import below the policy floor or with no rows', () => {
    expect(
      evaluateImportQuality(
        { rowCount: 100, validCount: 40, invalidCount: 60 },
        DEFAULT_IMPORT_QUALITY_POLICY,
      ).outcome,
    ).toBe('failed')
    expect(evaluateImportQuality({ rowCount: 0, validCount: 0, invalidCount: 0 }).outcome).toBe(
      'failed',
    )
  })

  it('honors a zero-tolerance policy (any invalid row fails)', () => {
    expect(
      evaluateImportQuality({ rowCount: 10, validCount: 9, invalidCount: 1 }, { minValidRatio: 1 })
        .outcome,
    ).toBe('failed')
    expect(
      evaluateImportQuality({ rowCount: 10, validCount: 10, invalidCount: 0 }, { minValidRatio: 1 })
        .outcome,
    ).toBe('normalized')
  })
})

describe('normalizeImportQualityPolicy', () => {
  it('clamps the ratio into [0, 1] and falls back to the default', () => {
    expect(normalizeImportQualityPolicy({ minValidRatio: 1.5 })).toEqual({ minValidRatio: 1 })
    expect(normalizeImportQualityPolicy({ minValidRatio: -0.2 })).toEqual({ minValidRatio: 0 })
    expect(normalizeImportQualityPolicy({ minValidRatio: Number.NaN })).toEqual(
      DEFAULT_IMPORT_QUALITY_POLICY,
    )
    expect(normalizeImportQualityPolicy(null)).toEqual(DEFAULT_IMPORT_QUALITY_POLICY)
  })
})

describe('normalizePersianText', () => {
  it('folds Arabic orthography variants onto one Persian form', () => {
    // Arabic yaa vs Persian yaa, Arabic kaf vs Persian kaf.
    expect(normalizePersianText('علي')).toBe(normalizePersianText('علی'))
    expect(normalizePersianText('محمدكريم')).toBe(normalizePersianText('محمدکریم'))
  })

  it('strips ZWNJ, diacritics and tatweel', () => {
    expect(normalizePersianText('علی‌رضا')).toBe('علی رضا')
    expect(normalizePersianText('مُحَمَّــد')).toBe('محمد')
  })

  it('maps Persian and Arabic-Indic digits to ASCII', () => {
    expect(normalizePersianText('۴۵۶')).toBe('456')
    expect(normalizePersianText('٤٥٦')).toBe('456')
  })
})

describe('normalizePhoneKey', () => {
  it('folds country prefixes and leading zeros onto one core', () => {
    expect(normalizePhoneKey('۰۹۱۲ ۳۴۵ ۶۷۸۹')).toBe('9123456789')
    expect(normalizePhoneKey('+98 912 345 6789')).toBe('9123456789')
    expect(normalizePhoneKey('0098-912-345-6789')).toBe('9123456789')
    expect(normalizePhoneKey('9123456789')).toBe('9123456789')
  })
})

describe('buildMatchingKey', () => {
  it('prefers national id, then phone, then normalized name', () => {
    expect(buildMatchingKey({ fullName: 'علی رضایی', nationalId: '۴۵۶۷۸۹۱۲۳۴' })).toBe(
      'nid:4567891234',
    )
    expect(buildMatchingKey({ fullName: 'علی رضایی', phone: '۰۹۱۲-۳۴۵-۶۷۸۹' })).toBe(
      'tel:9123456789',
    )
    expect(buildMatchingKey({ fullName: '  علي   رضايی ' })).toBe('name:علی رضایی')
  })

  it('returns null when no usable identity field is present', () => {
    expect(buildMatchingKey({})).toBeNull()
    expect(buildMatchingKey({ fullName: '   ', phone: 'abc', nationalId: '12' })).toBeNull()
  })

  it('produces the same key for orthographic variants of the same practitioner', () => {
    expect(buildMatchingKey({ fullName: 'علي رضايي', phone: '0912-345-6789' })).toBe(
      buildMatchingKey({ fullName: 'علی‌رضایی', phone: '+98 912 345 6789' }),
    )
  })
})

describe('validateCandidateStatusChange', () => {
  it('allows pending → any decision and idempotent repeats', () => {
    expect(validateCandidateStatusChange('pending', 'merged')).toBe('ok')
    expect(validateCandidateStatusChange('pending', 'kept_both')).toBe('ok')
    expect(validateCandidateStatusChange('pending', 'discarded')).toBe('ok')
  })

  it('treats decisions as terminal', () => {
    expect(validateCandidateStatusChange('merged', 'kept_both')).toBe('invalid_state')
    expect(validateCandidateStatusChange('discarded', 'merged')).toBe('invalid_state')
  })
})

describe('duplicate candidate recordability', () => {
  it('requires a non-empty key and at least two distinct records', () => {
    expect(isRecordableCandidate({ matchKey: 'nid:4567891234', recordRefs: ['r1', 'r2'] })).toBe(
      'ok',
    )
    expect(isRecordableCandidate({ matchKey: 'nid:4567891234', recordRefs: ['r1'] })).toBe(
      'invalid_candidate',
    )
    expect(isRecordableCandidate({ matchKey: '', recordRefs: ['r1', 'r2'] })).toBe(
      'invalid_candidate',
    )
    expect(isRecordableCandidate({ matchKey: 'k', recordRefs: ['r1', 'r1'] })).toBe(
      'invalid_candidate',
    )
  })

  it('reports decided candidates as immutable', () => {
    expect(isCandidateDecided('pending')).toBe(false)
    expect(isCandidateDecided('merged')).toBe(true)
    expect(isCandidateDecided('kept_both')).toBe(true)
    expect(isCandidateDecided('discarded')).toBe(true)
  })
})
import { describe, expect, it } from 'vitest'

import {
  classifyMatchConfidence,
  executeBuildDefinition,
  isMatchDecided,
  isRecordableBuildDefinition,
  normalizeMatchPolicy,
  scoreMatchEvidence,
  validateBuildReadiness,
  validateMatchStatusChange,
} from './dataset-matching'

describe('validateMatchStatusChange', () => {
  it('allows unmatched → candidate/matched/confirmed_unmatched', () => {
    expect(validateMatchStatusChange('unmatched', 'candidate')).toBe('ok')
    expect(validateMatchStatusChange('unmatched', 'matched')).toBe('ok')
    expect(validateMatchStatusChange('unmatched', 'confirmed_unmatched')).toBe('ok')
  })

  it('allows a candidate to be linked or explicitly rejected', () => {
    expect(validateMatchStatusChange('candidate', 'matched')).toBe('ok')
    expect(validateMatchStatusChange('candidate', 'confirmed_unmatched')).toBe('ok')
    expect(validateMatchStatusChange('candidate', 'unmatched')).toBe('invalid_state')
  })

  it('treats review decisions as terminal', () => {
    expect(validateMatchStatusChange('matched', 'candidate')).toBe('invalid_state')
    expect(validateMatchStatusChange('matched', 'confirmed_unmatched')).toBe('invalid_state')
    expect(validateMatchStatusChange('confirmed_unmatched', 'matched')).toBe('invalid_state')
  })

  it('reports decided statuses as immutable', () => {
    expect(isMatchDecided('unmatched')).toBe(false)
    expect(isMatchDecided('candidate')).toBe(false)
    expect(isMatchDecided('matched')).toBe(true)
    expect(isMatchDecided('confirmed_unmatched')).toBe(true)
  })
})

describe('scoreMatchEvidence', () => {
  it('ranks two strong identifiers as an exact identity', () => {
    expect(
      scoreMatchEvidence({ nationalIdEqual: true, phoneEqual: false, nameEqual: true, licenseEqual: false }),
    ).toBe(1)
  })

  it('scores national id or license equality as high confidence', () => {
    expect(
      scoreMatchEvidence({ nationalIdEqual: true, phoneEqual: false, nameEqual: false, licenseEqual: false }),
    ).toBe(0.9)
    expect(
      scoreMatchEvidence({ nationalIdEqual: false, phoneEqual: false, nameEqual: false, licenseEqual: true }),
    ).toBe(0.9)
  })

  it('scores phone+name above phone-only and name-only', () => {
    expect(
      scoreMatchEvidence({ nationalIdEqual: false, phoneEqual: true, nameEqual: true, licenseEqual: false }),
    ).toBe(0.8)
    expect(
      scoreMatchEvidence({ nationalIdEqual: false, phoneEqual: true, nameEqual: false, licenseEqual: false }),
    ).toBe(0.6)
    expect(
      scoreMatchEvidence({ nationalIdEqual: false, phoneEqual: false, nameEqual: true, licenseEqual: false }),
    ).toBe(0.5)
  })

  it('scores empty evidence as no match', () => {
    expect(
      scoreMatchEvidence({ nationalIdEqual: false, phoneEqual: false, nameEqual: false, licenseEqual: false }),
    ).toBe(0)
  })
})

describe('classifyMatchConfidence', () => {
  it('never classifies below the policy as a candidate', () => {
    expect(classifyMatchConfidence(0.5)).toBe('no_match')
    expect(classifyMatchConfidence(0.6)).toBe('candidate')
    expect(classifyMatchConfidence(0.999)).toBe('candidate')
    expect(classifyMatchConfidence(1)).toBe('exact')
  })

  it('honors a stricter policy threshold', () => {
    expect(classifyMatchConfidence(0.7, { candidateMinConfidence: 0.8 })).toBe('no_match')
  })
})

describe('normalizeMatchPolicy', () => {
  it('clamps into [0, 1] and falls back to the default', () => {
    expect(normalizeMatchPolicy({ candidateMinConfidence: 2 })).toEqual({ candidateMinConfidence: 1 })
    expect(normalizeMatchPolicy({ candidateMinConfidence: -1 })).toEqual({ candidateMinConfidence: 0 })
    expect(normalizeMatchPolicy({ candidateMinConfidence: Number.NaN })).toEqual(
      normalizeMatchPolicy(null),
    )
  })
})

describe('dataset build guards', () => {
  const publishedVersion = { status: 'published' as const, recordCount: 500 }

  it('accepts a build from a published, non-empty source with a selective definition', () => {
    expect(
      validateBuildReadiness(publishedVersion, { specialtyIds: ['cardiology'] }),
    ).toBe('ok')
  })

  it('refuses a draft/superseded source version', () => {
    expect(validateBuildReadiness({ status: 'draft', recordCount: 500 }, { specialtyIds: ['x'] })).toBe(
      'invalid_state',
    )
    expect(
      validateBuildReadiness({ status: 'superseded', recordCount: 500 }, { specialtyIds: ['x'] }),
    ).toBe('invalid_state')
  })

  it('refuses an empty source version', () => {
    expect(
      validateBuildReadiness({ status: 'published', recordCount: 0 }, { specialtyIds: ['x'] }),
    ).toBe('invalid_state')
  })

  it('refuses a definition that selects nothing', () => {
    expect(validateBuildReadiness(publishedVersion, {})).toBe('invalid_state')
    expect(validateBuildReadiness(publishedVersion, { specialtyIds: [] })).toBe('invalid_state')
    expect(isRecordableBuildDefinition({ specialtyIds: [] })).toBe(false)
    expect(isRecordableBuildDefinition({ specialtyIds: ['x'] })).toBe(true)
  })
})

describe('executeBuildDefinition', () => {
  const records = [
    { recordRef: 'r1', specialtyId: 'cardiology' },
    { recordRef: 'r2', specialtyId: 'dermatology' },
    { recordRef: 'r3', specialtyId: 'cardiology' },
    { recordRef: 'r4', specialtyId: null },
  ]

  it('keeps only records with a listed specialty', () => {
    expect(executeBuildDefinition(records, { specialtyIds: ['cardiology'] })).toEqual(['r1', 'r3'])
  })

  it('keeps nothing when no specialty matches (never silently widens)', () => {
    expect(executeBuildDefinition(records, { specialtyIds: ['neurology'] })).toEqual([])
  })

  it('keeps all records for an unfiltered definition', () => {
    expect(executeBuildDefinition(records, {})).toEqual(['r1', 'r2', 'r3', 'r4'])
  })
})
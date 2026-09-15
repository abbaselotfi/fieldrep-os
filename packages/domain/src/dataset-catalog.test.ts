import { describe, expect, it } from 'vitest'

import {
  isDatasetStatus,
  isDatasetType,
  isDatasetVersionMutable,
  resolveAssignmentState,
  validateAssignmentMode,
  validateAssignmentWindow,
  validateDatasetVersionStatusChange,
  validatePublicationReadiness,
} from './dataset-catalog'

describe('dataset version lifecycle', () => {
  it('allows draft → published and rejects skipping states', () => {
    expect(validateDatasetVersionStatusChange('draft', 'published')).toBe('ok')
    expect(validateDatasetVersionStatusChange('draft', 'superseded')).toBe('invalid_state')
  })

  it('treats published versions as immutable except supersession', () => {
    expect(validateDatasetVersionStatusChange('published', 'superseded')).toBe('ok')
    expect(validateDatasetVersionStatusChange('published', 'draft')).toBe('invalid_state')
    expect(isDatasetVersionMutable('published')).toBe(false)
    expect(isDatasetVersionMutable('draft')).toBe(true)
  })

  it('makes superseded a terminal state', () => {
    expect(validateDatasetVersionStatusChange('superseded', 'draft')).toBe('invalid_state')
    expect(validateDatasetVersionStatusChange('superseded', 'published')).toBe('invalid_state')
    expect(validateDatasetVersionStatusChange('superseded', 'superseded')).toBe('ok')
  })
})

describe('validatePublicationReadiness', () => {
  it('publishes only a non-empty draft', () => {
    expect(validatePublicationReadiness({ status: 'draft', recordCount: 10 })).toBe('ok')
  })

  it('refuses an empty draft (an empty truth must never be assignable)', () => {
    expect(validatePublicationReadiness({ status: 'draft', recordCount: 0 })).toBe('invalid_state')
  })

  it('refuses republishing a published version', () => {
    expect(validatePublicationReadiness({ status: 'published', recordCount: 10 })).toBe(
      'invalid_state',
    )
  })
})

describe('assignment guards', () => {
  it('accepts open and ordered windows and rejects inverted ones', () => {
    expect(validateAssignmentWindow(null, null)).toBe('ok')
    expect(validateAssignmentWindow(1000, null)).toBe('ok')
    expect(validateAssignmentWindow(1000, 1000)).toBe('ok')
    expect(validateAssignmentWindow(2000, 1000)).toBe('invalid_window')
  })

  it('requires a pinned version for snapshot and forbids it for live', () => {
    expect(validateAssignmentMode('snapshot', 'v1')).toBe('ok')
    expect(validateAssignmentMode('snapshot', null)).toBe('version_required')
    expect(validateAssignmentMode('live', null)).toBe('ok')
    expect(validateAssignmentMode('live', 'v1')).toBe('invalid_state')
  })

  it('resolves fail-closed effective state', () => {
    expect(resolveAssignmentState({ status: 'pending', validFrom: null, validUntil: null }, 1000)).toBe(
      'inactive',
    )
    expect(
      resolveAssignmentState({ status: 'active', validFrom: 5000, validUntil: null }, 1000),
    ).toBe('inactive')
    expect(
      resolveAssignmentState({ status: 'active', validFrom: 500, validUntil: 1000 }, 1000),
    ).toBe('inactive')
    expect(
      resolveAssignmentState({ status: 'active', validFrom: 500, validUntil: 1001 }, 1000),
    ).toBe('active')
    expect(resolveAssignmentState({ status: 'active', validFrom: null, validUntil: null }, 1000)).toBe(
      'active',
    )
  })
})

describe('dataset field guards', () => {
  it('accepts only known statuses and types', () => {
    expect(isDatasetStatus('published')).toBe(true)
    expect(isDatasetStatus('deleted')).toBe(false)
    expect(isDatasetType('practitioners')).toBe(true)
    expect(isDatasetType('doctors')).toBe(false)
  })
})
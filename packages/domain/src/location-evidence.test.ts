import { describe, expect, it } from 'vitest'

import {
  deriveLocationCaptureMode,
  validateLocationEvidenceInput,
} from './location-evidence'

const validInput = {
  visitId: 'visit-1',
  coordinates: { latitude: 35.6892, longitude: 51.389, accuracy: 12 },
  altitude: 1200,
  captureMode: 'gps' as const,
  capturedAt: 1_788_000_000_000,
}

describe('validateLocationEvidenceInput', () => {
  it('accepts a well-formed GPS fix', () => {
    expect(validateLocationEvidenceInput(validInput)).toEqual({ valid: true, issues: [] })
  })

  it('rejects out-of-range latitudes', () => {
    const result = validateLocationEvidenceInput({
      ...validInput,
      coordinates: { ...validInput.coordinates, latitude: 91 },
    })
    expect(result.valid).toBe(false)
    expect(result.issues).toEqual([
      { code: 'latitude_out_of_range', field: 'coordinates.latitude' },
    ])
  })

  it('rejects out-of-range longitudes', () => {
    const result = validateLocationEvidenceInput({
      ...validInput,
      coordinates: { ...validInput.coordinates, longitude: -181 },
    })
    expect(result.valid).toBe(false)
    expect(result.issues[0]?.code).toBe('longitude_out_of_range')
  })

  it('rejects negative accuracy but allows null accuracy', () => {
    const negative = validateLocationEvidenceInput({
      ...validInput,
      coordinates: { ...validInput.coordinates, accuracy: -5 },
    })
    expect(negative.issues[0]?.code).toBe('accuracy_negative')

    const nullAccuracy = validateLocationEvidenceInput({
      ...validInput,
      coordinates: { ...validInput.coordinates, accuracy: null },
    })
    expect(nullAccuracy.valid).toBe(true)
  })

  it('rejects invalid capture modes', () => {
    const result = validateLocationEvidenceInput({
      ...validInput,
      captureMode: 'bluetooth' as never,
    })
    expect(result.valid).toBe(false)
    expect(result.issues[0]?.code).toBe('invalid_capture_mode')
  })

  it('rejects non-positive capture timestamps', () => {
    const result = validateLocationEvidenceInput({ ...validInput, capturedAt: 0 })
    expect(result.valid).toBe(false)
    expect(result.issues[0]?.code).toBe('captured_at_invalid')
  })
})

describe('deriveLocationCaptureMode', () => {
  it('marks offline captures regardless of accuracy', () => {
    expect(deriveLocationCaptureMode({ online: false, accuracyMeters: 5 })).toBe('offline')
    expect(deriveLocationCaptureMode({ online: false, accuracyMeters: null })).toBe('offline')
  })

  it('classifies accurate online fixes as gps', () => {
    expect(deriveLocationCaptureMode({ online: true, accuracyMeters: 12 })).toBe('gps')
    expect(deriveLocationCaptureMode({ online: true, accuracyMeters: 50 })).toBe('gps')
  })

  it('classifies coarse online fixes as network', () => {
    expect(deriveLocationCaptureMode({ online: true, accuracyMeters: 1200 })).toBe('network')
  })

  it('treats missing accuracy as gps', () => {
    expect(deriveLocationCaptureMode({ online: true, accuracyMeters: null })).toBe('gps')
  })
})
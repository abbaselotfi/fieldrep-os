import type {
  VisitId,
  WorkspaceId,
  UserId,
} from './identity'

/**
 * Location evidence captured at the moment a visit/report is recorded
 * (OFFLINE-SYNC-SPEC §22). Preserved verbatim through sync — the server
 * stores the client capture timestamp and later records its own receipt time.
 */
export type LocationCaptureMode = 'gps' | 'network' | 'manual' | 'offline'

export interface LocationCoordinates {
  latitude: number
  longitude: number
  accuracy: number | null
}

export interface LocationEvidence {
  id: string
  workspaceId: WorkspaceId
  visitId: VisitId
  ownerUserId: UserId
  coordinates: LocationCoordinates
  altitude: number | null
  captureMode: LocationCaptureMode
  capturedAt: number
  clientOccurredAt: string
  serverReceivedAt: number | null
}

export interface CreateLocationEvidenceInput {
  visitId: VisitId
  coordinates: LocationCoordinates
  altitude?: number | null
  captureMode?: LocationCaptureMode
  capturedAt?: number
}

export type LocationEvidenceValidationCode =
  | 'latitude_out_of_range'
  | 'longitude_out_of_range'
  | 'accuracy_negative'
  | 'captured_at_invalid'
  | 'invalid_capture_mode'

export interface LocationEvidenceValidationIssue {
  code: LocationEvidenceValidationCode
  field: string
}

export interface LocationEvidenceValidationResult {
  valid: boolean
  issues: LocationEvidenceValidationIssue[]
}

const LOCATION_CAPTURE_MODES: readonly LocationCaptureMode[] = [
  'gps',
  'network',
  'manual',
  'offline',
]

/**
 * Validates a client-captured location fix before it is persisted or pushed
 * through sync (P5-A1). Coordinates are WGS-84 decimal degrees; accuracy is
 * expressed in meters as reported by the browser Geolocation API.
 */
export function validateLocationEvidenceInput(
  input: CreateLocationEvidenceInput,
): LocationEvidenceValidationResult {
  const issues: LocationEvidenceValidationIssue[] = []

  const { latitude, longitude, accuracy } = input.coordinates
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    issues.push({ code: 'latitude_out_of_range', field: 'coordinates.latitude' })
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    issues.push({ code: 'longitude_out_of_range', field: 'coordinates.longitude' })
  }
  if (accuracy !== null && (!Number.isFinite(accuracy) || accuracy < 0)) {
    issues.push({ code: 'accuracy_negative', field: 'coordinates.accuracy' })
  }
  if (!Number.isFinite(input.capturedAt ?? Date.now()) || (input.capturedAt ?? 0) <= 0) {
    issues.push({ code: 'captured_at_invalid', field: 'capturedAt' })
  }
  if (input.captureMode !== undefined && !LOCATION_CAPTURE_MODES.includes(input.captureMode)) {
    issues.push({ code: 'invalid_capture_mode', field: 'captureMode' })
  }

  return { valid: issues.length === 0, issues }
}

/**
 * Maps a browser GeolocationPosition onto the domain capture-mode taxonomy.
 * `offline` marks fixes taken while the PWA was offline so auditors can tell
 * device-captured offline evidence from online GPS (Sanofi-style evidence).
 */
export function deriveLocationCaptureMode(input: {
  online: boolean
  accuracyMeters: number | null
}): LocationCaptureMode {
  if (!input.online) return 'offline'
  if (input.accuracyMeters === null) return 'gps'
  return input.accuracyMeters <= 50 ? 'gps' : 'network'
}
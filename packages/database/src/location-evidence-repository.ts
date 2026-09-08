import type { LocationEvidence, UserId, VisitId } from '@fieldrep/domain'
import { validateLocationEvidenceInput } from '@fieldrep/domain'

import type { WorkspaceAtomicDataStore } from './contracts'

export interface RecordLocationEvidenceInput {
  id: string
  visitId: VisitId
  ownerUserId: UserId
  latitude: number
  longitude: number
  accuracyMeters: number | null
  altitudeMeters: number | null
  captureMode: LocationEvidence['captureMode']
  capturedAt: number
  clientOccurredAt: string
}

export interface LocationEvidenceRepository {
  recordEvidence(input: RecordLocationEvidenceInput): Promise<LocationEvidence>
  getEvidenceForVisit(ownerUserId: UserId, visitId: VisitId): Promise<LocationEvidence | null>
}

interface EvidenceRow {
  id: string
  workspace_id: string
  visit_id: string
  owner_user_id: string
  latitude: number
  longitude: number
  accuracy_m: number | null
  altitude_m: number | null
  capture_mode: LocationEvidence['captureMode']
  captured_at: number
  client_occurred_at: string
  server_received_at: number | null
}

export class WorkspaceLocationEvidenceRepository implements LocationEvidenceRepository {
  constructor(
    private readonly store: WorkspaceAtomicDataStore,
    private readonly now: () => number = Date.now,
  ) {}

  async recordEvidence(input: RecordLocationEvidenceInput): Promise<LocationEvidence> {
    const validation = validateLocationEvidenceInput({
      visitId: input.visitId,
      coordinates: {
        latitude: input.latitude,
        longitude: input.longitude,
        accuracy: input.accuracyMeters,
      },
      altitude: input.altitudeMeters,
      captureMode: input.captureMode,
      capturedAt: input.capturedAt,
    })
    if (!validation.valid) {
      throw new Error(`location_evidence_invalid:${validation.issues[0]?.code ?? 'unknown'}`)
    }

    // Ownership gate: the visit must exist in this workspace and belong to
    // the requesting user (tenant isolation, Veeva-style).
    const visitRow = await this.store.queryFirst<{ id: string }>(
      `SELECT id FROM visits
       WHERE workspace_id = ? AND owner_user_id = ? AND id = ?
       LIMIT 1`,
      [this.store.workspaceId, input.ownerUserId, input.visitId],
    )
    if (visitRow === null) throw new Error('location_evidence_visit_not_found')

    const existing = await this.store.queryFirst<{ id: string }>(
      `SELECT id FROM visit_location_evidence
       WHERE workspace_id = ? AND visit_id = ?
       LIMIT 1`,
      [this.store.workspaceId, input.visitId],
    )
    if (existing !== null) throw new Error('location_evidence_conflict')

    const now = this.now()
    const result = await this.store.execute(
      `INSERT INTO visit_location_evidence (
        id, workspace_id, visit_id, owner_user_id,
        latitude, longitude, accuracy_m, altitude_m, capture_mode,
        captured_at, client_occurred_at, server_received_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.id,
        this.store.workspaceId,
        input.visitId,
        input.ownerUserId,
        input.latitude,
        input.longitude,
        input.accuracyMeters,
        input.altitudeMeters,
        input.captureMode,
        input.capturedAt,
        input.clientOccurredAt,
        now,
        now,
        now,
      ],
    )
    if (!result.success) throw new Error('location_evidence_insert_failed')

    const stored = await this.getEvidenceForVisit(input.ownerUserId, input.visitId)
    if (stored === null) throw new Error('location_evidence_readback_failed')
    return stored
  }

  async getEvidenceForVisit(
    ownerUserId: UserId,
    visitId: VisitId,
  ): Promise<LocationEvidence | null> {
    const row = await this.store.queryFirst<EvidenceRow>(
      `SELECT id, workspace_id, visit_id, owner_user_id,
              latitude, longitude, accuracy_m, altitude_m, capture_mode,
              captured_at, client_occurred_at, server_received_at
       FROM visit_location_evidence
       WHERE workspace_id = ? AND owner_user_id = ? AND visit_id = ?
       LIMIT 1`,
      [this.store.workspaceId, ownerUserId, visitId],
    )
    return row === null ? null : mapEvidence(row)
  }
}

function mapEvidence(row: EvidenceRow): LocationEvidence {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    visitId: row.visit_id,
    ownerUserId: row.owner_user_id,
    coordinates: {
      latitude: row.latitude,
      longitude: row.longitude,
      accuracy: row.accuracy_m,
    },
    altitude: row.altitude_m,
    captureMode: row.capture_mode,
    capturedAt: row.captured_at,
    clientOccurredAt: row.client_occurred_at,
    serverReceivedAt: row.server_received_at,
  }
}
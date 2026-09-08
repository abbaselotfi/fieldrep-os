import type { UserId, VisitId, VisitVerificationResult } from '@fieldrep/domain'

import type { WorkspaceAtomicDataStore } from './contracts'

export interface SaveVisitVerificationInput {
  id: string
  visitId: VisitId
  ownerUserId: UserId
  result: VisitVerificationResult
}

export interface VisitVerificationRepository {
  saveResult(input: SaveVisitVerificationInput): Promise<VisitVerificationResult>
  getResultForVisit(ownerUserId: UserId, visitId: VisitId): Promise<VisitVerificationResult | null>
}

interface VerificationRow {
  status: VisitVerificationResult['status']
  distance_m: number | null
  accuracy_m: number | null
  policy_radius_m: number
  reasons_json: string
}

export class WorkspaceVisitVerificationRepository implements VisitVerificationRepository {
  constructor(
    private readonly store: WorkspaceAtomicDataStore,
    private readonly now: () => number = Date.now,
  ) {}

  async saveResult(input: SaveVisitVerificationInput): Promise<VisitVerificationResult> {
    const now = this.now()
    // Re-evaluation replaces the previous decision (latest decision wins,
    // with reason codes preserved for the audit trail).
    const result = await this.store.execute(
      `INSERT INTO visit_verification_results (
        id, workspace_id, visit_id, owner_user_id,
        status, distance_m, accuracy_m, policy_radius_m, reasons_json, evaluated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (visit_id) DO UPDATE SET
        status = excluded.status,
        distance_m = excluded.distance_m,
        accuracy_m = excluded.accuracy_m,
        policy_radius_m = excluded.policy_radius_m,
        reasons_json = excluded.reasons_json,
        evaluated_at = excluded.evaluated_at`,
      [
        input.id,
        this.store.workspaceId,
        input.visitId,
        input.ownerUserId,
        input.result.status,
        input.result.distanceMeters,
        input.result.accuracyMeters,
        input.result.policyRadiusMeters,
        JSON.stringify(input.result.reasons),
        now,
      ],
    )
    if (!result.success) throw new Error('visit_verification_persist_failed')

    const stored = await this.getResultForVisit(input.ownerUserId, input.visitId)
    if (stored === null) throw new Error('visit_verification_readback_failed')
    return stored
  }

  async getResultForVisit(
    ownerUserId: UserId,
    visitId: VisitId,
  ): Promise<VisitVerificationResult | null> {
    const row = await this.store.queryFirst<VerificationRow>(
      `SELECT status, distance_m, accuracy_m, policy_radius_m, reasons_json
       FROM visit_verification_results
       WHERE workspace_id = ? AND owner_user_id = ? AND visit_id = ?
       LIMIT 1`,
      [this.store.workspaceId, ownerUserId, visitId],
    )
    if (row === null) return null

    return {
      status: row.status,
      distanceMeters: row.distance_m,
      accuracyMeters: row.accuracy_m,
      policyRadiusMeters: row.policy_radius_m,
      reasons: JSON.parse(row.reasons_json) as VisitVerificationResult['reasons'],
    }
  }
}
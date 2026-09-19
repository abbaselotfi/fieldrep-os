import type { GuardResult } from './dataset-catalog'

/**
 * Data lifecycle & recovery contracts (P12-A3).
 *
 * Mirrors SECURITY-THREAT-MODEL §29: suspension, archival, retention
 * expiration, legal hold and final deletion are *separate* concepts — never a
 * casual hard-delete cascade. Also covers the backup/DR verification ledger:
 * a restore drill only counts once its RPO/RTO are measured. Pure contracts +
 * deterministic guards — no storage access here.
 */

export type LifecycleStatus = 'active' | 'suspended' | 'archived' | 'purge_requested' | 'purged'

export type LifecycleAction =
  | 'suspend'
  | 'resume'
  | 'archive'
  | 'restore'
  | 'request_purge'
  | 'complete_purge'
  | 'place_legal_hold'
  | 'release_legal_hold'

export interface LifecycleSubject {
  status: LifecycleStatus
  legalHoldActive: boolean
  suspendedAtMs: number | null
  archivedAtMs: number | null
}

export const ACTIVE_LIFECYCLE_SUBJECT: LifecycleSubject = {
  status: 'active',
  legalHoldActive: false,
  suspendedAtMs: null,
  archivedAtMs: null,
}

export type LifecycleGuardResult =
  | 'ok'
  | 'invalid_state'
  | 'legal_hold_blocked'
  | 'retention_not_expired'

const LIFECYCLE_TRANSITIONS: Readonly<Record<LifecycleStatus, readonly LifecycleAction[]>> = {
  active: ['suspend', 'archive', 'place_legal_hold', 'release_legal_hold'],
  suspended: ['resume', 'archive', 'place_legal_hold', 'release_legal_hold'],
  // Archived data may only leave the archive back to active, or onward to a
  // purged state once retention has run out and no legal hold stands.
  archived: ['restore', 'request_purge', 'place_legal_hold', 'release_legal_hold'],
  purge_requested: ['complete_purge'],
  // Final: a purged subject is history, not a configurable entity.
  purged: [],
}

/**
 * §29 order of operations, enforced: suspend is reversible, archival starts
 * the retention countdown, a purge is only requestable on archived data whose
 * retention has expired without a legal hold, and a legal hold blocks every
 * destructive step.
 */
export function validateLifecycleAction(
  subject: LifecycleSubject,
  action: LifecycleAction,
  atMs: number,
  policy: RetentionPolicy = DEFAULT_RETENTION_POLICY,
): LifecycleGuardResult {
  const allowed = LIFECYCLE_TRANSITIONS[subject.status]
  if (!allowed.includes(action)) return 'invalid_state'

  const destructive = action === 'request_purge' || action === 'complete_purge'
  if (destructive && subject.legalHoldActive) return 'legal_hold_blocked'

  if (action === 'request_purge' && !isRetentionExpired(subject, policy, atMs)) {
    return 'retention_not_expired'
  }
  return 'ok'
}

export interface RetentionPolicy {
  /** Days an archived subject waits before it is purge-eligible. */
  purgeAfterDays: number
}

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = { purgeAfterDays: 365 }

export function normalizeRetentionPolicy(
  value: Partial<RetentionPolicy> | null | undefined,
): RetentionPolicy {
  const purgeAfterDays = value?.purgeAfterDays
  if (purgeAfterDays === undefined || !Number.isFinite(purgeAfterDays) || purgeAfterDays < 30) {
    return DEFAULT_RETENTION_POLICY
  }
  return { purgeAfterDays: Math.floor(purgeAfterDays) }
}

const MS_PER_DAY = 86_400_000

export function retentionDueAtMs(archivedAtMs: number, policy: RetentionPolicy): number {
  return archivedAtMs + normalizeRetentionPolicy(policy).purgeAfterDays * MS_PER_DAY
}

export function isRetentionExpired(
  subject: LifecycleSubject,
  policy: RetentionPolicy,
  atMs: number,
): boolean {
  if (subject.archivedAtMs === null) return false
  return retentionDueAtMs(subject.archivedAtMs, policy) <= atMs
}

/** Applies one lifecycle action to a subject (guards must pass first). */
export function applyLifecycleAction(
  subject: LifecycleSubject,
  action: LifecycleAction,
  atMs: number,
): LifecycleSubject {
  switch (action) {
    case 'suspend':
      return { ...subject, status: 'suspended', suspendedAtMs: subject.suspendedAtMs ?? atMs }
    case 'resume':
      return { ...subject, status: 'active', suspendedAtMs: null }
    case 'archive':
      return { ...subject, status: 'archived', archivedAtMs: subject.archivedAtMs ?? atMs }
    case 'restore':
      return { ...subject, status: 'active', archivedAtMs: null }
    case 'request_purge':
      return { ...subject, status: 'purge_requested' }
    case 'complete_purge':
      return { ...subject, status: 'purged' }
    case 'place_legal_hold':
      return { ...subject, legalHoldActive: true }
    case 'release_legal_hold':
      return { ...subject, legalHoldActive: false }
  }
}

/** Every mutation of a lifecycle subject must be explainable in the ledger. */
export interface LifecycleEventInput {
  id: string
  action: LifecycleAction
  companyId: string
  workspaceId?: string | null | undefined
  performedBy?: string | undefined
  reason?: string | undefined
  atMs: number
}

export interface LifecycleEvent {
  id: string
  action: LifecycleAction
  companyId: string
  workspaceId: string | null
  performedBy: string | null
  reason: string | null
  atMs: number
}

export function isRecordableLifecycleEvent(
  input: Pick<LifecycleEventInput, 'id' | 'action' | 'companyId'>,
): GuardResult {
  return input.id.trim() !== '' && input.companyId.trim() !== '' && input.action.trim() !== ''
    ? 'ok'
    : 'invalid_state'
}

/**
 * Event-sourced subject: folds the ordered lifecycle ledger back into the
 * current subject so guards always evaluate against replayed reality, never a
 * separately-maintained (and drift-prone) status column.
 */
export function replayLifecycleSubject(events: readonly LifecycleEvent[]): LifecycleSubject {
  const ordered = [...events].sort((a, b) => a.atMs - b.atMs || a.id.localeCompare(b.id))
  let subject = ACTIVE_LIFECYCLE_SUBJECT
  for (const event of ordered) {
    subject = applyLifecycleAction(subject, event.action, event.atMs)
  }
  return subject
}

/**
 * Backup / DR verification ledger. A drill starts against a concrete backup
 * reference and only *completes* when its recovery metrics are recorded — a
 * restore that cannot state its RPO/RTO proves nothing.
 */
export type BackupScope = 'control_plane' | 'workspace'

export type BackupDrillStatus = 'in_progress' | 'passed' | 'failed'

export interface BackupDrillRecord {
  id: string
  scope: BackupScope
  /** Workspace id for workspace-scoped drills; null for the control plane. */
  targetId: string | null
  backupReference: string
  startedAtMs: number
  completedAtMs: number | null
  result: 'passed' | 'failed' | null
  verifiedBy: string | null
  rpoMinutes: number | null
  rtoMinutes: number | null
  notes: string | null
}

export interface StartBackupDrillInput {
  id: string
  scope: BackupScope
  targetId?: string | null | undefined
  backupReference: string
  performedBy?: string | undefined
  notes?: string | undefined
}

export interface CompleteBackupDrillInput {
  id: string
  result: 'passed' | 'failed'
  completedAtMs: number
  verifiedBy?: string | undefined
  rpoMinutes?: number | null | undefined
  rtoMinutes?: number | null | undefined
  notes?: string | undefined
}

export type DrillGuardResult = 'ok' | 'invalid_state' | 'metrics_required'

export function startBackupDrill(
  input: StartBackupDrillInput,
  atMs: number,
): BackupDrillRecord | { error: 'invalid_drill' } {
  const targetOk = input.scope === 'control_plane' || (input.targetId ?? '').trim() !== ''
  if (input.id.trim() === '' || input.backupReference.trim() === '' || !targetOk) {
    return { error: 'invalid_drill' }
  }
  return {
    id: input.id,
    scope: input.scope,
    targetId: input.targetId ?? null,
    backupReference: input.backupReference,
    startedAtMs: atMs,
    completedAtMs: null,
    result: null,
    verifiedBy: input.performedBy ?? null,
    rpoMinutes: null,
    rtoMinutes: null,
    notes: input.notes ?? null,
  }
}

/**
 * Completion guards: only an in-progress drill completes, and a *passed*
 * drill must carry both recovery metrics (a failed one may close with a
 * note instead). Decided drills are immutable audit evidence.
 */
export function validateDrillCompletion(
  record: BackupDrillRecord,
  input: CompleteBackupDrillInput,
): DrillGuardResult {
  if (record.completedAtMs !== null) return 'invalid_state'
  if (input.result === 'failed') return 'ok'
  const rpo = input.rpoMinutes
  const rto = input.rtoMinutes
  if (
    rpo === undefined ||
    rpo === null ||
    !Number.isFinite(rpo) ||
    rpo < 0 ||
    rto === undefined ||
    rto === null ||
    !Number.isFinite(rto) ||
    rto < 0
  ) {
    return 'metrics_required'
  }
  return 'ok'
}

/** True when the latest drill for a target actually proved recoverability. */
export function isRecoverabilityProven(
  drills: readonly BackupDrillRecord[],
  atMs: number,
  maxAgeDays: number,
): boolean {
  const decided = drills
    .filter((drill) => drill.result !== null && drill.completedAtMs !== null)
    .sort((a, b) => (b.completedAtMs ?? 0) - (a.completedAtMs ?? 0))
  const latest = decided[0]
  if (latest === undefined || latest.result !== 'passed') return false
  const ageMs = atMs - (latest.completedAtMs ?? 0)
  return ageMs <= maxAgeDays * MS_PER_DAY
}

/** Non-negative integer recovery metric, or null. */
export function normalizeRecoveryMinutes(
  value: number | null | undefined,
): number | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return null
  return Math.floor(value)
}
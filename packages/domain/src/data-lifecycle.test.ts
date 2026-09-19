import { describe, expect, it } from 'vitest'

import {
  ACTIVE_LIFECYCLE_SUBJECT,
  applyLifecycleAction,
  isRecordableLifecycleEvent,
  isRecoverabilityProven,
  isRetentionExpired,
  normalizeRecoveryMinutes,
  normalizeRetentionPolicy,
  retentionDueAtMs,
  startBackupDrill,
  validateDrillCompletion,
  validateLifecycleAction,
  type BackupDrillRecord,
} from './data-lifecycle'

const DAY = 86_400_000

describe('validateLifecycleAction', () => {
  it('allows reversible suspension and archival from active', () => {
    expect(validateLifecycleAction(ACTIVE_LIFECYCLE_SUBJECT, 'suspend', 1_000)).toBe('ok')
    expect(validateLifecycleAction(ACTIVE_LIFECYCLE_SUBJECT, 'archive', 1_000)).toBe('ok')
    expect(validateLifecycleAction(ACTIVE_LIFECYCLE_SUBJECT, 'request_purge', 1_000)).toBe(
      'invalid_state',
    )
    expect(validateLifecycleAction(ACTIVE_LIFECYCLE_SUBJECT, 'complete_purge', 1_000)).toBe(
      'invalid_state',
    )
  })

  it('resumes only a suspended subject', () => {
    const suspended = applyLifecycleAction(ACTIVE_LIFECYCLE_SUBJECT, 'suspend', 1_000)
    expect(validateLifecycleAction(suspended, 'resume', 2_000)).toBe('ok')
    expect(validateLifecycleAction(ACTIVE_LIFECYCLE_SUBJECT, 'resume', 2_000)).toBe('invalid_state')
  })

  it('restores only an archived subject', () => {
    const archived = applyLifecycleAction(ACTIVE_LIFECYCLE_SUBJECT, 'archive', 1_000)
    expect(validateLifecycleAction(archived, 'restore', 2_000)).toBe('ok')
    expect(validateLifecycleAction(archived, 'suspend', 2_000)).toBe('invalid_state')
  })

  it('gates a purge on archival + retention expiry and blocks it behind a legal hold', () => {
    const archived = applyLifecycleAction(ACTIVE_LIFECYCLE_SUBJECT, 'archive', 1_000)
    expect(validateLifecycleAction(archived, 'request_purge', 2_000)).toBe('retention_not_expired')

    const expiredAt = retentionDueAtMs(1_000, { purgeAfterDays: 365 })
    expect(validateLifecycleAction(archived, 'request_purge', expiredAt)).toBe('ok')

    const held = applyLifecycleAction(archived, 'place_legal_hold', 2_000)
    expect(validateLifecycleAction(held, 'request_purge', expiredAt)).toBe('legal_hold_blocked')
  })

  it('completes only a requested purge and never leaves the terminal state', () => {
    const archived = applyLifecycleAction(ACTIVE_LIFECYCLE_SUBJECT, 'archive', 1_000)
    const requested = applyLifecycleAction(archived, 'request_purge', retentionDueAtMs(1_000, { purgeAfterDays: 365 }))
    expect(validateLifecycleAction(requested, 'complete_purge', 10_000)).toBe('ok')

    const purged = applyLifecycleAction(requested, 'complete_purge', 10_000)
    expect(validateLifecycleAction(purged, 'resume', 11_000)).toBe('invalid_state')
    expect(validateLifecycleAction(purged, 'archive', 11_000)).toBe('invalid_state')
    expect(validateLifecycleAction(purged, 'place_legal_hold', 11_000)).toBe('invalid_state')
  })
})

describe('retention clock', () => {
  it('normalizes a policy with a 30-day floor', () => {
    expect(normalizeRetentionPolicy({ purgeAfterDays: 10 })).toEqual({ purgeAfterDays: 365 })
    expect(normalizeRetentionPolicy({ purgeAfterDays: 30.9 })).toEqual({ purgeAfterDays: 30 })
    expect(normalizeRetentionPolicy(null)).toEqual({ purgeAfterDays: 365 })
  })

  it('computes the purge due date from the archival moment', () => {
    expect(retentionDueAtMs(1_000, { purgeAfterDays: 30 })).toBe(1_000 + 30 * DAY)
    expect(
      isRetentionExpired(
        applyLifecycleAction(ACTIVE_LIFECYCLE_SUBJECT, 'archive', 1_000),
        { purgeAfterDays: 30 },
        1_000 + 29 * DAY,
      ),
    ).toBe(false)
    expect(
      isRetentionExpired(
        applyLifecycleAction(ACTIVE_LIFECYCLE_SUBJECT, 'archive', 1_000),
        { purgeAfterDays: 30 },
        1_000 + 30 * DAY,
      ),
    ).toBe(true)
  })

  it('never expires a subject that was never archived', () => {
    expect(isRetentionExpired(ACTIVE_LIFECYCLE_SUBJECT, { purgeAfterDays: 30 }, 9e12)).toBe(false)
  })
})

describe('applyLifecycleAction', () => {
  it('keeps provenance timestamps on suspend and clears them on restore', () => {
    const suspended = applyLifecycleAction(ACTIVE_LIFECYCLE_SUBJECT, 'suspend', 5_000)
    expect(suspended.suspendedAtMs).toBe(5_000)
    expect(applyLifecycleAction(suspended, 'resume', 6_000).suspendedAtMs).toBeNull()

    const archived = applyLifecycleAction(suspended, 'archive', 7_000)
    expect(archived.archivedAtMs).toBe(7_000)
    expect(applyLifecycleAction(archived, 'restore', 8_000).archivedAtMs).toBeNull()
  })

  it('toggles the legal hold without touching the lifecycle status', () => {
    const held = applyLifecycleAction(ACTIVE_LIFECYCLE_SUBJECT, 'place_legal_hold', 1_000)
    expect(held.legalHoldActive).toBe(true)
    expect(held.status).toBe('active')
    const released = applyLifecycleAction(held, 'release_legal_hold', 2_000)
    expect(released.legalHoldActive).toBe(false)
  })

  it('requires ids and a company for a ledger event', () => {
    expect(
      isRecordableLifecycleEvent({ id: 'ev1', action: 'suspend', companyId: 'c1' }),
    ).toBe('ok')
    expect(isRecordableLifecycleEvent({ id: ' ', action: 'suspend', companyId: 'c1' })).toBe(
      'invalid_state',
    )
    expect(isRecordableLifecycleEvent({ id: 'ev2', action: 'suspend', companyId: '' })).toBe(
      'invalid_state',
    )
  })
})

describe('backup drill ledger', () => {
  const started = startBackupDrill(
    { id: 'drill-1', scope: 'workspace', targetId: 'w1', backupReference: 'backup://2026-09', performedBy: 'platform-admin-1' },
    1_000,
  )

  it('starts only well-formed drills', () => {
    expect(started).toMatchObject({ id: 'drill-1', result: null, completedAtMs: null })
    expect(
      startBackupDrill({ id: '', scope: 'workspace', targetId: 'w1', backupReference: 'b' }, 1_000),
    ).toEqual({ error: 'invalid_drill' })
    expect(
      startBackupDrill({ id: 'd2', scope: 'workspace', targetId: '', backupReference: 'b' }, 1_000),
    ).toEqual({ error: 'invalid_drill' })
    expect(
      startBackupDrill({ id: 'd3', scope: 'control_plane', backupReference: 'b' }, 1_000),
    ).toMatchObject({ scope: 'control_plane', targetId: null })
  })

  it('completes an in-progress drill with measured RPO/RTO', () => {
    expect(
      validateDrillCompletion(started as BackupDrillRecord, {
        id: 'drill-1',
        result: 'passed',
        completedAtMs: 2_000,
        rpoMinutes: 5,
        rtoMinutes: 30,
      }),
    ).toBe('ok')
  })

  it('refuses a passed drill without recovery metrics', () => {
    expect(
      validateDrillCompletion(started as BackupDrillRecord, {
        id: 'drill-1',
        result: 'passed',
        completedAtMs: 2_000,
      }),
    ).toBe('metrics_required')
    expect(
      validateDrillCompletion(started as BackupDrillRecord, {
        id: 'drill-1',
        result: 'passed',
        completedAtMs: 2_000,
        rpoMinutes: -1,
        rtoMinutes: 10,
      }),
    ).toBe('metrics_required')
  })

  it('allows a failed drill to close with a note and refuses a second completion', () => {
    expect(
      validateDrillCompletion(started as BackupDrillRecord, {
        id: 'drill-1',
        result: 'failed',
        completedAtMs: 2_000,
        notes: 'checksum mismatch on customers',
      }),
    ).toBe('ok')

    const completed: BackupDrillRecord = {
      ...(started as BackupDrillRecord),
      completedAtMs: 2_000,
      result: 'passed',
    }
    expect(
      validateDrillCompletion(completed, {
        id: 'drill-1',
        result: 'failed',
        completedAtMs: 3_000,
      }),
    ).toBe('invalid_state')
  })

  it('normalizes recovery metrics to non-negative integers or null', () => {
    expect(normalizeRecoveryMinutes(12.7)).toBe(12)
    expect(normalizeRecoveryMinutes(-3)).toBeNull()
    expect(normalizeRecoveryMinutes(Number.NaN)).toBeNull()
    expect(normalizeRecoveryMinutes(undefined)).toBeNull()
  })
})

describe('recoverability proof', () => {
  const drill = (overrides: Partial<BackupDrillRecord>): BackupDrillRecord => ({
    id: 'drill-x',
    scope: 'workspace',
    targetId: 'w1',
    backupReference: 'b',
    startedAtMs: 0,
    completedAtMs: null,
    result: null,
    verifiedBy: null,
    rpoMinutes: null,
    rtoMinutes: null,
    notes: null,
    ...overrides,
  })

  it('holds only for the latest *passed* drill inside the freshness window', () => {
    const drills = [
      drill({ id: 'd-old', completedAtMs: 10 * DAY, result: 'passed' }),
      drill({ id: 'd-new', completedAtMs: 40 * DAY, result: 'failed' }),
    ]
    // A newer failure does not erase the requirement — latest decides.
    expect(isRecoverabilityProven(drills, 45 * DAY, 90)).toBe(false)
    expect(
      isRecoverabilityProven(
        [drill({ completedAtMs: 80 * DAY, result: 'passed' }), drill({ completedAtMs: 20 * DAY, result: 'failed' })],
        100 * DAY,
        90,
      ),
    ).toBe(true)
    expect(
      isRecoverabilityProven([drill({ completedAtMs: 5 * DAY, result: 'passed' })], 100 * DAY, 90),
    ).toBe(false)
    expect(isRecoverabilityProven([], 100 * DAY, 90)).toBe(false)
    expect(
      isRecoverabilityProven([drill({ completedAtMs: 10 * DAY, result: null })], 12 * DAY, 90),
    ).toBe(false)
  })
})
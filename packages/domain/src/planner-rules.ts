import type {
  DailyTargetProgress,
  DuplicateConflict,
  DuplicatePolicy,
  PlanEntry,
  VisitProgress,
} from './planner-contracts'

export const EXCEL_PARITY_DUPLICATE_POLICY: DuplicatePolicy = {
  nearbyDayWindow: 1,
  sameDaySeverity: 'error',
  nearbyDaySeverity: 'warning',
}

const DAY_MS = 24 * 60 * 60 * 1000
const DUPLICATE_ACTIVE_STATUSES = new Set<PlanEntry['status']>(['planned', 'completed'])

function assertNonNegativeWholeNumber(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer`)
  }
}

function utcDay(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new RangeError('planDate must use canonical YYYY-MM-DD format')
  }

  const parsed = Date.parse(`${date}T00:00:00.000Z`)
  if (Number.isNaN(parsed)) {
    throw new RangeError('planDate must be a valid calendar date')
  }

  const normalized = new Date(parsed).toISOString().slice(0, 10)
  if (normalized !== date) {
    throw new RangeError('planDate must be a valid calendar date')
  }

  return parsed
}

export function deriveVisitProgress(frequency: number, visited: number): VisitProgress {
  assertNonNegativeWholeNumber(frequency, 'frequency')
  assertNonNegativeWholeNumber(visited, 'visited')

  if (frequency === 0) {
    return {
      frequency,
      visited,
      remaining: 0,
      achievementRatio: null,
      achievementPercent: null,
      status: 'not_required',
    }
  }

  const achievementRatio = visited / frequency
  const status: VisitProgress['status'] =
    visited < frequency ? 'incomplete' : visited === frequency ? 'achieved' : 'over_achieved'

  return {
    frequency,
    visited,
    remaining: Math.max(frequency - visited, 0),
    achievementRatio,
    achievementPercent: achievementRatio * 100,
    status,
  }
}

export function evaluateDailyTarget(target: number, planned: number): DailyTargetProgress {
  assertNonNegativeWholeNumber(target, 'target')
  assertNonNegativeWholeNumber(planned, 'planned')

  const status: DailyTargetProgress['status'] =
    planned < target ? 'below_target' : planned === target ? 'target_met' : 'over_target'

  return {
    target,
    planned,
    remaining: Math.max(target - planned, 0),
    overBy: Math.max(planned - target, 0),
    status,
  }
}

export function findDuplicatePlanConflicts(
  entries: readonly PlanEntry[],
  candidate: PlanEntry,
  policy: DuplicatePolicy = EXCEL_PARITY_DUPLICATE_POLICY,
): DuplicateConflict[] {
  assertNonNegativeWholeNumber(policy.nearbyDayWindow, 'nearbyDayWindow')
  const candidateDay = utcDay(candidate.planDate)

  return entries.flatMap((entry): DuplicateConflict[] => {
    if (entry.id === candidate.id) return []
    if (entry.workspaceId !== candidate.workspaceId) return []
    if (entry.ownerUserId !== candidate.ownerUserId) return []
    if (entry.customerId !== candidate.customerId) return []
    if (!DUPLICATE_ACTIVE_STATUSES.has(entry.status)) return []

    const dayDistance = Math.abs(candidateDay - utcDay(entry.planDate)) / DAY_MS

    if (dayDistance === 0) {
      return [
        {
          entryId: entry.id,
          customerId: entry.customerId,
          existingDate: entry.planDate,
          candidateDate: candidate.planDate,
          dayDistance,
          kind: 'same_day',
          severity: policy.sameDaySeverity,
        },
      ]
    }

    if (dayDistance <= policy.nearbyDayWindow) {
      return [
        {
          entryId: entry.id,
          customerId: entry.customerId,
          existingDate: entry.planDate,
          candidateDate: candidate.planDate,
          dayDistance,
          kind: 'nearby_day',
          severity: policy.nearbyDaySeverity,
        },
      ]
    }

    return []
  })
}

export function countActivePlanEntries(entries: readonly PlanEntry[], date: string): number {
  utcDay(date)
  return entries.filter(
    (entry) =>
      entry.planDate === date &&
      entry.status !== 'cancelled' &&
      entry.status !== 'rescheduled',
  ).length
}

import type { RouteId } from './identity'
import type { PlanningCycleBounds } from './planning-cycle'
import { isDateInPlanningCycle } from './planning-cycle'
import type {
  DailyTargetProgress,
  DuplicateConflict,
  PlanEntry,
  VisitProgress,
} from './planner-contracts'
import {
  countActivePlanEntries,
  deriveVisitProgress,
  evaluateDailyTarget,
  findDuplicatePlanConflicts,
} from './planner-rules'
import type { PlanningConflict, WorkingDayContext } from './working-calendar'
import { evaluatePlanEntryConflicts } from './working-calendar'

export type PlannerIssueCode =
  | 'outside_planning_cycle'
  | 'duplicate_same_day'
  | 'duplicate_nearby_day'
  | 'route_mismatch'
  | 'frequency_already_achieved'
  | 'daily_target_exceeded'
  | 'day_not_plannable'

export interface PlannerIssue {
  code: PlannerIssueCode
  severity: 'error' | 'warning'
}

export interface PlanCandidateEvaluationInput {
  cycle: PlanningCycleBounds
  dailyTarget: number
  existingEntries: readonly PlanEntry[]
  candidate: PlanEntry
  requiredFrequency: number
  visited: number
  customerRouteIds?: readonly RouteId[]
  /**
   * Optional effective working-day context from the calendar constraint
   * service (docs/CALENDAR-ACTIVITY-SPEC.md §17). When provided, a day that
   * disallows planning becomes a hard error and calendar conflicts are
   * returned with the evaluation.
   */
  dayContext?: WorkingDayContext
}

export interface PlanCandidateEvaluation {
  canAdd: boolean
  issues: PlannerIssue[]
  duplicateConflicts: DuplicateConflict[]
  calendarConflicts: PlanningConflict[]
  visitProgress: VisitProgress
  dailyTargetBefore: DailyTargetProgress
  dailyTargetAfter: DailyTargetProgress
}

export function evaluatePlanCandidate(
  input: PlanCandidateEvaluationInput,
): PlanCandidateEvaluation {
  const scopedEntries = input.existingEntries.filter(
    (entry) =>
      entry.workspaceId === input.candidate.workspaceId &&
      entry.ownerUserId === input.candidate.ownerUserId,
  )
  const visitProgress = deriveVisitProgress(input.requiredFrequency, input.visited)
  const plannedBefore = countActivePlanEntries(scopedEntries, input.candidate.planDate)
  const dailyTargetBefore = evaluateDailyTarget(input.dailyTarget, plannedBefore)
  const dailyTargetAfter = evaluateDailyTarget(input.dailyTarget, plannedBefore + 1)
  const duplicateConflicts = findDuplicatePlanConflicts(scopedEntries, input.candidate)
  const issues: PlannerIssue[] = []
  const calendarConflicts =
    input.dayContext === undefined
      ? []
      : evaluatePlanEntryConflicts({
          planDate: input.candidate.planDate,
          dayContext: input.dayContext,
        })

  if (!isDateInPlanningCycle(input.candidate.planDate, input.cycle)) {
    issues.push({ code: 'outside_planning_cycle', severity: 'error' })
  }

  if (input.dayContext !== undefined && !input.dayContext.planningAllowed) {
    issues.push({ code: 'day_not_plannable', severity: 'error' })
  }

  if (duplicateConflicts.some((conflict) => conflict.kind === 'same_day')) {
    issues.push({ code: 'duplicate_same_day', severity: 'error' })
  }

  if (duplicateConflicts.some((conflict) => conflict.kind === 'nearby_day')) {
    issues.push({ code: 'duplicate_nearby_day', severity: 'warning' })
  }

  if (
    input.candidate.routeId !== undefined &&
    input.customerRouteIds !== undefined &&
    !input.customerRouteIds.includes(input.candidate.routeId)
  ) {
    issues.push({ code: 'route_mismatch', severity: 'warning' })
  }

  if (visitProgress.status === 'achieved' || visitProgress.status === 'over_achieved') {
    issues.push({ code: 'frequency_already_achieved', severity: 'warning' })
  }

  if (dailyTargetAfter.status === 'over_target') {
    issues.push({ code: 'daily_target_exceeded', severity: 'warning' })
  }

  return {
    canAdd: !issues.some((issue) => issue.severity === 'error'),
    issues,
    duplicateConflicts,
    calendarConflicts,
    visitProgress,
    dailyTargetBefore,
    dailyTargetAfter,
  }
}

import type { OfficialCalendarEvent } from './official-calendar'
import type { CalendarClosure, CalendarItem, LeaveRequest } from './calendar-activity'
import type { WorkspaceId } from './identity'
import type { PersianWeekdayIndex } from './persian-calendar'
import { canonicalWeekdayIndex } from './persian-calendar'


/**
 * Working-calendar resolution and planning-conflict engine (P3).
 *
 * Implements docs/CALENDAR-ACTIVITY-SPEC.md §5 (working calendar rules),
 * §6 (conflict engine) and §17/§18 (planner + AI service boundaries).
 * The resolver is pure: callers pass authoritative records, the engine never
 * queries UI or persistence and never silently mutates a user's plan.
 */

export const DEFAULT_WORKING_WEEKDAYS: readonly PersianWeekdayIndex[] = [0, 1, 2, 3, 4, 5]

export type CalendarConstraintReason =
  | 'non_working_weekday'
  | 'public_holiday'
  | 'company_closure'
  | 'workspace_closure'
  | 'approved_leave'
  | 'blocking_meeting'
  | 'program_overlap'
  | 'business_trip_active'

export interface WorkingDayContext {
  localDate: string
  isWorkingDay: boolean
  planningAllowed: boolean
  reasons: CalendarConstraintReason[]
  blockingItems: CalendarItem[]
  informationalItems: CalendarItem[]
}

export interface WorkingDayInput {
  workingWeekdays?: readonly PersianWeekdayIndex[]
  officialEvents?: readonly OfficialCalendarEvent[]
  closures?: readonly CalendarClosure[]
  leaveRequests?: readonly LeaveRequest[]
  /** Pre-projected activity items (meetings/programs) overlapping the day. */
  activityItems?: readonly CalendarItem[]
  /** Pre-projected business-trip items overlapping the day. */
  tripItems?: readonly CalendarItem[]
  /**
   * Resolves the canonical local civil date of an ISO timestamp. Defaults to
   * the UTC date; workspace deployments should pass a timezone-aware resolver.
   */
  resolveLocalDate?(isoTimestamp: string): string
}

function defaultResolveLocalDate(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 10)
}

function itemCoversDate(
  item: CalendarItem,
  canonicalDate: string,
  resolveLocalDate: (isoTimestamp: string) => string,
): boolean {
  const startDate = resolveLocalDate(item.startsAt)
  const endDate = resolveLocalDate(item.endsAt)
  return startDate <= canonicalDate && endDate >= canonicalDate
}

/**
 * Resolves the effective working-day context for one civil day from layered
 * rules: working weekdays + official holidays + company/workspace closures +
 * approved leave + blocking activities.
 */
export function resolveWorkingDayContext(
  canonicalDate: string,
  input: WorkingDayInput = {},
): WorkingDayContext {
  const resolveLocalDate = input.resolveLocalDate ?? defaultResolveLocalDate
  const workingWeekdays = input.workingWeekdays ?? DEFAULT_WORKING_WEEKDAYS
  const reasons: CalendarConstraintReason[] = []
  const blockingItems: CalendarItem[] = []
  const informationalItems: CalendarItem[] = []

  const weekday = canonicalWeekdayIndex(canonicalDate)
  if (!workingWeekdays.includes(weekday)) reasons.push('non_working_weekday')

  const holidayEvents = (input.officialEvents ?? []).filter(
    (event) => event.canonicalDate === canonicalDate && event.isHoliday,
  )
  if (holidayEvents.length > 0) reasons.push('public_holiday')
  for (const event of holidayEvents) {
    informationalItems.push({
      id: `official_calendar:${event.id}`,
      workspaceId: '' as WorkspaceId,

      type: 'public_holiday',
      sourceType: 'official_calendar',
      sourceId: event.id,
      title: event.label,
      startsAt: `${canonicalDate}T00:00:00.000Z`,
      endsAt: `${canonicalDate}T23:59:59.999Z`,
      allDay: true,
      scope: 'platform',
      blocksPlanning: true,
      countsAsWorkingActivity: false,
      countsAsVisit: false,
      appearsInReport: true,
      status: 'confirmed',
    })
  }

  for (const closure of input.closures ?? []) {
    if (closure.canonicalDate !== canonicalDate) continue
    reasons.push(closure.level === 'company' ? 'company_closure' : 'workspace_closure')
    blockingItems.push({
      id: `calendar_closure:${closure.id}`,
      workspaceId: closure.workspaceId,
      type: closure.level === 'company' ? 'company_closure' : 'workspace_closure',
      sourceType: 'calendar_closure',
      sourceId: closure.id,
      title: closure.label,
      startsAt: `${canonicalDate}T00:00:00.000Z`,
      endsAt: `${canonicalDate}T23:59:59.999Z`,
      allDay: true,
      scope: closure.level === 'company' ? 'company' : 'workspace',
      blocksPlanning: true,
      countsAsWorkingActivity: false,
      countsAsVisit: false,
      appearsInReport: true,
      status: 'confirmed',
    })
  }

  for (const leave of input.leaveRequests ?? []) {
    if (leave.status !== 'approved') continue
    const startsOn = resolveLocalDate(leave.startsAt)
    const endsOn = resolveLocalDate(leave.endsAt)
    if (startsOn > canonicalDate || endsOn < canonicalDate) continue
    reasons.push('approved_leave')
    blockingItems.push({
      id: `leave_request:${leave.id}`,
      workspaceId: leave.workspaceId,
      type: 'leave',
      sourceType: 'leave_request',
      sourceId: leave.id,
      title: '',
      startsAt: leave.startsAt,
      endsAt: leave.endsAt,
      allDay: leave.type !== 'hourly',
      scope: 'user',
      blocksPlanning: true,
      countsAsWorkingActivity: false,
      countsAsVisit: false,
      appearsInReport: true,
      status: leave.status,
      ownerUserId: leave.userId,
    })
  }

  for (const item of input.activityItems ?? []) {
    if (!itemCoversDate(item, canonicalDate, resolveLocalDate)) continue
    if (item.blocksPlanning) {
      reasons.push(item.type === 'internal_meeting' ? 'blocking_meeting' : 'program_overlap')
      blockingItems.push(item)
    } else {
      informationalItems.push(item)
    }
  }

  let tripActive = false
  for (const trip of input.tripItems ?? []) {
    if (itemCoversDate(trip, canonicalDate, resolveLocalDate)) {
      tripActive = true
      informationalItems.push(trip)
    }
  }
  if (tripActive) reasons.push('business_trip_active')

  const blockingReasons = new Set<CalendarConstraintReason>([
    'non_working_weekday',
    'public_holiday',
    'company_closure',
    'workspace_closure',
    'approved_leave',
  ])
  const blocked = reasons.some((reason) => blockingReasons.has(reason))

  return {
    localDate: canonicalDate,
    isWorkingDay: !blocked,
    planningAllowed: !blocked,
    reasons,
    blockingItems,
    informationalItems,
  }
}

export type PlanningConflictSeverity = 'info' | 'warning' | 'block'

export type PlanningConflictCode =
  | 'non_working_day'
  | 'public_holiday'
  | 'company_closure'
  | 'workspace_closure'
  | 'approved_leave'
  | 'blocking_meeting'
  | 'program_overlap'
  | 'business_trip_destination'

export interface PlanningConflict {
  code: PlanningConflictCode
  severity: PlanningConflictSeverity
  messageKey: string
  sourceItemId?: string
  metadata?: Record<string, unknown>
}

export interface PlanningConflictPolicy {
  nonWorkingDay: PlanningConflictSeverity
  publicHoliday: PlanningConflictSeverity
  companyClosure: PlanningConflictSeverity
  workspaceClosure: PlanningConflictSeverity
  approvedLeave: PlanningConflictSeverity
  blockingMeeting: PlanningConflictSeverity
  programOverlap: PlanningConflictSeverity
  businessTripDestination: PlanningConflictSeverity
}

export const DEFAULT_PLANNING_CONFLICT_POLICY: PlanningConflictPolicy = {
  nonWorkingDay: 'block',
  publicHoliday: 'block',
  companyClosure: 'block',
  workspaceClosure: 'block',
  approvedLeave: 'block',
  blockingMeeting: 'block',
  programOverlap: 'info',
  businessTripDestination: 'info',
}

function reasonConflicts(
  day: WorkingDayContext,
  policy: PlanningConflictPolicy,
): PlanningConflict[] {
  const conflicts: PlanningConflict[] = []
  for (const reason of day.reasons) {
    switch (reason) {
      case 'non_working_weekday':
        conflicts.push({
          code: 'non_working_day',
          severity: policy.nonWorkingDay,
          messageKey: 'calendar.conflict.non_working_day',
          metadata: { localDate: day.localDate },
        })
        break
      case 'public_holiday':
        conflicts.push({
          code: 'public_holiday',
          severity: policy.publicHoliday,
          messageKey: 'calendar.conflict.public_holiday',
          metadata: { localDate: day.localDate },
        })
        break
      case 'company_closure':
        conflicts.push({
          code: 'company_closure',
          severity: policy.companyClosure,
          messageKey: 'calendar.conflict.company_closure',
          metadata: { localDate: day.localDate },
        })
        break
      case 'workspace_closure':
        conflicts.push({
          code: 'workspace_closure',
          severity: policy.workspaceClosure,
          messageKey: 'calendar.conflict.workspace_closure',
          metadata: { localDate: day.localDate },
        })
        break
      case 'approved_leave':
        conflicts.push({
          code: 'approved_leave',
          severity: policy.approvedLeave,
          messageKey: 'calendar.conflict.approved_leave',
          metadata: { localDate: day.localDate },
        })
        break
      case 'business_trip_active':
        conflicts.push({
          code: 'business_trip_destination',
          severity: policy.businessTripDestination,
          messageKey: 'calendar.conflict.business_trip_destination',
          metadata: { localDate: day.localDate },
        })
        break
      case 'blocking_meeting':
      case 'program_overlap':
        // Emitted per item below so the conflict carries the source item id.
        break
    }
  }
  return conflicts
}

function itemConflicts(
  day: WorkingDayContext,
  policy: PlanningConflictPolicy,
): PlanningConflict[] {
  const conflicts: PlanningConflict[] = []
  for (const item of day.blockingItems) {
    if (item.sourceType !== 'calendar_activity') continue
    conflicts.push({
      code: item.type === 'internal_meeting' ? 'blocking_meeting' : 'program_overlap',
      severity:
        item.type === 'internal_meeting' ? policy.blockingMeeting : policy.programOverlap,
      messageKey:
        item.type === 'internal_meeting'
          ? 'calendar.conflict.blocking_meeting'
          : 'calendar.conflict.program_overlap',
      sourceItemId: item.sourceId,
      metadata: { title: item.title, localDate: day.localDate },
    })
  }
  return conflicts
}

/**
 * Evaluates planning conflicts for adding a plan entry on one civil day.
 * Returns reasons with severities; it never modifies the plan itself.
 */
export function evaluatePlanEntryConflicts(
  input: { planDate: string; dayContext: WorkingDayContext },
  policy: PlanningConflictPolicy = DEFAULT_PLANNING_CONFLICT_POLICY,
): PlanningConflict[] {
  if (input.dayContext.localDate !== input.planDate) {
    throw new RangeError('day context localDate must match the evaluated plan date')
  }
  return [...reasonConflicts(input.dayContext, policy), ...itemConflicts(input.dayContext, policy)]
}

/**
 * Evaluates conflicts for a whole planned day (used when confirming a day
 * plan or batch-editing several entries at once).
 */
export function evaluatePlanDayConflicts(
  input: { dayContext: WorkingDayContext },
  policy: PlanningConflictPolicy = DEFAULT_PLANNING_CONFLICT_POLICY,
): PlanningConflict[] {
  return [...reasonConflicts(input.dayContext, policy), ...itemConflicts(input.dayContext, policy)]
}

export function hasBlockingConflict(conflicts: readonly PlanningConflict[]): boolean {
  return conflicts.some((conflict) => conflict.severity === 'block')
}

import type {
  ActivityId,
  CalendarEventId,
  OrganizationUnitId,
  UserId,
  WorkspaceId,
} from './identity'
import { canonicalDateToPersian } from './persian-calendar'

/**
 * Calendar is a unified operational projection. It is never the source of
 * Visit/Frequency/Achievement truth; those metrics continue to derive from
 * authoritative Actual Visit records.
 */
export type CalendarItemType =
  | 'visit'
  | 'pharmacy_visit'
  | 'leave'
  | 'business_trip'
  | 'internal_meeting'
  | 'company_program'
  | 'doctor_program'
  | 'public_holiday'
  | 'company_closure'
  | 'workspace_closure'
  | 'custom_activity'

export type CalendarSourceType =
  | 'visit'
  | 'plan_entry'
  | 'activity'
  | 'leave_request'
  | 'business_trip'
  | 'company_program'
  | 'doctor_program'
  | 'official_calendar'
  | 'calendar_override'

export type CalendarItemStatus =
  | 'draft'
  | 'scheduled'
  | 'active'
  | 'completed'
  | 'cancelled'

export type CalendarScope =
  | { type: 'platform'; id: null }
  | { type: 'company'; id: string }
  | { type: 'workspace'; id: WorkspaceId }
  | { type: 'organization_unit'; id: OrganizationUnitId }
  | { type: 'selected_users'; id: null }
  | { type: 'user'; id: UserId }

export interface CalendarBehavior {
  blocksPlanning: boolean
  countsAsWorkingActivity: boolean
  /**
   * Projection metadata only. KPI code MUST NOT count Calendar rows; it must
   * query authoritative Actual Visits. A true value is allowed only for a
   * projection sourced from an Actual Visit.
   */
  countsAsVisit: boolean
  appearsInReport: boolean
}

export interface CalendarItem {
  id: CalendarEventId
  workspaceId: WorkspaceId
  type: CalendarItemType
  sourceType: CalendarSourceType
  sourceId: string
  title: string
  startsAt: number
  endsAt: number
  localStartDate: string
  localEndDate: string
  allDay: boolean
  scope: CalendarScope
  attendeeUserIds: readonly UserId[]
  behavior: CalendarBehavior
  status: CalendarItemStatus
  locationText: string | null
}

export type ActivityType =
  | 'internal_meeting'
  | 'company_program'
  | 'doctor_program'
  | 'custom_activity'

export type ActivityStatus = 'draft' | 'scheduled' | 'completed' | 'cancelled'

export interface Activity {
  id: ActivityId
  workspaceId: WorkspaceId
  createdByUserId: UserId
  ownerUserId: UserId | null
  type: ActivityType
  title: string
  description: string | null
  startsAt: number
  endsAt: number
  localStartDate: string
  localEndDate: string
  allDay: boolean
  scope: CalendarScope
  attendeeUserIds: readonly UserId[]
  blocksPlanning: boolean
  countsAsWorkingActivity: boolean
  appearsInReport: boolean
  status: ActivityStatus
  locationText: string | null
}

export function validateActivity(activity: Activity): void {
  validateInterval(activity.startsAt, activity.endsAt)
  validateLocalDateRange(activity.localStartDate, activity.localEndDate)
  validateScope(activity.workspaceId, activity.scope, activity.attendeeUserIds)
  if (activity.title.trim() === '') throw new RangeError('activity title is required')
  if (activity.ownerUserId !== null && activity.scope.type === 'user' && activity.scope.id !== activity.ownerUserId) {
    throw new RangeError('user-scoped activity owner must match scope user')
  }
}

export function validateCalendarItem(item: CalendarItem): void {
  validateInterval(item.startsAt, item.endsAt)
  validateLocalDateRange(item.localStartDate, item.localEndDate)
  validateScope(item.workspaceId, item.scope, item.attendeeUserIds)
  if (item.title.trim() === '') throw new RangeError('calendar item title is required')
  if (item.sourceId.trim() === '') throw new RangeError('calendar item sourceId is required')

  if (
    item.behavior.countsAsVisit &&
    !(
      item.sourceType === 'visit' &&
      (item.type === 'visit' || item.type === 'pharmacy_visit')
    )
  ) {
    throw new RangeError('only an Actual Visit projection may carry countsAsVisit=true')
  }

  if (
    item.sourceType === 'activity' &&
    !isActivityType(item.type)
  ) {
    throw new RangeError('generic activity source must use an activity calendar type')
  }
}

export function activityToCalendarItem(
  activity: Activity,
  calendarEventId: CalendarEventId,
): CalendarItem {
  validateActivity(activity)

  const item: CalendarItem = {
    id: calendarEventId,
    workspaceId: activity.workspaceId,
    type: activity.type,
    sourceType: 'activity',
    sourceId: activity.id,
    title: activity.title,
    startsAt: activity.startsAt,
    endsAt: activity.endsAt,
    localStartDate: activity.localStartDate,
    localEndDate: activity.localEndDate,
    allDay: activity.allDay,
    scope: activity.scope,
    attendeeUserIds: [...activity.attendeeUserIds],
    behavior: {
      blocksPlanning: activity.blocksPlanning,
      countsAsWorkingActivity: activity.countsAsWorkingActivity,
      countsAsVisit: false,
      appearsInReport: activity.appearsInReport,
    },
    status: activity.status,
    locationText: activity.locationText,
  }

  validateCalendarItem(item)
  return item
}

export function isCalendarItemVisibleToUser(
  item: Pick<CalendarItem, 'scope' | 'attendeeUserIds'>,
  context: {
    userId: UserId
    workspaceId: WorkspaceId
    organizationUnitIds: ReadonlySet<OrganizationUnitId>
    companyId?: string
  },
): boolean {
  switch (item.scope.type) {
    case 'platform':
      return true
    case 'company':
      return context.companyId !== undefined && item.scope.id === context.companyId
    case 'workspace':
      return item.scope.id === context.workspaceId
    case 'organization_unit':
      return context.organizationUnitIds.has(item.scope.id)
    case 'selected_users':
      return item.attendeeUserIds.includes(context.userId)
    case 'user':
      return item.scope.id === context.userId
  }
}

function validateInterval(startsAt: number, endsAt: number): void {
  if (!Number.isSafeInteger(startsAt) || !Number.isSafeInteger(endsAt)) {
    throw new RangeError('calendar timestamps must be safe integer milliseconds')
  }
  if (endsAt < startsAt) throw new RangeError('calendar end must not precede start')
}

function validateLocalDateRange(localStartDate: string, localEndDate: string): void {
  canonicalDateToPersian(localStartDate)
  canonicalDateToPersian(localEndDate)
  if (localEndDate < localStartDate) {
    throw new RangeError('calendar local end date must not precede local start date')
  }
}

function validateScope(
  workspaceId: WorkspaceId,
  scope: CalendarScope,
  attendeeUserIds: readonly UserId[],
): void {
  if (scope.type === 'workspace' && scope.id !== workspaceId) {
    throw new RangeError('workspace calendar scope must match item workspace')
  }
  if (scope.type === 'selected_users' && attendeeUserIds.length === 0) {
    throw new RangeError('selected_users calendar scope requires at least one attendee')
  }
  if (new Set(attendeeUserIds).size !== attendeeUserIds.length) {
    throw new RangeError('calendar attendee user IDs must be unique')
  }
}

function isActivityType(type: CalendarItemType): type is ActivityType {
  return (
    type === 'internal_meeting' ||
    type === 'company_program' ||
    type === 'doctor_program' ||
    type === 'custom_activity'
  )
}

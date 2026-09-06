import type {
  LocationId,
  OrganizationUnitId,
  UserId,
  WorkspaceId,
} from './identity'
import type { PlanEntry } from './planner-contracts'
import type { OfficialCalendarEvent } from './official-calendar'

/**
 * Operational calendar & activity domain (P3).
 *
 * Contracts and policies follow docs/CALENDAR-ACTIVITY-SPEC.md:
 * the calendar is the user's operational work timeline while the Planner
 * specializes in visit scheduling. Non-visit activities must never be able to
 * increment doctor visit frequency — `countsAsVisit` exists for exactly that
 * boundary and stays `false` for every non-visit category.
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

export type CalendarActivityType = Extract<
  CalendarItemType,
  'internal_meeting' | 'company_program' | 'doctor_program' | 'custom_activity'
>

export interface CalendarActivityPolicy {
  blocksPlanning: boolean
  countsAsWorkingActivity: boolean
  countsAsVisit: boolean
  appearsInReport: boolean
  requiresApproval: boolean
}

/**
 * Default per-category policy. Workspace policy may later override safe
 * fields through company administration (P9), but `countsAsVisit` must remain
 * `false` for non-visit categories by invariant.
 */
export const CALENDAR_ACTIVITY_POLICIES: Readonly<
  Record<CalendarItemType, CalendarActivityPolicy>
> = {
  visit: {
    blocksPlanning: false,
    countsAsWorkingActivity: true,
    countsAsVisit: true,
    appearsInReport: true,
    requiresApproval: false,
  },
  pharmacy_visit: {
    blocksPlanning: false,
    countsAsWorkingActivity: true,
    countsAsVisit: false,
    appearsInReport: true,
    requiresApproval: false,
  },
  leave: {
    blocksPlanning: true,
    countsAsWorkingActivity: false,
    countsAsVisit: false,
    appearsInReport: true,
    requiresApproval: true,
  },
  business_trip: {
    blocksPlanning: false,
    countsAsWorkingActivity: true,
    countsAsVisit: false,
    appearsInReport: true,
    requiresApproval: false,
  },
  internal_meeting: {
    blocksPlanning: true,
    countsAsWorkingActivity: true,
    countsAsVisit: false,
    appearsInReport: true,
    requiresApproval: false,
  },
  company_program: {
    blocksPlanning: false,
    countsAsWorkingActivity: true,
    countsAsVisit: false,
    appearsInReport: true,
    requiresApproval: false,
  },
  doctor_program: {
    blocksPlanning: false,
    countsAsWorkingActivity: true,
    countsAsVisit: false,
    appearsInReport: true,
    requiresApproval: false,
  },
  public_holiday: {
    blocksPlanning: true,
    countsAsWorkingActivity: false,
    countsAsVisit: false,
    appearsInReport: true,
    requiresApproval: false,
  },
  company_closure: {
    blocksPlanning: true,
    countsAsWorkingActivity: false,
    countsAsVisit: false,
    appearsInReport: true,
    requiresApproval: false,
  },
  workspace_closure: {
    blocksPlanning: true,
    countsAsWorkingActivity: false,
    countsAsVisit: false,
    appearsInReport: true,
    requiresApproval: false,
  },
  custom_activity: {
    blocksPlanning: false,
    countsAsWorkingActivity: true,
    countsAsVisit: false,
    appearsInReport: false,
    requiresApproval: false,
  },
}

export type CalendarScope =
  | 'platform'
  | 'company'
  | 'workspace'
  | 'organization_unit'
  | 'selected_users'
  | 'user'

export type CalendarActivityStatus = 'draft' | 'confirmed' | 'cancelled'

/**
 * Persisted workspace activity record for meetings, programs and custom
 * activities. Visits come from plan/visit records; holidays and closures come
 * from policy datasets — none of them are stored in this table.
 */
export interface CalendarActivity {
  id: string
  workspaceId: WorkspaceId
  activityType: CalendarActivityType
  title: string
  description?: string
  scope: Extract<CalendarScope, 'workspace' | 'organization_unit' | 'selected_users' | 'user'>
  organizationUnitId?: OrganizationUnitId
  ownerUserId?: UserId
  targetUserIds: UserId[]
  locationId?: LocationId
  startsAt: string
  endsAt: string
  allDay: boolean
  blocksPlanning: boolean
  countsAsWorkingActivity: boolean
  appearsInReport: boolean
  status: CalendarActivityStatus
  createdByUserId: UserId
  createdAt: string
  updatedAt: string
}

export type LeaveRequestType = 'annual' | 'sick' | 'hourly' | 'emergency' | 'other'

export type LeaveRequestStatus = 'draft' | 'requested' | 'approved' | 'rejected' | 'cancelled'

export interface LeaveRequest {
  id: string
  workspaceId: WorkspaceId
  userId: UserId
  type: LeaveRequestType
  startsAt: string
  endsAt: string
  status: LeaveRequestStatus
  reason?: string
  decidedByUserId?: UserId
  decidedAt?: string
  createdAt: string
  updatedAt: string
}

export interface PlaceContext {
  label: string
  city?: string
  province?: string
}

export type BusinessTripStatus = 'planned' | 'ongoing' | 'completed' | 'cancelled'

export interface BusinessTrip {
  id: string
  workspaceId: WorkspaceId
  userId: UserId
  origin?: PlaceContext
  destination: PlaceContext
  startsAt: string
  endsAt: string
  purpose?: string
  transport?: string
  status: BusinessTripStatus
  createdAt: string
  updatedAt: string
}

export interface CalendarClosure {
  id: string
  workspaceId: WorkspaceId
  level: 'company' | 'workspace'
  canonicalDate: string
  label: string
  createdAt: string
}

export type CalendarSourceType =
  | 'plan_entry'
  | 'calendar_activity'
  | 'leave_request'
  | 'business_trip'
  | 'calendar_closure'
  | 'official_calendar'

export interface CalendarLocationRef {
  locationId?: LocationId
  label?: string
}

/**
 * Unified calendar projection item (docs/CALENDAR-ACTIVITY-SPEC.md §3).
 * Rebuilt from authoritative domain records; never persisted as its own truth.
 */
export interface CalendarItem {
  id: string
  workspaceId: WorkspaceId
  type: CalendarItemType
  sourceType: CalendarSourceType
  sourceId: string
  title: string
  startsAt: string
  endsAt: string
  allDay: boolean
  scope: CalendarScope
  blocksPlanning: boolean
  countsAsWorkingActivity: boolean
  countsAsVisit: boolean
  appearsInReport: boolean
  status: string
  ownerUserId?: UserId
  location?: CalendarLocationRef
}

export function calendarItemFromPlanEntry(
  entry: PlanEntry,
  options: {
    kind?: 'visit' | 'pharmacy_visit'
    title?: string
    customerLocation?: CalendarLocationRef
  } = {},
): CalendarItem {
  const policy = CALENDAR_ACTIVITY_POLICIES[options.kind ?? 'visit']
  return {
    id: `plan_entry:${entry.id}`,
    workspaceId: entry.workspaceId,
    type: options.kind ?? 'visit',
    sourceType: 'plan_entry',
    sourceId: entry.id,
    title: options.title ?? '',
    startsAt: `${entry.planDate}T00:00:00.000Z`,
    endsAt: `${entry.planDate}T23:59:59.999Z`,
    allDay: true,
    scope: 'user',
    blocksPlanning: policy.blocksPlanning,
    countsAsWorkingActivity: policy.countsAsWorkingActivity,
    countsAsVisit: policy.countsAsVisit,
    appearsInReport: policy.appearsInReport,
    status: entry.status,
    ownerUserId: entry.ownerUserId,
    ...(options.customerLocation === undefined ? {} : { location: options.customerLocation }),
  }
}

export function calendarItemFromActivity(activity: CalendarActivity): CalendarItem {
  const policy = CALENDAR_ACTIVITY_POLICIES[activity.activityType]
  const cancelled = activity.status === 'cancelled'
  return {
    id: `calendar_activity:${activity.id}`,
    workspaceId: activity.workspaceId,
    type: activity.activityType,
    sourceType: 'calendar_activity',
    sourceId: activity.id,
    title: activity.title,
    startsAt: activity.startsAt,
    endsAt: activity.endsAt,
    allDay: activity.allDay,
    scope: activity.scope,
    blocksPlanning: cancelled ? false : activity.blocksPlanning,
    countsAsWorkingActivity: cancelled ? false : activity.countsAsWorkingActivity,
    countsAsVisit: policy.countsAsVisit,
    appearsInReport: cancelled ? false : activity.appearsInReport,
    status: activity.status,
    ...(activity.ownerUserId === undefined ? {} : { ownerUserId: activity.ownerUserId }),
    ...(activity.locationId === undefined
      ? {}
      : { location: { locationId: activity.locationId } }),
  }
}

export function calendarItemFromLeaveRequest(leave: LeaveRequest): CalendarItem {
  const policy = CALENDAR_ACTIVITY_POLICIES.leave
  // Only approved leave blocks planning by default; draft/requested remain
  // informational according to docs/CALENDAR-ACTIVITY-SPEC.md §11.
  const approved = leave.status === 'approved'
  return {
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
    blocksPlanning: approved,
    countsAsWorkingActivity: approved ? policy.countsAsWorkingActivity : false,
    countsAsVisit: policy.countsAsVisit,
    appearsInReport: approved ? policy.appearsInReport : false,
    status: leave.status,
    ownerUserId: leave.userId,
  }
}

export function calendarItemFromBusinessTrip(trip: BusinessTrip): CalendarItem {
  const policy = CALENDAR_ACTIVITY_POLICIES.business_trip
  const cancelled = trip.status === 'cancelled'
  return {
    id: `business_trip:${trip.id}`,
    workspaceId: trip.workspaceId,
    type: 'business_trip',
    sourceType: 'business_trip',
    sourceId: trip.id,
    title: trip.destination.label,
    startsAt: trip.startsAt,
    endsAt: trip.endsAt,
    allDay: true,
    scope: 'user',
    blocksPlanning: policy.blocksPlanning,
    countsAsWorkingActivity: cancelled ? false : policy.countsAsWorkingActivity,
    countsAsVisit: policy.countsAsVisit,
    appearsInReport: cancelled ? false : policy.appearsInReport,
    status: trip.status,
    ownerUserId: trip.userId,
  }
}

export function calendarItemFromClosure(closure: CalendarClosure): CalendarItem {
  const type: CalendarItemType =
    closure.level === 'company' ? 'company_closure' : 'workspace_closure'
  const policy = CALENDAR_ACTIVITY_POLICIES[type]
  return {
    id: `calendar_closure:${closure.id}`,
    workspaceId: closure.workspaceId,
    type,
    sourceType: 'calendar_closure',
    sourceId: closure.id,
    title: closure.label,
    startsAt: `${closure.canonicalDate}T00:00:00.000Z`,
    endsAt: `${closure.canonicalDate}T23:59:59.999Z`,
    allDay: true,
    scope: closure.level === 'company' ? 'company' : 'workspace',
    blocksPlanning: policy.blocksPlanning,
    countsAsWorkingActivity: policy.countsAsWorkingActivity,
    countsAsVisit: policy.countsAsVisit,
    appearsInReport: policy.appearsInReport,
    status: 'confirmed',
  }
}

export function calendarItemFromOfficialEvent(event: OfficialCalendarEvent): CalendarItem {
  const policy = CALENDAR_ACTIVITY_POLICIES.public_holiday
  return {
    id: `official_calendar:${event.id}`,
    // Official events belong to the national dataset, not to one workspace.
    workspaceId: '' as WorkspaceId,
    type: 'public_holiday',
    sourceType: 'official_calendar',
    sourceId: event.id,
    title: event.label,
    startsAt: `${event.canonicalDate}T00:00:00.000Z`,
    endsAt: `${event.canonicalDate}T23:59:59.999Z`,
    allDay: true,
    scope: 'platform',
    blocksPlanning: event.isHoliday ? policy.blocksPlanning : false,
    countsAsWorkingActivity: event.isHoliday ? policy.countsAsWorkingActivity : true,
    countsAsVisit: policy.countsAsVisit,
    appearsInReport: event.isHoliday ? policy.appearsInReport : false,
    status: 'confirmed',
  }
}

export interface CalendarProjectionInput {
  planEntries?: readonly PlanEntry[]
  planEntryKind?: 'visit' | 'pharmacy_visit'
  planEntryTitle?(entry: PlanEntry): string
  activities?: readonly CalendarActivity[]
  leaveRequests?: readonly LeaveRequest[]
  businessTrips?: readonly BusinessTrip[]
  closures?: readonly CalendarClosure[]
  officialEvents?: readonly OfficialCalendarEvent[]
  fromDate: string
  toDate: string
  /**
   * Resolves the canonical local civil date of an ISO timestamp. Defaults to
   * the UTC date; workspace deployments should pass a timezone-aware resolver
   * so timestamped activities land on the correct civil day.
   */
  resolveLocalDate?(isoTimestamp: string): string
}

function defaultResolveLocalDate(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 10)
}

function itemOverlapsRange(
  item: CalendarItem,
  fromDate: string,
  toDate: string,
  resolveLocalDate: (isoTimestamp: string) => string,
): boolean {
  const startDate = resolveLocalDate(item.startsAt)
  const endDate = resolveLocalDate(item.endsAt)
  return startDate <= toDate && endDate >= fromDate
}

/**
 * Builds the unified calendar timeline for a date range. The projection is a
 * pure view over authoritative records; it never mutates them and never
 * derives visit KPIs.
 */
export function buildCalendarProjection(input: CalendarProjectionInput): CalendarItem[] {
  const resolveLocalDate = input.resolveLocalDate ?? defaultResolveLocalDate
  const items: CalendarItem[] = []

  for (const entry of input.planEntries ?? []) {
    items.push(
      calendarItemFromPlanEntry(entry, {
        ...(input.planEntryKind === undefined ? {} : { kind: input.planEntryKind }),
        ...(input.planEntryTitle === undefined ? {} : { title: input.planEntryTitle(entry) }),
      }),
    )
  }
  for (const activity of input.activities ?? []) {
    if (activity.status === 'cancelled') continue
    items.push(calendarItemFromActivity(activity))
  }
  for (const leave of input.leaveRequests ?? []) {
    if (leave.status === 'cancelled' || leave.status === 'rejected') continue
    items.push(calendarItemFromLeaveRequest(leave))
  }
  for (const trip of input.businessTrips ?? []) {
    if (trip.status === 'cancelled') continue
    items.push(calendarItemFromBusinessTrip(trip))
  }
  for (const closure of input.closures ?? []) {
    items.push(calendarItemFromClosure(closure))
  }
  for (const event of input.officialEvents ?? []) {
    if (!event.isHoliday) continue
    items.push(calendarItemFromOfficialEvent(event))
  }

  return items
    .filter((item) => itemOverlapsRange(item, input.fromDate, input.toDate, resolveLocalDate))
    .sort((left, right) =>
      left.startsAt === right.startsAt
        ? left.id.localeCompare(right.id)
        : left.startsAt.localeCompare(right.startsAt),
    )
}

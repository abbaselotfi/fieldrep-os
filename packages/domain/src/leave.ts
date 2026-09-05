import type { CalendarItem } from './calendar-contracts'
import type {
  CalendarEventId,
  LeaveRequestId,
  UserId,
  WorkspaceId,
} from './identity'
import { canonicalDateToPersian } from './persian-calendar'

export type LeaveType = 'annual' | 'sick' | 'hourly' | 'emergency' | 'other'
export type LeaveStatus = 'draft' | 'requested' | 'approved' | 'rejected' | 'cancelled'

export interface LeaveRequest {
  id: LeaveRequestId
  workspaceId: WorkspaceId
  userId: UserId
  type: LeaveType
  startsAt: number
  endsAt: number
  localStartDate: string
  localEndDate: string
  allDay: boolean
  reason: string | null
  status: LeaveStatus
  decidedByUserId: UserId | null
  decidedAt: number | null
}

export function validateLeaveRequest(leave: LeaveRequest): void {
  if (!Number.isFinite(leave.startsAt) || !Number.isFinite(leave.endsAt)) {
    throw new RangeError('leave timestamps must be finite')
  }
  if (leave.endsAt < leave.startsAt) throw new RangeError('leave end must not precede start')
  canonicalDateToPersian(leave.localStartDate)
  canonicalDateToPersian(leave.localEndDate)
  if (leave.localEndDate < leave.localStartDate) {
    throw new RangeError('leave local end date must not precede local start date')
  }
  if (leave.status === 'approved' || leave.status === 'rejected') {
    if (leave.decidedByUserId === null || leave.decidedAt === null) {
      throw new RangeError('decided leave requires decision audit fields')
    }
  } else if (leave.decidedByUserId !== null || leave.decidedAt !== null) {
    throw new RangeError('undecided leave must not carry decision audit fields')
  }
}

export function submitLeaveRequest(leave: LeaveRequest): LeaveRequest {
  validateLeaveRequest(leave)
  if (leave.status !== 'draft') throw new Error('only draft leave can be requested')
  return { ...leave, status: 'requested' }
}

export function decideLeaveRequest(
  leave: LeaveRequest,
  decision: 'approved' | 'rejected',
  decidedByUserId: UserId,
  decidedAt: number,
): LeaveRequest {
  validateLeaveRequest(leave)
  if (leave.status !== 'requested') throw new Error('only requested leave can be decided')
  if (decidedByUserId.trim() === '') throw new Error('leave decision actor is required')
  if (!Number.isFinite(decidedAt)) throw new RangeError('leave decision timestamp must be finite')

  const decided: LeaveRequest = {
    ...leave,
    status: decision,
    decidedByUserId,
    decidedAt,
  }
  validateLeaveRequest(decided)
  return decided
}

export function cancelOwnLeaveRequest(leave: LeaveRequest): LeaveRequest {
  validateLeaveRequest(leave)
  if (leave.status !== 'draft' && leave.status !== 'requested') {
    throw new Error('only draft or requested leave can be cancelled by owner')
  }
  return { ...leave, status: 'cancelled' }
}

export function leaveBlocksPlanning(leave: LeaveRequest): boolean {
  return leave.status === 'approved'
}

export function leaveToCalendarItem(
  leave: LeaveRequest,
  calendarEventId: CalendarEventId,
): CalendarItem {
  validateLeaveRequest(leave)

  return {
    id: calendarEventId,
    workspaceId: leave.workspaceId,
    type: 'leave',
    sourceType: 'leave_request',
    sourceId: leave.id,
    title: leaveTitle(leave.type),
    startsAt: leave.startsAt,
    endsAt: leave.endsAt,
    localStartDate: leave.localStartDate,
    localEndDate: leave.localEndDate,
    allDay: leave.allDay,
    scope: { type: 'user', id: leave.userId },
    attendeeUserIds: [leave.userId],
    behavior: {
      blocksPlanning: leaveBlocksPlanning(leave),
      countsAsWorkingActivity: false,
      countsAsVisit: false,
      appearsInReport: true,
    },
    status: leaveCalendarStatus(leave.status),
    locationText: null,
  }
}

function leaveCalendarStatus(status: LeaveStatus): CalendarItem['status'] {
  switch (status) {
    case 'draft':
      return 'draft'
    case 'requested':
      return 'scheduled'
    case 'approved':
      return 'active'
    case 'rejected':
    case 'cancelled':
      return 'cancelled'
  }
}

function leaveTitle(type: LeaveType): string {
  switch (type) {
    case 'annual':
      return 'مرخصی سالانه'
    case 'sick':
      return 'مرخصی استعلاجی'
    case 'hourly':
      return 'مرخصی ساعتی'
    case 'emergency':
      return 'مرخصی اضطراری'
    case 'other':
      return 'مرخصی'
  }
}

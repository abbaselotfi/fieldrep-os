import type { CalendarItem, CalendarScope } from './calendar-contracts'
import type {
  CalendarEventId,
  CompanyProgramId,
  CustomerId,
  DoctorProgramId,
  ProductId,
  UserId,
  WorkspaceId,
} from './identity'
import { canonicalDateToPersian } from './persian-calendar'

export type ProgramStatus = 'draft' | 'scheduled' | 'completed' | 'cancelled'

export type CompanyProgramType =
  | 'launch'
  | 'workshop'
  | 'training'
  | 'conference'
  | 'sales_meeting'
  | 'cycle_meeting'
  | 'other'

export type DoctorProgramType =
  | 'rtd'
  | 'dinner_meeting'
  | 'workshop'
  | 'conference'
  | 'webinar'
  | 'hospital_meeting'
  | 'speaker_program'
  | 'one_to_one'
  | 'custom'

export type ProgramAttendanceStatus =
  | 'invited'
  | 'confirmed'
  | 'attended'
  | 'absent'
  | 'cancelled'

export interface CompanyProgram {
  id: CompanyProgramId
  workspaceId: WorkspaceId
  createdByUserId: UserId
  type: CompanyProgramType
  title: string
  description: string | null
  startsAt: number
  endsAt: number
  localStartDate: string
  localEndDate: string
  allDay: boolean
  scope: CalendarScope
  attendeeUserIds: readonly UserId[]
  locationText: string | null
  countsAsWorkingActivity: boolean
  blocksPlanning: boolean
  appearsInReport: boolean
  status: ProgramStatus
}

export interface DoctorProgramDoctor {
  customerId: CustomerId
  attendance: ProgramAttendanceStatus
}

export interface DoctorProgram {
  id: DoctorProgramId
  workspaceId: WorkspaceId
  createdByUserId: UserId
  type: DoctorProgramType
  title: string
  description: string | null
  startsAt: number
  endsAt: number
  localStartDate: string
  localEndDate: string
  allDay: boolean
  attendeeUserIds: readonly UserId[]
  doctors: readonly DoctorProgramDoctor[]
  productIds: readonly ProductId[]
  locationText: string | null
  costAmountMinor: number | null
  currencyCode: string | null
  reportText: string | null
  countsAsWorkingActivity: boolean
  blocksPlanning: boolean
  appearsInReport: boolean
  status: ProgramStatus
}

export function validateCompanyProgram(program: CompanyProgram): void {
  validateProgramBase(program)
  validateScope(program.workspaceId, program.scope, program.attendeeUserIds)
}

export function validateDoctorProgram(program: DoctorProgram): void {
  validateProgramBase(program)
  if (program.doctors.length === 0) throw new RangeError('doctor program requires at least one doctor')
  if (program.productIds.length === 0) throw new RangeError('doctor program requires at least one product')
  if (new Set(program.doctors.map((doctor) => doctor.customerId)).size !== program.doctors.length) {
    throw new RangeError('doctor program contains duplicate doctors')
  }
  if (new Set(program.productIds).size !== program.productIds.length) {
    throw new RangeError('doctor program contains duplicate products')
  }
  if ((program.costAmountMinor === null) !== (program.currencyCode === null)) {
    throw new RangeError('doctor program cost amount and currency must be provided together')
  }
  if (program.costAmountMinor !== null && (!Number.isSafeInteger(program.costAmountMinor) || program.costAmountMinor < 0)) {
    throw new RangeError('doctor program cost must be a non-negative safe integer')
  }
  if (program.currencyCode !== null && !/^[A-Z]{3}$/u.test(program.currencyCode)) {
    throw new RangeError('doctor program currency must be ISO-4217 style')
  }
}

export function companyProgramToCalendarItem(
  program: CompanyProgram,
  calendarEventId: CalendarEventId,
): CalendarItem {
  validateCompanyProgram(program)
  return {
    id: calendarEventId,
    workspaceId: program.workspaceId,
    type: 'company_program',
    sourceType: 'company_program',
    sourceId: program.id,
    title: program.title,
    startsAt: program.startsAt,
    endsAt: program.endsAt,
    localStartDate: program.localStartDate,
    localEndDate: program.localEndDate,
    allDay: program.allDay,
    scope: program.scope,
    attendeeUserIds: program.attendeeUserIds,
    behavior: {
      blocksPlanning: program.status === 'scheduled' && program.blocksPlanning,
      countsAsWorkingActivity: program.status !== 'cancelled' && program.countsAsWorkingActivity,
      countsAsVisit: false,
      appearsInReport: program.status !== 'cancelled' && program.appearsInReport,
    },
    status: calendarStatus(program.status),
    locationText: program.locationText,
  }
}

export function doctorProgramToCalendarItem(
  program: DoctorProgram,
  calendarEventId: CalendarEventId,
): CalendarItem {
  validateDoctorProgram(program)
  return {
    id: calendarEventId,
    workspaceId: program.workspaceId,
    type: 'doctor_program',
    sourceType: 'doctor_program',
    sourceId: program.id,
    title: program.title,
    startsAt: program.startsAt,
    endsAt: program.endsAt,
    localStartDate: program.localStartDate,
    localEndDate: program.localEndDate,
    allDay: program.allDay,
    scope: { type: 'selected_users', id: null },
    attendeeUserIds: program.attendeeUserIds,
    behavior: {
      blocksPlanning: program.status === 'scheduled' && program.blocksPlanning,
      countsAsWorkingActivity: program.status !== 'cancelled' && program.countsAsWorkingActivity,
      countsAsVisit: false,
      appearsInReport: program.status !== 'cancelled' && program.appearsInReport,
    },
    status: calendarStatus(program.status),
    locationText: program.locationText,
  }
}

function validateProgramBase(program: {
  title: string
  startsAt: number
  endsAt: number
  localStartDate: string
  localEndDate: string
  attendeeUserIds: readonly UserId[]
}): void {
  if (program.title.trim() === '') throw new RangeError('program title is required')
  if (!Number.isFinite(program.startsAt) || !Number.isFinite(program.endsAt) || program.endsAt < program.startsAt) {
    throw new RangeError('program interval is invalid')
  }
  canonicalDateToPersian(program.localStartDate)
  canonicalDateToPersian(program.localEndDate)
  if (program.localEndDate < program.localStartDate) throw new RangeError('program local date range is invalid')
  if (new Set(program.attendeeUserIds).size !== program.attendeeUserIds.length) {
    throw new RangeError('program contains duplicate user attendees')
  }
}

function validateScope(workspaceId: WorkspaceId, scope: CalendarScope, attendees: readonly UserId[]): void {
  if (scope.type === 'workspace' && scope.id !== workspaceId) throw new RangeError('program workspace scope mismatch')
  if (scope.type === 'user' && !attendees.includes(scope.id)) throw new RangeError('user-scoped program must include that user')
  if (scope.type === 'selected_users' && attendees.length === 0) {
    throw new RangeError('selected-users program requires attendees')
  }
}

function calendarStatus(status: ProgramStatus): CalendarItem['status'] {
  switch (status) {
    case 'draft': return 'draft'
    case 'scheduled': return 'scheduled'
    case 'completed': return 'completed'
    case 'cancelled': return 'cancelled'
  }
}

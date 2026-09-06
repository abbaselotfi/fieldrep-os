import type {
  BusinessTrip,
  CalendarActivity,
  CalendarClosure,
  CalendarConstraintReason,
  CalendarItem,
  LeaveRequest,
  OfficialCalendarEvent,
  PersianMonthGrid,
  PlanEntry,
  WorkingDayContext,
} from '@fieldrep/domain'
import {
  addCanonicalCalendarDays,
  buildCalendarProjection,
  canonicalDateToPersian,
  canonicalWeekdayIndex,
  persianWeekBounds,
  resolveWorkingDayContext,
} from '@fieldrep/domain'

import { createPreviewPlanSeed } from '../planner/preview-plan'


/**
 * P3-A8: calendar month/week/day/agenda projections for the Field User UI.
 *
 * The view model is a pure function over authoritative demo/API records plus
 * the domain month-grid engine, so the page stays presentational. Non-visit
 * activities are rendered as context; they never mutate visit KPIs.
 */

export interface CalendarSourceRecords {
  planEntries?: readonly PlanEntry[]
  activities?: readonly CalendarActivity[]
  leaveRequests?: readonly LeaveRequest[]
  businessTrips?: readonly BusinessTrip[]
  closures?: readonly CalendarClosure[]
  officialEvents?: readonly OfficialCalendarEvent[]
}

export interface CalendarDayModel {
  canonicalDate: string
  weekdayIndex: number
  inMonth: boolean
  isWorkingDay: boolean
  planningAllowed: boolean
  reasons: CalendarConstraintReason[]
  items: CalendarItem[]
}

export interface CalendarMonthModel {
  days: CalendarDayModel[]
  weeks: CalendarDayModel[][]
  workingDays: number
  blockedDays: number
}

export interface CalendarDayDetail {
  day: WorkingDayContext
  items: CalendarItem[]
}

function dayModel(
  records: CalendarSourceRecords,
  canonicalDate: string,
  options: {
    inMonth?: boolean
    workingWeekdays?: readonly number[]
    resolveLocalDate?(isoTimestamp: string): string
  } = {},
): CalendarDayModel {
  const resolveLocalDate = options.resolveLocalDate
  const items = buildCalendarProjection({
    ...records,
    fromDate: canonicalDate,
    toDate: canonicalDate,
    ...(resolveLocalDate === undefined ? {} : { resolveLocalDate }),
  })
  const day = resolveWorkingDayContext(canonicalDate, {
    ...(options.workingWeekdays === undefined
      ? {}
      : { workingWeekdays: options.workingWeekdays as never[] }),
    ...(records.officialEvents === undefined ? {} : { officialEvents: records.officialEvents }),
    ...(records.closures === undefined ? {} : { closures: records.closures }),
    ...(records.leaveRequests === undefined ? {} : { leaveRequests: records.leaveRequests }),
    activityItems: items.filter((item) => item.sourceType === 'calendar_activity'),
    tripItems: items.filter((item) => item.sourceType === 'business_trip'),
    ...(resolveLocalDate === undefined ? {} : { resolveLocalDate }),
  })

  return {
    canonicalDate,
    weekdayIndex: canonicalWeekdayIndex(canonicalDate),
    inMonth: options.inMonth ?? true,
    isWorkingDay: day.isWorkingDay,
    planningAllowed: day.planningAllowed,
    reasons: day.reasons,
    items,
  }
}

/**
 * Builds the month grid model from the authoritative Persian month grid.
 * Out-of-month cells are included so the grid stays rectangular; their items
 * are still resolved so week-boundary planning stays accurate.
 */
export function buildCalendarMonthModel(
  records: CalendarSourceRecords,
  grid: PersianMonthGrid,
  options: {
    workingWeekdays?: readonly number[]
    resolveLocalDate?(isoTimestamp: string): string
  } = {},
): CalendarMonthModel {
  const days = grid.cells.map((cell) =>
    dayModel(records, cell.canonicalDate, {
      inMonth: cell.inCurrentMonth,
      ...(options.workingWeekdays === undefined
        ? {}
        : { workingWeekdays: options.workingWeekdays }),
      ...(options.resolveLocalDate === undefined
        ? {}
        : { resolveLocalDate: options.resolveLocalDate }),
    }),
  )

  const weeks: CalendarDayModel[][] = []
  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7))
  }

  const workingDays = days.filter((day) => day.inMonth && day.isWorkingDay).length
  const blockedDays = days.filter((day) => day.inMonth && !day.planningAllowed).length

  return { days, weeks, workingDays, blockedDays }
}

/**
 * Builds the seven-day week model for the week containing the given date
 * (Saturday-first, consistent with the Persian weekday index).
 */
export function buildCalendarWeekModel(
  records: CalendarSourceRecords,
  canonicalDate: string,
  options: {
    workingWeekdays?: readonly number[]
    resolveLocalDate?(isoTimestamp: string): string
  } = {},
): CalendarDayModel[] {
  const persian = canonicalDateToPersian(canonicalDate)
  const { saturday } = persianWeekBounds(persian)
  return Array.from({ length: 7 }, (_, index) =>
    dayModel(records, addCanonicalCalendarDays(saturday, index), {
      ...(options.workingWeekdays === undefined
        ? {}
        : { workingWeekdays: options.workingWeekdays }),
      ...(options.resolveLocalDate === undefined
        ? {}
        : { resolveLocalDate: options.resolveLocalDate }),
    }),
  )
}

/**
 * Builds the day detail: working-day context (blocking/informational split)
 * plus the projected items for the timeline.
 */
export function buildCalendarDayDetail(
  records: CalendarSourceRecords,
  canonicalDate: string,
  options: {
    workingWeekdays?: readonly number[]
    resolveLocalDate?(isoTimestamp: string): string
  } = {},
): CalendarDayDetail {
  const model = dayModel(records, canonicalDate, options)
  const blockingItems = model.items.filter((item) => item.blocksPlanning)
  return {
    day: {
      localDate: canonicalDate,
      isWorkingDay: model.isWorkingDay,
      planningAllowed: model.planningAllowed,
      reasons: model.reasons,
      blockingItems,
      informationalItems: model.items.filter((item) => !item.blocksPlanning),
    },
    items: model.items,
  }
}

/**
 * Compact chronological agenda over the next N civil days, skipping nothing —
 * blocked days are marked so the user sees why a day is not plannable.
 */
export function buildCalendarAgendaModel(
  records: CalendarSourceRecords,
  fromDate: string,
  dayCount: number,
  options: {
    workingWeekdays?: readonly number[]
    resolveLocalDate?(isoTimestamp: string): string
  } = {},
): CalendarDayModel[] {
  if (!Number.isInteger(dayCount) || dayCount < 1) {
    throw new RangeError('dayCount must be a positive integer')
  }
  return Array.from({ length: dayCount }, (_, index) =>
    dayModel(records, addCanonicalCalendarDays(fromDate, index), {
      ...(options.workingWeekdays === undefined
        ? {}
        : { workingWeekdays: options.workingWeekdays }),
      ...(options.resolveLocalDate === undefined
        ? {}
        : { resolveLocalDate: options.resolveLocalDate }),
    }),
  )
}

function officialDemoEvent(
  id: string,
  canonicalDate: string,
  label: string,
  isHoliday = true,
): OfficialCalendarEvent {
  return {
    id,
    persianDate: canonicalDateToPersian(canonicalDate),
    canonicalDate,
    label,
    kind: 'public_holiday',
    isHoliday,
    source: {
      authority: 'official gazette (demo dataset)',
      reference: 'demo/1405',
      retrievedAt: '2026-01-01T00:00:00.000Z',
    },
  }
}

function demoPlanEntries(): PlanEntry[] {
  return createPreviewPlanSeed().map((entry) => ({
    id: entry.id,
    workspaceId: 'workspace-a' as never,
    ownerUserId: 'user-1' as never,
    customerId: entry.customerId as never,
    planDate: entry.planDate,
    status: 'planned' as const,
    source: 'manual' as const,
  }))
}

/**
 * Demo calendar sources aligned with the planner demo week
 * (Shahrivar 1405 / canonical 2026-09-06..2026-09-10 plus nearby days).
 * They exist so the calendar UI is fully reviewable before the P4/P5
 * backend wiring lands, exactly like the planner previews.
 */
export const demoCalendarRecords: CalendarSourceRecords = {
  planEntries: demoPlanEntries(),
  activities: [
    {
      id: 'meeting-cycle',
      workspaceId: 'workspace-a' as never,
      activityType: 'internal_meeting',
      title: 'جلسه سیکل تیم دیابت',
      scope: 'workspace' as never,
      targetUserIds: [],
      startsAt: '2026-09-07T08:00:00.000Z',
      endsAt: '2026-09-07T10:00:00.000Z',
      allDay: false,
      blocksPlanning: true,
      countsAsWorkingActivity: true,
      appearsInReport: true,
      status: 'confirmed',
      createdByUserId: 'supervisor-1',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
    {
      id: 'program-company',
      workspaceId: 'workspace-a' as never,
      activityType: 'company_program',
      title: 'برنامه آموزشی محصول جدید',
      scope: 'workspace' as never,
      targetUserIds: [],
      startsAt: '2026-09-09T12:00:00.000Z',
      endsAt: '2026-09-09T14:00:00.000Z',
      allDay: false,
      blocksPlanning: false,
      countsAsWorkingActivity: true,
      appearsInReport: true,
      status: 'confirmed',
      createdByUserId: 'supervisor-1',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
  ],
  leaveRequests: [
    {
      id: 'leave-annual',
      workspaceId: 'workspace-a' as never,
      userId: 'user-1' as never,
      type: 'annual',
      startsAt: '2026-09-08T00:00:00.000Z',
      endsAt: '2026-09-08T23:59:59.999Z',
      status: 'approved',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-02T00:00:00.000Z',
    },
  ],
  businessTrips: [
    {
      id: 'trip-bojnourd',
      workspaceId: 'workspace-a' as never,
      userId: 'user-1' as never,
      origin: { label: 'مشهد', city: 'مشهد' },
      destination: { label: 'بجنورد', city: 'بجنورد', province: 'خراسان شمالی' },
      startsAt: '2026-09-12T00:00:00.000Z',
      endsAt: '2026-09-13T23:59:59.999Z',
      purpose: 'بازدید از مراکز درمانی',
      transport: 'اتوبوس',
      status: 'planned',
      createdAt: '2026-08-20T00:00:00.000Z',
      updatedAt: '2026-08-20T00:00:00.000Z',
    },
  ],
  closures: [
    {
      id: 'closure-inventory',
      workspaceId: 'workspace-a' as never,
      level: 'workspace' as const,
      canonicalDate: '2026-09-14',
      label: 'امور انبار و گردش موجودی',
      createdAt: '2026-08-01T00:00:00.000Z',
    },
  ],
  officialEvents: [
    officialDemoEvent('holiday-demo-1', '2026-09-16', 'جشن بزرگ (تعطیل رسمی - نمایشی)'),
  ],
}


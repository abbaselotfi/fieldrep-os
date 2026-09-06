import { describe, expect, it } from 'vitest'

import type { CalendarClosure, LeaveRequest } from './calendar-activity'
import type { OfficialCalendarEvent } from './official-calendar'
import {
  DEFAULT_PLANNING_CONFLICT_POLICY,
  evaluatePlanDayConflicts,
  evaluatePlanEntryConflicts,
  hasBlockingConflict,
  resolveWorkingDayContext,
} from './working-calendar'

function leave(status: LeaveRequest['status']): LeaveRequest {
  return {
    id: 'leave-1',
    workspaceId: 'workspace-a',
    userId: 'user-1',
    type: 'annual',
    startsAt: '2026-09-08T00:00:00.000Z',
    endsAt: '2026-09-09T23:59:59.999Z',
    status,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  }
}

function closure(level: CalendarClosure['level'], canonicalDate: string): CalendarClosure {
  return {
    id: `closure-${level}`,
    workspaceId: 'workspace-a',
    level,
    canonicalDate,
    label: 'تعطیلی',
    createdAt: '2026-09-01T00:00:00.000Z',
  }
}

function holiday(canonicalDate: string): OfficialCalendarEvent {
  return {
    id: `holiday-${canonicalDate}`,
    persianDate: { year: 1405, month: 6, day: 15 },
    canonicalDate,
    label: 'جشن بزرگ',
    kind: 'public_holiday',
    isHoliday: true,
    source: {
      authority: 'official gazette',
      reference: '1405/06',
      retrievedAt: '2026-01-01T00:00:00.000Z',
    },
  }
}

// 2026-09-06 is a Sunday -> Persian weekday index 2 (دوشنبه), a working day.
const WORKING_DAY = '2026-09-06'
// 2026-09-11 is a Friday -> Persian weekday index 6, the weekly holiday.
const FRIDAY = '2026-09-11'

describe('resolveWorkingDayContext', () => {
  it('treats a normal weekday as open for planning', () => {
    const day = resolveWorkingDayContext(WORKING_DAY)
    expect(day.isWorkingDay).toBe(true)
    expect(day.planningAllowed).toBe(true)
    expect(day.reasons).toEqual([])
  })

  it('blocks the weekly holiday (Friday) by default', () => {
    const day = resolveWorkingDayContext(FRIDAY)
    expect(day.planningAllowed).toBe(false)
    expect(day.reasons).toContain('non_working_weekday')
  })

  it('blocks official public holidays', () => {
    const day = resolveWorkingDayContext(WORKING_DAY, {
      officialEvents: [holiday(WORKING_DAY)],
    })
    expect(day.planningAllowed).toBe(false)
    expect(day.reasons).toContain('public_holiday')
  })

  it('blocks company and workspace closures', () => {
    const day = resolveWorkingDayContext(WORKING_DAY, {
      closures: [closure('company', WORKING_DAY), closure('workspace', WORKING_DAY)],
    })
    expect(day.planningAllowed).toBe(false)
    expect(day.reasons).toContain('company_closure')
    expect(day.reasons).toContain('workspace_closure')
  })

  it('blocks only approved leave; requested stay informational', () => {
    const approved = resolveWorkingDayContext('2026-09-08', { leaveRequests: [leave('approved')] })
    expect(approved.planningAllowed).toBe(false)
    expect(approved.reasons).toContain('approved_leave')

    const requested = resolveWorkingDayContext('2026-09-08', { leaveRequests: [leave('requested')] })
    expect(requested.planningAllowed).toBe(true)
    expect(requested.reasons).not.toContain('approved_leave')
  })

  it('keeps a blocking meeting as a reason but a trip as context only', () => {
    const meeting = {
      id: 'calendar_activity:meeting-1',
      workspaceId: 'workspace-a',
      type: 'internal_meeting' as const,
      sourceType: 'calendar_activity' as const,
      sourceId: 'meeting-1',
      title: 'Cycle meeting',
      startsAt: `${WORKING_DAY}T08:00:00.000Z`,
      endsAt: `${WORKING_DAY}T10:00:00.000Z`,
      allDay: false,
      scope: 'workspace' as const,
      blocksPlanning: true,
      countsAsWorkingActivity: true,
      countsAsVisit: false,
      appearsInReport: true,
      status: 'confirmed',
    }
    const trip = {
      id: 'business_trip:trip-1',
      workspaceId: 'workspace-a',
      type: 'business_trip' as const,
      sourceType: 'business_trip' as const,
      sourceId: 'trip-1',
      title: 'بجنورد',
      startsAt: `${WORKING_DAY}T00:00:00.000Z`,
      endsAt: `${WORKING_DAY}T23:59:59.999Z`,
      allDay: true,
      scope: 'user' as const,
      blocksPlanning: false,
      countsAsWorkingActivity: true,
      countsAsVisit: false,
      appearsInReport: true,
      status: 'planned',
      ownerUserId: 'user-1',
    }

    const day = resolveWorkingDayContext(WORKING_DAY, {
      activityItems: [meeting],
      tripItems: [trip],
    })
    expect(day.planningAllowed).toBe(true)
    expect(day.reasons).toContain('blocking_meeting')
    expect(day.reasons).toContain('business_trip_active')
    expect(day.blockingItems.some((item) => item.sourceId === 'meeting-1')).toBe(true)
    expect(day.informationalItems.some((item) => item.sourceId === 'trip-1')).toBe(true)
  })

  it('supports timezone-aware local date resolution for leave coverage', () => {
    // Leave starts 2026-09-07T21:00:00.000Z. With a +03:30 workspace offset
    // that instant is already 2026-09-08 00:30 local, so the civil day
    // 2026-09-08 must be blocked even though its UTC date is 2026-09-07.
    const resolver = (iso: string): string => {
      const shifted = new Date(Date.parse(iso) + 3.5 * 60 * 60 * 1000)
      return shifted.toISOString().slice(0, 10)
    }
    const day = resolveWorkingDayContext('2026-09-08', {
      leaveRequests: [
        {
          ...leave('approved'),
          startsAt: '2026-09-07T21:00:00.000Z',
          endsAt: '2026-09-07T23:00:00.000Z',
        },
      ],
      resolveLocalDate: resolver,
    })
    expect(day.planningAllowed).toBe(false)
    expect(day.reasons).toContain('approved_leave')
  })
})

describe('planning conflict engine', () => {
  it('returns blocking conflicts for a Friday and for approved leave', () => {
    const friday = resolveWorkingDayContext(FRIDAY)
    const fridayConflicts = evaluatePlanEntryConflicts({ planDate: FRIDAY, dayContext: friday })
    expect(hasBlockingConflict(fridayConflicts)).toBe(true)
    expect(fridayConflicts.some((conflict) => conflict.code === 'non_working_day')).toBe(true)

    const leaveDay = resolveWorkingDayContext('2026-09-08', { leaveRequests: [leave('approved')] })
    const leaveConflicts = evaluatePlanEntryConflicts({
      planDate: '2026-09-08',
      dayContext: leaveDay,
    })
    expect(hasBlockingConflict(leaveConflicts)).toBe(true)
    expect(leaveConflicts.some((conflict) => conflict.code === 'approved_leave')).toBe(true)
  })

  it('reports meetings and trips with their default severities', () => {
    const meeting = {
      id: 'calendar_activity:meeting-1',
      workspaceId: 'workspace-a',
      type: 'internal_meeting' as const,
      sourceType: 'calendar_activity' as const,
      sourceId: 'meeting-1',
      title: 'Cycle meeting',
      startsAt: `${WORKING_DAY}T08:00:00.000Z`,
      endsAt: `${WORKING_DAY}T10:00:00.000Z`,
      allDay: false,
      scope: 'workspace' as const,
      blocksPlanning: true,
      countsAsWorkingActivity: true,
      countsAsVisit: false,
      appearsInReport: true,
      status: 'confirmed',
    }
    const day = resolveWorkingDayContext(WORKING_DAY, {
      activityItems: [meeting],
      tripItems: [
        {
          id: 'business_trip:trip-1',
          workspaceId: 'workspace-a',
          type: 'business_trip' as const,
          sourceType: 'business_trip' as const,
          sourceId: 'trip-1',
          title: 'بجنورد',
          startsAt: `${WORKING_DAY}T00:00:00.000Z`,
          endsAt: `${WORKING_DAY}T23:59:59.999Z`,
          allDay: true,
          scope: 'user' as const,
          blocksPlanning: false,
          countsAsWorkingActivity: true,
          countsAsVisit: false,
          appearsInReport: true,
          status: 'planned',
          ownerUserId: 'user-1',
        },
      ],
    })
    const conflicts = evaluatePlanDayConflicts({ dayContext: day })

    const meetingConflict = conflicts.find((conflict) => conflict.code === 'blocking_meeting')
    expect(meetingConflict?.severity).toBe(DEFAULT_PLANNING_CONFLICT_POLICY.blockingMeeting)
    expect(meetingConflict?.sourceItemId).toBe('meeting-1')

    const tripConflict = conflicts.find((conflict) => conflict.code === 'business_trip_destination')
    expect(tripConflict?.severity).toBe('info')
    // A blocking meeting is a hard conflict under the default policy.
    expect(hasBlockingConflict(conflicts)).toBe(true)
  })

  it('rejects a day context that does not match the evaluated plan date', () => {
    const day = resolveWorkingDayContext(WORKING_DAY)
    expect(() =>
      evaluatePlanEntryConflicts({ planDate: '2026-09-07', dayContext: day }),
    ).toThrow(RangeError)
  })

  it('allows company policy to soften specific conflicts', () => {
    const day = resolveWorkingDayContext(FRIDAY)
    const conflicts = evaluatePlanEntryConflicts(
      { planDate: FRIDAY, dayContext: day },
      { ...DEFAULT_PLANNING_CONFLICT_POLICY, nonWorkingDay: 'warning' },
    )
    expect(hasBlockingConflict(conflicts)).toBe(false)
    expect(conflicts[0]?.severity).toBe('warning')
  })
})

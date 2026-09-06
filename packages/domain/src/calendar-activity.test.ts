import { describe, expect, it } from 'vitest'

import type { PlanEntry } from './planner-contracts'
import type { OfficialCalendarEvent } from './official-calendar'
import {
  buildCalendarProjection,
  CALENDAR_ACTIVITY_POLICIES,
  calendarItemFromActivity,
  calendarItemFromLeaveRequest,
} from './calendar-activity'

const workspaceId = 'workspace-a'

function planEntry(planDate: string): PlanEntry {
  return {
    id: `plan-${planDate}`,
    workspaceId,
    ownerUserId: 'user-1',
    customerId: 'doctor-1',
    planDate,
    status: 'planned',
    source: 'manual',
  }
}

function officialEvent(
  id: string,
  canonicalDate: string,
  isHoliday = true,
): OfficialCalendarEvent {
  return {
    id,
    persianDate: { year: 1405, month: 6, day: 1 },
    canonicalDate,
    label: `Event ${id}`,
    kind: 'public_holiday',
    isHoliday,
    source: {
      authority: 'official gazette',
      reference: '1405/01',
      retrievedAt: '2026-01-01T00:00:00.000Z',
    },
  }
}

describe('calendar activity policies', () => {
  it('never counts non-visit categories as doctor visits', () => {
    for (const [type, policy] of Object.entries(CALENDAR_ACTIVITY_POLICIES)) {
      if (type === 'visit') {
        expect(policy.countsAsVisit).toBe(true)
      } else {
        expect(policy.countsAsVisit, `${type} must not increment visit KPIs`).toBe(false)
      }
    }
  })

  it('blocks planning for leave, closures and holidays by default', () => {
    expect(CALENDAR_ACTIVITY_POLICIES.leave.blocksPlanning).toBe(true)
    expect(CALENDAR_ACTIVITY_POLICIES.company_closure.blocksPlanning).toBe(true)
    expect(CALENDAR_ACTIVITY_POLICIES.workspace_closure.blocksPlanning).toBe(true)
    expect(CALENDAR_ACTIVITY_POLICIES.public_holiday.blocksPlanning).toBe(true)
    expect(CALENDAR_ACTIVITY_POLICIES.business_trip.blocksPlanning).toBe(false)
  })
})

describe('calendar projection', () => {
  it('projects plan entries as all-day visit items without KPI mutation', () => {
    const items = buildCalendarProjection({
      planEntries: [planEntry('2026-09-06')],
      fromDate: '2026-09-01',
      toDate: '2026-09-30',
    })

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      sourceType: 'plan_entry',
      type: 'visit',
      allDay: true,
      countsAsVisit: true,
      ownerUserId: 'user-1',
    })
  })

  it('includes meetings, approved leave, trips, closures and official holidays', () => {
    const meetingActivity = {
      id: 'meeting-1',
      workspaceId,
      activityType: 'internal_meeting' as const,
      title: 'Cycle meeting',
      scope: 'workspace' as const,
      targetUserIds: [],
      startsAt: '2026-09-07T08:00:00.000Z',
      endsAt: '2026-09-07T10:00:00.000Z',
      allDay: false,
      blocksPlanning: true,
      countsAsWorkingActivity: true,
      appearsInReport: true,
      status: 'confirmed' as const,
      createdByUserId: 'user-1',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    }

    const items = buildCalendarProjection({
      planEntries: [planEntry('2026-09-06')],
      activities: [meetingActivity],
      leaveRequests: [
        {
          id: 'leave-1',
          workspaceId,
          userId: 'user-1',
          type: 'annual',
          startsAt: '2026-09-08T00:00:00.000Z',
          endsAt: '2026-09-10T23:59:59.999Z',
          status: 'approved',
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
      ],
      businessTrips: [
        {
          id: 'trip-1',
          workspaceId,
          userId: 'user-1',
          destination: { label: 'بجنورد', city: 'بجنورد' },
          startsAt: '2026-09-12T00:00:00.000Z',
          endsAt: '2026-09-13T23:59:59.999Z',
          status: 'planned',
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
      ],
      closures: [
        {
          id: 'closure-1',
          workspaceId,
          level: 'workspace' as const,
          canonicalDate: '2026-09-14',
          label: 'انبار و گردش موجودی',
          createdAt: '2026-09-01T00:00:00.000Z',
        },
      ],
      officialEvents: [officialEvent('holiday-1', '2026-09-15')],
      fromDate: '2026-09-06',
      toDate: '2026-09-15',
    })

    const types = items.map((item) => item.type)
    expect(types).toContain('visit')
    expect(types).toContain('internal_meeting')
    expect(types).toContain('leave')
    expect(types).toContain('business_trip')
    expect(types).toContain('workspace_closure')
    expect(types).toContain('public_holiday')

    expect(items.find((item) => item.sourceType === 'calendar_activity')).toEqual(
      calendarItemFromActivity(meetingActivity),
    )

    const leaveItem = items.find((item) => item.type === 'leave')
    expect(leaveItem?.blocksPlanning).toBe(true)

    const tripItem = items.find((item) => item.type === 'business_trip')
    expect(tripItem?.blocksPlanning).toBe(false)
    expect(tripItem?.countsAsWorkingActivity).toBe(true)
  })

  it('excludes cancelled records and out-of-range items', () => {
    const items = buildCalendarProjection({
      leaveRequests: [
        {
          id: 'leave-1',
          workspaceId,
          userId: 'user-1',
          type: 'sick',
          startsAt: '2026-09-08T00:00:00.000Z',
          endsAt: '2026-09-08T23:59:59.999Z',
          status: 'cancelled',
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
      ],
      officialEvents: [officialEvent('holiday-1', '2026-10-01')],
      fromDate: '2026-09-01',
      toDate: '2026-09-30',
    })

    expect(items).toEqual([])
  })

  it('keeps hourly and non-approved leave informational', () => {
    const item = calendarItemFromLeaveRequest({
      id: 'leave-2',
      workspaceId,
      userId: 'user-1',
      type: 'hourly',
      startsAt: '2026-09-08T06:00:00.000Z',
      endsAt: '2026-09-08T09:00:00.000Z',
      status: 'requested',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    })

    expect(item.allDay).toBe(false)
    expect(item.blocksPlanning).toBe(false)
  })
})

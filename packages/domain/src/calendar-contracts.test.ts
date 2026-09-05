import { describe, expect, it } from 'vitest'

import {
  activityToCalendarItem,
  isCalendarItemVisibleToUser,
  validateActivity,
  validateCalendarItem,
  type Activity,
  type CalendarItem,
} from './calendar-contracts'

const workspaceId = 'workspace-diabetes'
const userId = 'user-field-1'
const start = Date.UTC(2026, 8, 5, 9)
const end = Date.UTC(2026, 8, 5, 10)

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 'activity-1',
    workspaceId,
    createdByUserId: userId,
    ownerUserId: userId,
    type: 'internal_meeting',
    title: 'جلسه داخلی',
    description: null,
    startsAt: start,
    endsAt: end,
    localStartDate: '2026-09-05',
    localEndDate: '2026-09-05',
    allDay: false,
    scope: { type: 'user', id: userId },
    attendeeUserIds: [],
    blocksPlanning: true,
    countsAsWorkingActivity: true,
    appearsInReport: true,
    status: 'scheduled',
    locationText: null,
    ...overrides,
  }
}

function calendarItem(overrides: Partial<CalendarItem> = {}): CalendarItem {
  return {
    id: 'calendar-1',
    workspaceId,
    type: 'visit',
    sourceType: 'visit',
    sourceId: 'visit-1',
    title: 'ویزیت پزشک',
    startsAt: start,
    endsAt: end,
    localStartDate: '2026-09-05',
    localEndDate: '2026-09-05',
    allDay: false,
    scope: { type: 'user', id: userId },
    attendeeUserIds: [],
    behavior: {
      blocksPlanning: true,
      countsAsWorkingActivity: true,
      countsAsVisit: true,
      appearsInReport: true,
    },
    status: 'completed',
    locationText: null,
    ...overrides,
  }
}

describe('calendar activity contracts', () => {
  it('projects a generic activity without any visit KPI effect', () => {
    const item = activityToCalendarItem(activity(), 'calendar-activity-1')

    expect(item).toMatchObject({
      type: 'internal_meeting',
      sourceType: 'activity',
      sourceId: 'activity-1',
      behavior: {
        blocksPlanning: true,
        countsAsWorkingActivity: true,
        countsAsVisit: false,
        appearsInReport: true,
      },
    })
  })

  it('allows countsAsVisit only for an authoritative Actual Visit projection', () => {
    expect(() => validateCalendarItem(calendarItem())).not.toThrow()

    expect(() =>
      validateCalendarItem(
        calendarItem({
          sourceType: 'plan_entry',
          sourceId: 'plan-1',
        }),
      ),
    ).toThrow('only an Actual Visit projection may carry countsAsVisit=true')

    expect(() =>
      validateCalendarItem(
        calendarItem({
          type: 'internal_meeting',
          sourceType: 'activity',
          sourceId: 'activity-1',
        }),
      ),
    ).toThrow('only an Actual Visit projection may carry countsAsVisit=true')
  })

  it('rejects invalid date/timestamp ranges', () => {
    expect(() => validateActivity(activity({ endsAt: start - 1 }))).toThrow(
      'calendar end must not precede start',
    )
    expect(() =>
      validateActivity(
        activity({ localStartDate: '2026-09-06', localEndDate: '2026-09-05' }),
      ),
    ).toThrow('calendar local end date must not precede local start date')
  })

  it('enforces selected-user and workspace scope invariants', () => {
    expect(() =>
      validateActivity(
        activity({ scope: { type: 'selected_users', id: null }, attendeeUserIds: [] }),
      ),
    ).toThrow('selected_users calendar scope requires at least one attendee')

    expect(() =>
      validateActivity(
        activity({ scope: { type: 'workspace', id: 'another-workspace' } }),
      ),
    ).toThrow('workspace calendar scope must match item workspace')

    expect(() =>
      validateActivity(
        activity({
          scope: { type: 'selected_users', id: null },
          attendeeUserIds: ['user-2', 'user-2'],
        }),
      ),
    ).toThrow('calendar attendee user IDs must be unique')
  })

  it('resolves visibility from scope without widening selected-user access', () => {
    const context = {
      userId,
      workspaceId,
      organizationUnitIds: new Set(['team-mashhad']),
      companyId: 'company-1',
    }

    expect(
      isCalendarItemVisibleToUser(
        calendarItem({ scope: { type: 'workspace', id: workspaceId } }),
        context,
      ),
    ).toBe(true)
    expect(
      isCalendarItemVisibleToUser(
        calendarItem({
          scope: { type: 'selected_users', id: null },
          attendeeUserIds: ['user-2'],
        }),
        context,
      ),
    ).toBe(false)
    expect(
      isCalendarItemVisibleToUser(
        calendarItem({ scope: { type: 'organization_unit', id: 'team-mashhad' } }),
        context,
      ),
    ).toBe(true)
  })
})

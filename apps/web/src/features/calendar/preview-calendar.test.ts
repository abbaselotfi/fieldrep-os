import { describe, expect, it } from 'vitest'

import { buildPersianMonthGrid } from '@fieldrep/domain'

import {
  buildCalendarAgendaModel,
  buildCalendarDayDetail,
  buildCalendarMonthModel,
  buildCalendarWeekModel,
  demoCalendarRecords,
} from './preview-calendar'

describe('calendar view model', () => {
  it('marks Fridays as non-plannable inside the month grid', () => {
    const grid = buildPersianMonthGrid(1405, 6)
    const model = buildCalendarMonthModel(demoCalendarRecords, grid)

    const fridays = model.days.filter((day) => day.weekdayIndex === 6)
    expect(fridays.length).toBeGreaterThan(3)
    for (const friday of fridays) {
      expect(friday.planningAllowed).toBe(false)
      expect(friday.reasons).toContain('non_working_weekday')
    }
    expect(model.workingDays).toBeGreaterThan(20)
  })

  it('blocks the approved leave day and the workspace closure day', () => {
    const grid = buildPersianMonthGrid(1405, 6)
    const model = buildCalendarMonthModel(demoCalendarRecords, grid)

    const leaveDay = model.days.find((day) => day.canonicalDate === '2026-09-08')
    expect(leaveDay?.planningAllowed).toBe(false)
    expect(leaveDay?.reasons).toContain('approved_leave')

    const closureDay = model.days.find((day) => day.canonicalDate === '2026-09-14')
    expect(closureDay?.planningAllowed).toBe(false)
    expect(closureDay?.reasons).toContain('workspace_closure')
  })

  it('projects planned visits alongside activities without KPI mutations', () => {
    const detail = buildCalendarDayDetail(demoCalendarRecords, '2026-09-06')
    const visitItems = detail.items.filter((item) => item.type === 'visit')
    expect(visitItems.length).toBeGreaterThan(0)
    expect(visitItems.every((item) => item.countsAsVisit)).toBe(true)

    const meetingDetail = buildCalendarDayDetail(demoCalendarRecords, '2026-09-07')
    const meeting = meetingDetail.items.find((item) => item.sourceId === 'meeting-cycle')
    expect(meeting?.type).toBe('internal_meeting')
    expect(meeting?.countsAsVisit).toBe(false)
    expect(meetingDetail.day.blockingItems.length).toBeGreaterThan(0)
  })

  it('keeps trips informational in the day detail', () => {
    const detail = buildCalendarDayDetail(demoCalendarRecords, '2026-09-12')
    expect(detail.day.planningAllowed).toBe(true)
    expect(detail.day.reasons).toContain('business_trip_active')
    const trip = detail.items.find((item) => item.sourceId === 'trip-bojnourd')
    expect(trip?.type).toBe('business_trip')
    expect(trip?.blocksPlanning).toBe(false)
  })

  it('exposes the public holiday through the projection', () => {
    const detail = buildCalendarDayDetail(demoCalendarRecords, '2026-09-16')
    expect(detail.day.planningAllowed).toBe(false)
    expect(detail.day.reasons).toContain('public_holiday')
  })

  it('builds a Saturday-first week model', () => {
    const week = buildCalendarWeekModel(demoCalendarRecords, '2026-09-08')
    expect(week).toHaveLength(7)
    expect(week[0]?.weekdayIndex).toBe(0)
    expect(week[6]?.weekdayIndex).toBe(6)
    expect(week.some((day) => day.canonicalDate === '2026-09-08')).toBe(true)
  })

  it('builds a compact agenda with blocked-day visibility', () => {
    const agenda = buildCalendarAgendaModel(demoCalendarRecords, '2026-09-06', 7)
    expect(agenda).toHaveLength(7)
    const leaveEntry = agenda.find((day) => day.canonicalDate === '2026-09-08')
    expect(leaveEntry?.planningAllowed).toBe(false)
  })

  it('rejects a non-positive agenda length', () => {
    expect(() => buildCalendarAgendaModel(demoCalendarRecords, '2026-09-06', 0)).toThrow(RangeError)
  })
})

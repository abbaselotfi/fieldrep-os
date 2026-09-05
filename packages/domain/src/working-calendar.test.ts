import { describe, expect, it } from 'vitest'

import { validateOfficialCalendarDataset } from './official-calendar'
import { IRAN_OFFICIAL_CALENDAR_1405 } from './iran-official-calendar-1405'
import {
  resolveWorkingDay,
  validateWorkingCalendarOverride,
  type WorkingCalendarOverride,
} from './working-calendar'

const saturdayToThursday = [0, 1, 2, 3, 4, 5] as const

function override(
  patch: Partial<WorkingCalendarOverride> = {},
): WorkingCalendarOverride {
  return {
    id: 'override-1',
    scope: 'workspace',
    scopeId: 'workspace-a',
    startsOn: '2026-09-05',
    endsOn: '2026-09-05',
    mode: 'closure',
    title: 'تعطیلی داخلی',
    ...patch,
  }
}

describe('Iran official calendar 1405', () => {
  it('is internally date-consistent and has 26 official holiday dates', () => {
    const result = validateOfficialCalendarDataset(IRAN_OFFICIAL_CALENDAR_1405)

    expect(result).toEqual({ valid: true, errors: [] })
    expect(IRAN_OFFICIAL_CALENDAR_1405.events).toHaveLength(26)
    expect(new Set(IRAN_OFFICIAL_CALENDAR_1405.events.map((event) => event.canonicalDate)).size).toBe(26)
  })

  it('contains sensitive religious and national holiday anchors', () => {
    expect(IRAN_OFFICIAL_CALENDAR_1405.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ canonicalDate: '2026-06-24', label: 'تاسوعای حسینی', isHoliday: true }),
        expect.objectContaining({ canonicalDate: '2026-08-30', kind: 'religious', isHoliday: true }),
        expect.objectContaining({ canonicalDate: '2027-02-11', kind: 'national', isHoliday: true }),
        expect.objectContaining({ canonicalDate: '2027-03-10', label: 'عید سعید فطر', isHoliday: true }),
      ]),
    )
  })
})

describe('working-day resolver', () => {
  it('treats a normal configured Saturday as working', () => {
    const context = resolveWorkingDay({
      canonicalDate: '2026-09-05',
      workingWeekdays: saturdayToThursday,
    })

    expect(context.weekdayIndex).toBe(0)
    expect(context.isWorkingDay).toBe(true)
    expect(context.planningAllowed).toBe(true)
    expect(context.reasons).toEqual([])
  })

  it('treats Friday as non-working under the default six-day example policy', () => {
    const context = resolveWorkingDay({
      canonicalDate: '2026-09-11',
      workingWeekdays: saturdayToThursday,
    })

    expect(context.weekdayIndex).toBe(6)
    expect(context.isWorkingDay).toBe(false)
    expect(context.reasons).toContainEqual(
      expect.objectContaining({ code: 'weekly_non_working_day', blocking: true }),
    )
  })

  it('allows an explicit working-day override to open a weekly non-working day', () => {
    const context = resolveWorkingDay({
      canonicalDate: '2026-09-11',
      workingWeekdays: saturdayToThursday,
      workspaceOverrides: [
        override({
          id: 'special-friday',
          startsOn: '2026-09-11',
          endsOn: '2026-09-11',
          mode: 'working_day',
          title: 'جمعه کاری برنامه ویژه',
        }),
      ],
    })

    expect(context.isWorkingDay).toBe(true)
    expect(context.reasons).toContainEqual(
      expect.objectContaining({ code: 'workspace_working_day_override', blocking: false }),
    )
    expect(context.reasons.some((reason) => reason.code === 'weekly_non_working_day')).toBe(false)
  })

  it('never lets a normal working-day override silently open an official holiday', () => {
    const context = resolveWorkingDay({
      canonicalDate: '2026-08-30',
      workingWeekdays: saturdayToThursday,
      officialCalendar: IRAN_OFFICIAL_CALENDAR_1405,
      workspaceOverrides: [
        override({
          id: 'attempt-open-holiday',
          startsOn: '2026-08-30',
          endsOn: '2026-08-30',
          mode: 'working_day',
          title: 'روز کاری داخلی',
        }),
      ],
    })

    expect(context.isWorkingDay).toBe(false)
    expect(context.planningAllowed).toBe(false)
    expect(context.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'official_holiday', blocking: true }),
        expect.objectContaining({ code: 'workspace_working_day_override', blocking: false }),
      ]),
    )
  })

  it('company and workspace closures hard-block otherwise working days', () => {
    const company = resolveWorkingDay({
      canonicalDate: '2026-09-05',
      workingWeekdays: saturdayToThursday,
      companyOverrides: [
        override({ scope: 'company', scopeId: 'company-1', title: 'تعطیلی شرکت' }),
      ],
    })
    const workspace = resolveWorkingDay({
      canonicalDate: '2026-09-05',
      workingWeekdays: saturdayToThursday,
      workspaceOverrides: [override()],
    })

    expect(company.planningAllowed).toBe(false)
    expect(company.reasons[0]?.code).toBe('company_closure')
    expect(workspace.planningAllowed).toBe(false)
    expect(workspace.reasons[0]?.code).toBe('workspace_closure')
  })

  it('validates override dates before composition', () => {
    expect(() =>
      validateWorkingCalendarOverride(
        override({ startsOn: '2026-09-06', endsOn: '2026-09-05' }),
      ),
    ).toThrow('working calendar override end must not precede start')
  })
})

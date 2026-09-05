import { describe, expect, it } from 'vitest'

import {
  addCanonicalDays,
  canonicalDateToJalali,
  isDateInPlanningCycle,
  jalaliDateToCanonical,
  jalaliQuarterForCanonicalDate,
  planningCycleBounds,
} from './planning-cycle'

describe('Jalali canonical date conversion', () => {
  it('converts known 1405 dates in both directions', () => {
    expect(jalaliDateToCanonical({ year: 1405, month: 1, day: 1 })).toBe('2026-03-21')
    expect(jalaliDateToCanonical({ year: 1405, month: 4, day: 1 })).toBe('2026-06-22')
    expect(jalaliDateToCanonical({ year: 1405, month: 7, day: 1 })).toBe('2026-09-23')
    expect(jalaliDateToCanonical({ year: 1405, month: 10, day: 1 })).toBe('2026-12-22')
    expect(canonicalDateToJalali('2026-09-05')).toEqual({ year: 1405, month: 6, day: 14 })
  })

  it('validates Esfand leap-day through a round trip', () => {
    expect(jalaliDateToCanonical({ year: 1403, month: 12, day: 30 })).toBe('2025-03-20')
    expect(() => jalaliDateToCanonical({ year: 1404, month: 12, day: 30 })).toThrow(RangeError)
  })

  it('rejects invalid canonical and Jalali dates', () => {
    expect(() => canonicalDateToJalali('2026-02-31')).toThrow(RangeError)
    expect(() => jalaliDateToCanonical({ year: 1405, month: 13, day: 1 })).toThrow(RangeError)
    expect(() => jalaliDateToCanonical({ year: 1405, month: 2, day: 32 })).toThrow(RangeError)
  })
})

describe('Jalali quarter planning cycle', () => {
  it('derives exact 1405 quarter boundaries', () => {
    expect(planningCycleBounds({ jalaliYear: 1405, quarter: 1 })).toEqual({
      jalaliYear: 1405,
      quarter: 1,
      startsOn: '2026-03-21',
      endsOn: '2026-06-21',
    })
    expect(planningCycleBounds({ jalaliYear: 1405, quarter: 2 })).toEqual({
      jalaliYear: 1405,
      quarter: 2,
      startsOn: '2026-06-22',
      endsOn: '2026-09-22',
    })
    expect(planningCycleBounds({ jalaliYear: 1405, quarter: 3 })).toEqual({
      jalaliYear: 1405,
      quarter: 3,
      startsOn: '2026-09-23',
      endsOn: '2026-12-21',
    })
    expect(planningCycleBounds({ jalaliYear: 1405, quarter: 4 })).toEqual({
      jalaliYear: 1405,
      quarter: 4,
      startsOn: '2026-12-22',
      endsOn: '2027-03-20',
    })
  })

  it('maps canonical dates back to the correct quarter', () => {
    expect(jalaliQuarterForCanonicalDate('2026-09-05')).toEqual({
      jalaliYear: 1405,
      quarter: 2,
    })
    expect(jalaliQuarterForCanonicalDate('2026-09-23')).toEqual({
      jalaliYear: 1405,
      quarter: 3,
    })
  })

  it('checks inclusive cycle membership', () => {
    const cycle = planningCycleBounds({ jalaliYear: 1405, quarter: 2 })
    expect(isDateInPlanningCycle('2026-06-22', cycle)).toBe(true)
    expect(isDateInPlanningCycle('2026-09-22', cycle)).toBe(true)
    expect(isDateInPlanningCycle('2026-09-23', cycle)).toBe(false)
  })

  it('adds canonical days without timezone drift', () => {
    expect(addCanonicalDays('2026-09-22', 1)).toBe('2026-09-23')
    expect(addCanonicalDays('2027-03-01', -1)).toBe('2027-02-28')
  })
})

import { describe, expect, it } from 'vitest'

import {
  addCanonicalCalendarDays,
  buildPersianMonthGrid,
  canonicalDateToPersian,
  canonicalWeekdayIndex,
  FIELDREP_MAX_PERSIAN_YEAR,
  FIELDREP_MIN_PERSIAN_YEAR,
  isPersianLeapYear,
  isValidPersianDate,
  PERSIAN_WEEKDAY_NAMES,
  persianDateToCanonical,
  persianMonthLength,
  persianWeekBounds,
  persianWeekdayIndex,
  type PersianDateParts,
} from './persian-calendar'

const INTL_PERSIAN = new Intl.DateTimeFormat('en-US-u-ca-persian', {
  calendar: 'persian',
  numberingSystem: 'latn',
  timeZone: 'UTC',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
})

function intlPersian(canonical: string): PersianDateParts {
  const parts = INTL_PERSIAN.formatToParts(new Date(`${canonical}T00:00:00.000Z`))
  const values = new Map(parts.map((part) => [part.type, part.value]))
  return {
    year: Number(values.get('year')),
    month: Number(values.get('month')),
    day: Number(values.get('day')),
  }
}

function nextExpectedPersian(parts: PersianDateParts): PersianDateParts {
  const monthLength = parts.month <= 6 ? 31 : parts.month <= 11 ? 30 : isPersianLeapYear(parts.year) ? 30 : 29
  if (parts.day < monthLength) return { ...parts, day: parts.day + 1 }
  if (parts.month < 12) return { year: parts.year, month: parts.month + 1, day: 1 }
  return { year: parts.year + 1, month: 1, day: 1 }
}

describe('Persian calendar official/golden anchors', () => {
  it('matches known Nowruz and leap-boundary anchors', () => {
    const anchors: Array<[PersianDateParts, string, number]> = [
      [{ year: 1399, month: 1, day: 1 }, '2020-03-20', 6],
      [{ year: 1399, month: 12, day: 30 }, '2021-03-20', 0],
      [{ year: 1403, month: 1, day: 1 }, '2024-03-20', 4],
      [{ year: 1403, month: 12, day: 30 }, '2025-03-20', 5],
      [{ year: 1404, month: 1, day: 1 }, '2025-03-21', 6],
      [{ year: 1405, month: 1, day: 1 }, '2026-03-21', 0],
      [{ year: 1405, month: 4, day: 1 }, '2026-06-22', 2],
      [{ year: 1405, month: 6, day: 14 }, '2026-09-05', 0],
      [{ year: 1405, month: 6, day: 31 }, '2026-09-22', 3],
    ]

    for (const [persian, canonical, weekday] of anchors) {
      expect(persianDateToCanonical(persian)).toBe(canonical)
      expect(canonicalDateToPersian(canonical)).toEqual(persian)
      expect(persianWeekdayIndex(persian)).toBe(weekday)
      expect(canonicalWeekdayIndex(canonical)).toBe(weekday)
    }

    expect(isPersianLeapYear(1399)).toBe(true)
    expect(isPersianLeapYear(1403)).toBe(true)
    expect(isPersianLeapYear(1404)).toBe(false)
    expect(isPersianLeapYear(1405)).toBe(false)
  })

  it('matches the uploaded workbook Q2 weekday sequence for all 95 visible date headers', () => {
    let expected: PersianDateParts = { year: 1405, month: 3, day: 30 }
    let canonical = '2026-06-20'

    for (let offset = 0; offset < 95; offset += 1) {
      expect(canonicalDateToPersian(canonical)).toEqual(expected)
      expect(canonicalWeekdayIndex(canonical)).toBe(offset % 7)
      if (offset < 94) {
        expected = nextExpectedPersian(expected)
        canonical = addCanonicalCalendarDays(canonical, 1)
      }
    }

    expect(expected).toEqual({ year: 1405, month: 6, day: 31 })
    expect(canonical).toBe('2026-09-22')
  })
})

describe('Persian calendar exhaustive correctness', () => {
  it(
    'round-trips every valid day from 1300 through 1600 with no day discontinuity',
    () => {
      let checked = 0
      let previousCanonical: string | null = null

      for (let year = FIELDREP_MIN_PERSIAN_YEAR; year <= FIELDREP_MAX_PERSIAN_YEAR; year += 1) {
        for (let month = 1; month <= 12; month += 1) {
          const length = persianMonthLength(year, month)
          for (let day = 1; day <= length; day += 1) {
            const persian = { year, month, day }
            const canonical = persianDateToCanonical(persian)
            const roundTrip = canonicalDateToPersian(canonical)
            if (
              roundTrip.year !== year ||
              roundTrip.month !== month ||
              roundTrip.day !== day
            ) {
              throw new Error(
                `round-trip mismatch ${year}/${month}/${day} -> ${canonical} -> ${roundTrip.year}/${roundTrip.month}/${roundTrip.day}`,
              )
            }
            if (previousCanonical !== null && addCanonicalCalendarDays(previousCanonical, 1) !== canonical) {
              throw new Error(`calendar discontinuity after ${previousCanonical}; next was ${canonical}`)
            }
            previousCanonical = canonical
            checked += 1
          }
        }
      }

      expect(checked).toBeGreaterThan(109_000)
    },
    60_000,
  )

  it(
    'differential-checks every supported day against ECMAScript Intl Persian calendar',
    () => {
      let checked = 0
      for (let year = FIELDREP_MIN_PERSIAN_YEAR; year <= FIELDREP_MAX_PERSIAN_YEAR; year += 1) {
        for (let month = 1; month <= 12; month += 1) {
          const length = persianMonthLength(year, month)
          for (let day = 1; day <= length; day += 1) {
            const persian = { year, month, day }
            const canonical = persianDateToCanonical(persian)
            const oracle = intlPersian(canonical)
            if (oracle.year !== year || oracle.month !== month || oracle.day !== day) {
              throw new Error(
                `Intl mismatch ${year}/${month}/${day} -> ${canonical} -> ${oracle.year}/${oracle.month}/${oracle.day}`,
              )
            }
            checked += 1
          }
        }
      }
      expect(checked).toBeGreaterThan(109_000)
    },
    90_000,
  )
})

describe('Persian month/week grid invariants', () => {
  it('builds Saturday-first month grids with correct spillover and no weekday drift', () => {
    const farvardin1405 = buildPersianMonthGrid(1405, 1)
    expect(farvardin1405.startsOn).toBe('2026-03-21')
    expect(farvardin1405.firstWeekdayIndex).toBe(0)
    expect(farvardin1405.daysInMonth).toBe(31)
    expect(farvardin1405.cells).toHaveLength(35)

    const farvardin1404 = buildPersianMonthGrid(1404, 1)
    expect(farvardin1404.startsOn).toBe('2025-03-21')
    expect(farvardin1404.firstWeekdayIndex).toBe(6)
    expect(farvardin1404.cells).toHaveLength(42)

    for (const grid of [farvardin1405, farvardin1404, buildPersianMonthGrid(1403, 12)]) {
      for (let index = 0; index < grid.cells.length; index += 1) {
        const cell = grid.cells[index]!
        expect(cell.weekdayIndex).toBe(index % 7)
        expect(canonicalWeekdayIndex(cell.canonicalDate)).toBe(index % 7)
        if (index > 0) {
          expect(addCanonicalCalendarDays(grid.cells[index - 1]!.canonicalDate, 1)).toBe(cell.canonicalDate)
        }
      }
      expect(grid.cells.filter((cell) => cell.inCurrentMonth)).toHaveLength(grid.daysInMonth)
    }
  })

  it('computes Saturday-Friday week bounds across month/year boundaries', () => {
    expect(persianWeekBounds({ year: 1405, month: 1, day: 1 })).toEqual({
      saturday: '2026-03-21',
      friday: '2026-03-27',
    })
    expect(persianWeekBounds({ year: 1404, month: 12, day: 29 })).toEqual({
      saturday: '2026-03-14',
      friday: '2026-03-20',
    })
  })

  it('uses Saturday-first weekday names in a stable index order', () => {
    expect(PERSIAN_WEEKDAY_NAMES).toEqual([
      'شنبه',
      'یکشنبه',
      'دوشنبه',
      'سه‌شنبه',
      'چهارشنبه',
      'پنج‌شنبه',
      'جمعه',
    ])
  })

  it('rejects impossible dates including non-leap Esfand 30', () => {
    expect(isValidPersianDate({ year: 1403, month: 12, day: 30 })).toBe(true)
    expect(isValidPersianDate({ year: 1404, month: 12, day: 30 })).toBe(false)
    expect(() => persianDateToCanonical({ year: 1404, month: 12, day: 30 })).toThrow(RangeError)
    expect(() => persianDateToCanonical({ year: 1405, month: 7, day: 31 })).toThrow(RangeError)
    expect(() => canonicalDateToPersian('2026-02-31')).toThrow(RangeError)
  })
})

/**
 * Deterministic Persian (Solar Hijri/Jalali) calendar core for FieldRep OS.
 *
 * The civil-date arithmetic is pinned to the current Unicode ICU PersianCalendar
 * 33-year-cycle implementation, including ICU's explicit astronomical leap
 * corrections. This avoids relying on the browser/OS ICU version at runtime while
 * still allowing exhaustive differential tests against ECMAScript Intl.
 *
 * The official Iranian calendar is ultimately astronomical. Annual official
 * calendar/event publications remain a separate versioned data layer and are
 * never inferred from religious/lunar arithmetic here.
 *
 * See THIRD_PARTY_NOTICES.md and docs/P2-A10-CALENDAR-CORRECTNESS.md.
 */

export interface PersianDateParts {
  year: number
  month: number
  day: number
}

export interface GregorianDateParts {
  year: number
  month: number
  day: number
}

export type PersianWeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6

export const PERSIAN_WEEKDAY_NAMES = [
  'شنبه',
  'یکشنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنج‌شنبه',
  'جمعه',
] as const

export const FIELDREP_MIN_PERSIAN_YEAR = 1300
export const FIELDREP_MAX_PERSIAN_YEAR = 1600

export interface PersianMonthGridCell {
  canonicalDate: string
  persian: PersianDateParts
  weekdayIndex: PersianWeekdayIndex
  inCurrentMonth: boolean
}

export interface PersianMonthGrid {
  year: number
  month: number
  startsOn: string
  endsOn: string
  firstWeekdayIndex: PersianWeekdayIndex
  daysInMonth: number
  cells: PersianMonthGridCell[]
}

const DAY_MS = 86_400_000
const PERSIAN_EPOCH_JDN = 1_948_320

/**
 * ICU's current arithmetic calendar includes explicit non-leap correction years
 * where the simple 33-year rule would otherwise disagree with the astronomical
 * Persian calendar. FieldRep's supported range needs 1502; 1601 is retained as
 * the immediate boundary correction so conversion around 1600 remains stable.
 *
 * Source: Unicode ICU PersianCalendar.java, current main branch at implementation
 * time. Keep this list/version under regression review when ICU changes.
 */
const ICU_NON_LEAP_CORRECTIONS = new Set<number>([
  1502,
  1601,
  1634,
  1667,
  1700,
  1733,
  1766,
  1799,
  1832,
  1865,
  1898,
  1931,
  1964,
  1997,
  2030,
  2059,
  2063,
  2096,
  2129,
  2158,
  2162,
  2191,
  2195,
  2224,
  2228,
  2257,
  2261,
  2290,
  2294,
  2323,
  2327,
  2356,
  2360,
  2389,
  2393,
  2422,
  2426,
  2455,
  2459,
  2488,
  2492,
  2521,
  2525,
  2554,
  2558,
  2587,
  2591,
  2620,
  2624,
  2653,
  2657,
  2686,
  2690,
  2719,
  2723,
  2748,
  2752,
  2756,
  2781,
  2785,
  2789,
  2818,
  2822,
  2847,
  2851,
  2855,
  2880,
  2884,
  2888,
  2913,
  2917,
  2921,
  2946,
  2950,
  2954,
  2979,
  2983,
  2987,
])

export function persianDateToCanonical(parts: PersianDateParts): string {
  assertValidPersianDate(parts)
  const jdn =
    firstPersianDayJdn(parts.year) +
    daysBeforePersianMonth(parts.month) +
    parts.day -
    1
  return gregorianPartsToCanonical(jdnToGregorian(jdn))
}

export function canonicalDateToPersian(canonicalDate: string): PersianDateParts {
  const gregorian = canonicalToGregorianParts(canonicalDate)
  const jdn = gregorianToJdn(gregorian.year, gregorian.month, gregorian.day)

  // A Gregorian year overlaps two Persian years. Start with the later likely
  // candidate then adjust against Farvardin 1 boundaries.
  let year = gregorian.year - 621
  while (jdn < firstPersianDayJdn(year)) year -= 1
  while (jdn >= firstPersianDayJdn(year + 1)) year += 1

  assertFieldRepYear(year)
  const dayOfYear = jdn - firstPersianDayJdn(year)
  const month = dayOfYear < 186 ? Math.floor(dayOfYear / 31) + 1 : Math.floor((dayOfYear - 186) / 30) + 7
  const day = dayOfYear - daysBeforePersianMonth(month) + 1
  const result = { year, month, day }

  if (!isValidPersianDate(result)) {
    throw new RangeError(`canonical date ${canonicalDate} produced an invalid Persian date`)
  }
  return result
}

export function isPersianLeapYear(year: number): boolean {
  assertFieldRepYear(year)
  return isPersianLeapYearUnchecked(year)
}

export function persianMonthLength(year: number, month: number): number {
  assertFieldRepYear(year)
  assertMonth(month)
  if (month <= 6) return 31
  if (month <= 11) return 30
  return isPersianLeapYearUnchecked(year) ? 30 : 29
}

export function isValidPersianDate(parts: PersianDateParts): boolean {
  if (
    !Number.isInteger(parts.year) ||
    parts.year < FIELDREP_MIN_PERSIAN_YEAR ||
    parts.year > FIELDREP_MAX_PERSIAN_YEAR
  ) {
    return false
  }
  if (!Number.isInteger(parts.month) || parts.month < 1 || parts.month > 12) return false
  if (!Number.isInteger(parts.day) || parts.day < 1) return false
  return parts.day <= persianMonthLength(parts.year, parts.month)
}

export function persianWeekdayIndex(parts: PersianDateParts): PersianWeekdayIndex {
  return canonicalWeekdayIndex(persianDateToCanonical(parts))
}

export function canonicalWeekdayIndex(canonicalDate: string): PersianWeekdayIndex {
  const date = canonicalToUtcDate(canonicalDate)
  // JS: Sunday=0...Saturday=6. FieldRep UI: Saturday=0...Friday=6.
  return ((date.getUTCDay() + 1) % 7) as PersianWeekdayIndex
}

export function addCanonicalCalendarDays(canonicalDate: string, days: number): string {
  if (!Number.isInteger(days)) throw new RangeError('days must be an integer')
  const date = canonicalToUtcDate(canonicalDate)
  return utcDateToCanonical(new Date(date.getTime() + days * DAY_MS))
}

export function buildPersianMonthGrid(year: number, month: number): PersianMonthGrid {
  assertFieldRepYear(year)
  assertMonth(month)

  const startsOn = persianDateToCanonical({ year, month, day: 1 })
  const daysInMonth = persianMonthLength(year, month)
  const endsOn = persianDateToCanonical({ year, month, day: daysInMonth })
  const firstWeekdayIndex = canonicalWeekdayIndex(startsOn)
  const gridStart = addCanonicalCalendarDays(startsOn, -firstWeekdayIndex)
  const cellCount = Math.ceil((firstWeekdayIndex + daysInMonth) / 7) * 7
  const cells: PersianMonthGridCell[] = []

  for (let index = 0; index < cellCount; index += 1) {
    const canonicalDate = addCanonicalCalendarDays(gridStart, index)
    const persian = canonicalDateToPersian(canonicalDate)
    cells.push({
      canonicalDate,
      persian,
      weekdayIndex: (index % 7) as PersianWeekdayIndex,
      inCurrentMonth: persian.year === year && persian.month === month,
    })
  }

  return {
    year,
    month,
    startsOn,
    endsOn,
    firstWeekdayIndex,
    daysInMonth,
    cells,
  }
}

export function persianWeekBounds(parts: PersianDateParts): { saturday: string; friday: string } {
  const canonicalDate = persianDateToCanonical(parts)
  const weekday = canonicalWeekdayIndex(canonicalDate)
  const saturday = addCanonicalCalendarDays(canonicalDate, -weekday)
  return { saturday, friday: addCanonicalCalendarDays(saturday, 6) }
}

function isPersianLeapYearUnchecked(year: number): boolean {
  if (ICU_NON_LEAP_CORRECTIONS.has(year)) return false
  if (ICU_NON_LEAP_CORRECTIONS.has(year - 1)) return true
  return floorMod(25 * year + 11, 33) < 8
}

function firstPersianDayJdn(year: number): number {
  let days = 365 * (year - 1) + floorDiv(8 * year + 21, 33)
  if (ICU_NON_LEAP_CORRECTIONS.has(year - 1)) days -= 1
  // ICU Calendar's month-start hook returns the day before the civil first day;
  // the conversion helpers here use conventional JDN for the civil day itself.
  return PERSIAN_EPOCH_JDN + days
}

function daysBeforePersianMonth(month: number): number {
  assertMonth(month)
  return month <= 7 ? (month - 1) * 31 : 186 + (month - 7) * 30
}

function assertValidPersianDate(parts: PersianDateParts): void {
  if (!isValidPersianDate(parts)) {
    throw new RangeError(
      `invalid Persian calendar date ${parts.year}/${parts.month}/${parts.day}; supported years are ${FIELDREP_MIN_PERSIAN_YEAR}..${FIELDREP_MAX_PERSIAN_YEAR}`,
    )
  }
}

function assertFieldRepYear(year: number): void {
  if (
    !Number.isInteger(year) ||
    year < FIELDREP_MIN_PERSIAN_YEAR ||
    year > FIELDREP_MAX_PERSIAN_YEAR
  ) {
    throw new RangeError(
      `Persian year must be between ${FIELDREP_MIN_PERSIAN_YEAR} and ${FIELDREP_MAX_PERSIAN_YEAR}`,
    )
  }
}

function assertMonth(month: number): void {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError('Persian month must be between 1 and 12')
  }
}

function canonicalToGregorianParts(value: string): GregorianDateParts {
  const date = canonicalToUtcDate(value)
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  }
}

function canonicalToUtcDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new RangeError('canonical date must use YYYY-MM-DD format')
  }
  const parsed = Date.parse(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed)) throw new RangeError('invalid canonical calendar date')
  const date = new Date(parsed)
  if (utcDateToCanonical(date) !== value) throw new RangeError('invalid canonical calendar date')
  return date
}

function gregorianPartsToCanonical(parts: GregorianDateParts): string {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
  if (
    date.getUTCFullYear() !== parts.year ||
    date.getUTCMonth() + 1 !== parts.month ||
    date.getUTCDate() !== parts.day
  ) {
    throw new RangeError('invalid Gregorian calendar date')
  }
  return utcDateToCanonical(date)
}

function utcDateToCanonical(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Gregorian date -> conventional Julian Day Number. */
function gregorianToJdn(gy: number, gm: number, gd: number): number {
  let d =
    truncDiv((gy + truncDiv(gm - 8, 6) + 100100) * 1461, 4) +
    truncDiv(153 * truncMod(gm + 9, 12) + 2, 5) +
    gd -
    34840408
  d = d - truncDiv(truncDiv(gy + 100100 + truncDiv(gm - 8, 6), 100) * 3, 4) + 752
  return d
}

/** Conventional Julian Day Number -> Gregorian date. */
function jdnToGregorian(jdn: number): GregorianDateParts {
  let j = 4 * jdn + 139361631
  j = j + truncDiv(truncDiv(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908
  const i = truncDiv(truncMod(j, 1461), 4) * 5 + 308
  const day = truncDiv(truncMod(i, 153), 5) + 1
  const month = truncMod(truncDiv(i, 153), 12) + 1
  const year = truncDiv(j, 1461) - 100100 + truncDiv(8 - month, 6)
  return { year, month, day }
}

function floorDiv(a: number, b: number): number {
  return Math.floor(a / b)
}

function floorMod(a: number, b: number): number {
  return ((a % b) + b) % b
}

function truncDiv(a: number, b: number): number {
  return Math.trunc(a / b)
}

function truncMod(a: number, b: number): number {
  return a - Math.trunc(a / b) * b
}

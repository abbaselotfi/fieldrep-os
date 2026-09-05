/**
 * Deterministic Persian (Solar Hijri/Jalali) calendar core for FieldRep OS.
 *
 * Conversion math is adapted from the Borkowski algorithm implementation in
 * jalaali-js (MIT). FieldRep OS intentionally supports 1300..1600 SH, which is
 * inside the range where that implementation and ECMAScript Intl Persian
 * calendar agree. See THIRD_PARTY_NOTICES.md and docs/P2-A10-CALENDAR-CORRECTNESS.md.
 *
 * IMPORTANT: official/religious holidays are data, not calendar arithmetic.
 * They must never be derived here from a tabular lunar-calendar approximation.
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

// Borkowski break years used by jalaali-js. The FieldRep-supported range
// (1300..1600) sits well inside these limits.
const BREAKS = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181,
  1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178,
] as const
const BORKOWSKI_MIN_YEAR = BREAKS[0]
const BORKOWSKI_MAX_YEAR = BREAKS[BREAKS.length - 1] - 1

interface JalCalCore {
  gy: number
  march: number
  jump: number
  n: number
}

export function persianDateToCanonical(parts: PersianDateParts): string {
  assertValidPersianDate(parts)
  const gregorian = toGregorian(parts.year, parts.month, parts.day)
  return gregorianPartsToCanonical(gregorian)
}

export function canonicalDateToPersian(canonicalDate: string): PersianDateParts {
  const gregorian = canonicalToGregorianParts(canonicalDate)
  const persian = toPersian(gregorian.year, gregorian.month, gregorian.day)
  assertFieldRepYear(persian.year)
  return persian
}

export function isPersianLeapYear(year: number): boolean {
  assertFieldRepYear(year)
  return jalCalLeap(year) === 0
}

export function persianMonthLength(year: number, month: number): number {
  assertFieldRepYear(year)
  assertMonth(month)
  if (month <= 6) return 31
  if (month <= 11) return 30
  return isPersianLeapYear(year) ? 30 : 29
}

export function isValidPersianDate(parts: PersianDateParts): boolean {
  if (!Number.isInteger(parts.year) || parts.year < FIELDREP_MIN_PERSIAN_YEAR || parts.year > FIELDREP_MAX_PERSIAN_YEAR) {
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
  // getUTCDay(): Sunday=0 ... Saturday=6. Iran/Persian calendar UI starts Saturday.
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

function assertValidPersianDate(parts: PersianDateParts): void {
  if (!isValidPersianDate(parts)) {
    throw new RangeError(
      `invalid Persian calendar date ${parts.year}/${parts.month}/${parts.day}; supported years are ${FIELDREP_MIN_PERSIAN_YEAR}..${FIELDREP_MAX_PERSIAN_YEAR}`,
    )
  }
}

function assertFieldRepYear(year: number): void {
  if (!Number.isInteger(year) || year < FIELDREP_MIN_PERSIAN_YEAR || year > FIELDREP_MAX_PERSIAN_YEAR) {
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

function toPersian(gy: number, gm: number, gd: number): PersianDateParts {
  const result = d2j(g2d(gy, gm, gd))
  return { year: result.jy, month: result.jm, day: result.jd }
}

function toGregorian(jy: number, jm: number, jd: number): GregorianDateParts {
  const result = d2g(j2d(jy, jm, jd))
  return { year: result.gy, month: result.gm, day: result.gd }
}

interface InternalPersianDate {
  jy: number
  jm: number
  jd: number
}

interface InternalGregorianDate {
  gy: number
  gm: number
  gd: number
}

function j2d(jy: number, jm: number, jd: number): number {
  const r = jalCalCore(jy)
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1
}

function d2j(jdn: number): InternalPersianDate {
  const gy = d2g(jdn).gy
  let jy = gy - 621
  const r = jalCal(jy)
  const jdn1f = g2d(r.gy, 3, r.march)
  let k = jdn - jdn1f

  if (k >= 0) {
    if (k <= 185) return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 }
    k -= 186
  } else {
    jy -= 1
    k += 179
    if (r.leap === 1) k += 1
  }

  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 }
}

function g2d(gy: number, gm: number, gd: number): number {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752
  return d
}

function d2g(jdn: number): InternalGregorianDate {
  let j = 4 * jdn + 139361631
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908
  const i = div(mod(j, 1461), 4) * 5 + 308
  const gd = div(mod(i, 153), 5) + 1
  const gm = mod(div(i, 153), 12) + 1
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6)
  return { gy, gm, gd }
}

function jalCal(jy: number): { leap: number; gy: number; march: number } {
  const { gy, march, jump, n } = jalCalCore(jy)
  return { leap: leapFromCycle(jump, n), gy, march }
}

function jalCalCore(jy: number): JalCalCore {
  if (!Number.isInteger(jy) || jy < BORKOWSKI_MIN_YEAR || jy > BORKOWSKI_MAX_YEAR) {
    throw new RangeError(
      `Persian year ${jy} is outside Borkowski conversion range ${BORKOWSKI_MIN_YEAR}..${BORKOWSKI_MAX_YEAR}`,
    )
  }

  const gy = jy + 621
  let leapJ = -14
  let jp: number = BREAKS[0]
  let jm = 0
  let jump = 0

  for (let index = 1; index < BREAKS.length; index += 1) {
    jm = BREAKS[index] as number
    jump = jm - jp
    if (jy < jm) break
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4)
    jp = jm
  }

  const n = jy - jp
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4)
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1

  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150
  const march = 20 + leapJ - leapG
  return { gy, march, jump, n }
}

function leapFromCycle(jump: number, n: number): number {
  let adjusted = n
  if (jump - n < 6) adjusted = n - jump + div(jump + 4, 33) * 33
  let leap = mod(mod(adjusted + 1, 33) - 1, 4)
  if (leap === -1) leap = 4
  return leap
}

function jalCalLeap(jy: number): number {
  const { jump, n } = jalCalCore(jy)
  return leapFromCycle(jump, n)
}

function div(a: number, b: number): number {
  return Math.trunc(a / b)
}

function mod(a: number, b: number): number {
  return a - Math.trunc(a / b) * b
}

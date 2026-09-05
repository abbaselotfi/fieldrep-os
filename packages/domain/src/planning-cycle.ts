import type { PlanningCycleId, WorkspaceId } from './identity'
import type { JalaliQuarter, PlanningCycleRef } from './planner-contracts'

export interface JalaliDateParts {
  year: number
  month: number
  day: number
}

export interface PlanningCycleBounds extends PlanningCycleRef {
  startsOn: string
  endsOn: string
}

export interface PlanningCycleSummary extends PlanningCycleBounds {
  id: PlanningCycleId
  workspaceId: WorkspaceId
  label: string
  status: 'draft' | 'active' | 'closed' | 'archived'
}

const PERSIAN_PARTS_FORMATTER = new Intl.DateTimeFormat('en-US-u-ca-persian', {
  calendar: 'persian',
  numberingSystem: 'latn',
  timeZone: 'UTC',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
})

const DAY_MS = 24 * 60 * 60 * 1000
const MIN_SUPPORTED_JALALI_YEAR = 1300
const MAX_SUPPORTED_JALALI_YEAR = 1600

export function canonicalDateToJalali(canonicalDate: string): JalaliDateParts {
  const date = canonicalDateToUtcDate(canonicalDate)
  return persianParts(date)
}

export function jalaliDateToCanonical(parts: JalaliDateParts): string {
  assertValidRequestedParts(parts)

  const yearStart = findJalaliYearStart(parts.year)
  const offset = daysBeforeJalaliMonth(parts.month) + parts.day - 1
  const candidate = new Date(yearStart.getTime() + offset * DAY_MS)
  const roundTrip = persianParts(candidate)

  if (
    roundTrip.year !== parts.year ||
    roundTrip.month !== parts.month ||
    roundTrip.day !== parts.day
  ) {
    throw new RangeError('invalid Jalali calendar date')
  }

  return utcDateToCanonical(candidate)
}

export function planningCycleBounds(cycle: PlanningCycleRef): PlanningCycleBounds {
  assertJalaliYear(cycle.jalaliYear)
  assertQuarter(cycle.quarter)

  const firstMonth = firstMonthOfQuarter(cycle.quarter)
  const startsOn = jalaliDateToCanonical({
    year: cycle.jalaliYear,
    month: firstMonth,
    day: 1,
  })

  const nextCycleStart =
    cycle.quarter === 4
      ? jalaliDateToCanonical({ year: cycle.jalaliYear + 1, month: 1, day: 1 })
      : jalaliDateToCanonical({ year: cycle.jalaliYear, month: firstMonth + 3, day: 1 })

  const endsOn = addCanonicalDays(nextCycleStart, -1)

  return {
    jalaliYear: cycle.jalaliYear,
    quarter: cycle.quarter,
    startsOn,
    endsOn,
  }
}

export function isDateInPlanningCycle(
  canonicalDate: string,
  cycle: PlanningCycleRef | PlanningCycleBounds,
): boolean {
  canonicalDateToUtcDate(canonicalDate)
  const bounds = 'startsOn' in cycle ? cycle : planningCycleBounds(cycle)
  return canonicalDate >= bounds.startsOn && canonicalDate <= bounds.endsOn
}

export function jalaliQuarterForCanonicalDate(canonicalDate: string): PlanningCycleRef {
  const parts = canonicalDateToJalali(canonicalDate)
  return {
    jalaliYear: parts.year,
    quarter: quarterForMonth(parts.month),
  }
}

export function addCanonicalDays(canonicalDate: string, days: number): string {
  if (!Number.isInteger(days)) throw new RangeError('days must be an integer')
  const date = canonicalDateToUtcDate(canonicalDate)
  return utcDateToCanonical(new Date(date.getTime() + days * DAY_MS))
}

function findJalaliYearStart(jalaliYear: number): Date {
  assertJalaliYear(jalaliYear)

  // Persian New Year falls around 20/21 March. Searching a narrow UTC window keeps
  // reverse conversion dependent on the platform's standards-based Persian calendar
  // implementation instead of maintaining a second calendar algorithm in FieldRep OS.
  const searchStart = Date.UTC(jalaliYear + 621, 2, 18)

  for (let offset = 0; offset < 8; offset += 1) {
    const candidate = new Date(searchStart + offset * DAY_MS)
    const parts = persianParts(candidate)
    if (parts.year === jalaliYear && parts.month === 1 && parts.day === 1) {
      return candidate
    }
  }

  throw new RangeError(`unable to resolve Jalali year ${jalaliYear}`)
}

function persianParts(date: Date): JalaliDateParts {
  const parts = PERSIAN_PARTS_FORMATTER.formatToParts(date)
  const values = new Map(parts.map((part) => [part.type, part.value]))
  const year = Number(values.get('year'))
  const month = Number(values.get('month'))
  const day = Number(values.get('day'))

  if (![year, month, day].every(Number.isInteger)) {
    throw new RangeError('Persian calendar formatting is unavailable in this runtime')
  }

  return { year, month, day }
}

function canonicalDateToUtcDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RangeError('canonical date must use YYYY-MM-DD format')
  }

  const parsed = Date.parse(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed)) throw new RangeError('invalid canonical calendar date')
  const date = new Date(parsed)
  if (utcDateToCanonical(date) !== value) throw new RangeError('invalid canonical calendar date')
  return date
}

function utcDateToCanonical(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function daysBeforeJalaliMonth(month: number): number {
  if (month <= 6) return (month - 1) * 31
  return 6 * 31 + (month - 7) * 30
}

function firstMonthOfQuarter(quarter: JalaliQuarter): number {
  return (quarter - 1) * 3 + 1
}

function quarterForMonth(month: number): JalaliQuarter {
  return Math.floor((month - 1) / 3 + 1) as JalaliQuarter
}

function assertValidRequestedParts(parts: JalaliDateParts): void {
  assertJalaliYear(parts.year)
  if (!Number.isInteger(parts.month) || parts.month < 1 || parts.month > 12) {
    throw new RangeError('Jalali month must be between 1 and 12')
  }
  if (!Number.isInteger(parts.day) || parts.day < 1 || parts.day > 31) {
    throw new RangeError('Jalali day must be between 1 and 31')
  }
}

function assertJalaliYear(year: number): void {
  if (
    !Number.isInteger(year) ||
    year < MIN_SUPPORTED_JALALI_YEAR ||
    year > MAX_SUPPORTED_JALALI_YEAR
  ) {
    throw new RangeError(
      `Jalali year must be between ${MIN_SUPPORTED_JALALI_YEAR} and ${MAX_SUPPORTED_JALALI_YEAR}`,
    )
  }
}

function assertQuarter(quarter: number): asserts quarter is JalaliQuarter {
  if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) {
    throw new RangeError('Jalali quarter must be between 1 and 4')
  }
}

import type { PlanningCycleId, WorkspaceId } from './identity'
import type { JalaliQuarter, PlanningCycleRef } from './planner-contracts'
import {
  addCanonicalCalendarDays,
  canonicalDateToPersian,
  FIELDREP_MAX_PERSIAN_YEAR,
  FIELDREP_MIN_PERSIAN_YEAR,
  persianDateToCanonical,
  type PersianDateParts,
} from './persian-calendar'

export type JalaliDateParts = PersianDateParts

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

export function canonicalDateToJalali(canonicalDate: string): JalaliDateParts {
  return canonicalDateToPersian(canonicalDate)
}

export function jalaliDateToCanonical(parts: JalaliDateParts): string {
  return persianDateToCanonical(parts)
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

  return {
    jalaliYear: cycle.jalaliYear,
    quarter: cycle.quarter,
    startsOn,
    endsOn: addCanonicalDays(nextCycleStart, -1),
  }
}

export function isDateInPlanningCycle(
  canonicalDate: string,
  cycle: PlanningCycleRef | PlanningCycleBounds,
): boolean {
  canonicalDateToJalali(canonicalDate)
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
  return addCanonicalCalendarDays(canonicalDate, days)
}

function firstMonthOfQuarter(quarter: JalaliQuarter): number {
  return (quarter - 1) * 3 + 1
}

function quarterForMonth(month: number): JalaliQuarter {
  return Math.floor((month - 1) / 3 + 1) as JalaliQuarter
}

function assertJalaliYear(year: number): void {
  if (
    !Number.isInteger(year) ||
    year < FIELDREP_MIN_PERSIAN_YEAR ||
    year > FIELDREP_MAX_PERSIAN_YEAR
  ) {
    throw new RangeError(
      `Jalali year must be between ${FIELDREP_MIN_PERSIAN_YEAR} and ${FIELDREP_MAX_PERSIAN_YEAR}`,
    )
  }
}

function assertQuarter(quarter: number): asserts quarter is JalaliQuarter {
  if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) {
    throw new RangeError('Jalali quarter must be between 1 and 4')
  }
}

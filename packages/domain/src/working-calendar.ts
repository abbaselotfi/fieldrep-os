import {
  canonicalDateToPersian,
  canonicalWeekdayIndex,
  type PersianWeekdayIndex,
} from './persian-calendar'
import {
  officialCalendarEventsOn,
  type OfficialCalendarDataset,
  type OfficialCalendarEvent,
} from './official-calendar'

export type WorkingCalendarOverrideScope = 'company' | 'workspace'
export type WorkingCalendarOverrideMode = 'closure' | 'working_day'

export interface WorkingCalendarOverride {
  id: string
  scope: WorkingCalendarOverrideScope
  scopeId: string
  startsOn: string
  endsOn: string
  mode: WorkingCalendarOverrideMode
  title: string
  reason?: string | null
}

export type WorkingDayReasonCode =
  | 'official_holiday'
  | 'weekly_non_working_day'
  | 'company_closure'
  | 'workspace_closure'
  | 'company_working_day_override'
  | 'workspace_working_day_override'

export interface WorkingDayReason {
  code: WorkingDayReasonCode
  title: string
  blocking: boolean
  sourceId?: string
}

export interface ResolveWorkingDayInput {
  canonicalDate: string
  workingWeekdays: readonly PersianWeekdayIndex[]
  officialCalendar?: OfficialCalendarDataset
  companyOverrides?: readonly WorkingCalendarOverride[]
  workspaceOverrides?: readonly WorkingCalendarOverride[]
}

export interface WorkingDayContext {
  canonicalDate: string
  persianDate: ReturnType<typeof canonicalDateToPersian>
  weekdayIndex: PersianWeekdayIndex
  isWorkingDay: boolean
  planningAllowed: boolean
  officialEvents: OfficialCalendarEvent[]
  reasons: WorkingDayReason[]
}

/**
 * Resolves the civil working-day baseline. Activity/leave/trip conflicts are layered
 * later by P3 conflict services and must not mutate this deterministic base result.
 *
 * Precedence is intentionally conservative:
 * 1. Official public holiday is a hard non-working day.
 * 2. Company/workspace closure is a hard non-working day.
 * 3. Explicit working-day override may open a weekly non-working weekday, but it
 *    never silently overrides an official holiday or closure.
 * 4. Otherwise the configured Saturday-first working-week policy applies.
 */
export function resolveWorkingDay(input: ResolveWorkingDayInput): WorkingDayContext {
  const persianDate = canonicalDateToPersian(input.canonicalDate)
  const weekdayIndex = canonicalWeekdayIndex(input.canonicalDate)
  const workingWeekdays = new Set(input.workingWeekdays)
  assertWorkingWeekdays(workingWeekdays)

  const officialEvents = input.officialCalendar === undefined
    ? []
    : officialCalendarEventsOn(input.officialCalendar, input.canonicalDate)
  const officialHolidayEvents = officialEvents.filter((event) => event.isHoliday)

  const companyOverrides = matchingOverrides(input.companyOverrides ?? [], input.canonicalDate)
  const workspaceOverrides = matchingOverrides(input.workspaceOverrides ?? [], input.canonicalDate)
  const reasons: WorkingDayReason[] = []

  for (const event of officialHolidayEvents) {
    reasons.push({
      code: 'official_holiday',
      title: event.label,
      blocking: true,
      sourceId: event.id,
    })
  }

  for (const override of companyOverrides.filter((item) => item.mode === 'closure')) {
    reasons.push({
      code: 'company_closure',
      title: override.title,
      blocking: true,
      sourceId: override.id,
    })
  }
  for (const override of workspaceOverrides.filter((item) => item.mode === 'closure')) {
    reasons.push({
      code: 'workspace_closure',
      title: override.title,
      blocking: true,
      sourceId: override.id,
    })
  }

  const hardBlocked = reasons.some((reason) => reason.blocking)
  const companyWorkingOverride = latestMatching(companyOverrides, 'working_day')
  const workspaceWorkingOverride = latestMatching(workspaceOverrides, 'working_day')
  const explicitWorkingOverride = workspaceWorkingOverride ?? companyWorkingOverride

  if (explicitWorkingOverride !== null) {
    reasons.push({
      code: explicitWorkingOverride.scope === 'workspace'
        ? 'workspace_working_day_override'
        : 'company_working_day_override',
      title: explicitWorkingOverride.title,
      blocking: false,
      sourceId: explicitWorkingOverride.id,
    })
  }

  const weeklyWorking = workingWeekdays.has(weekdayIndex)
  if (!weeklyWorking && explicitWorkingOverride === null) {
    reasons.push({
      code: 'weekly_non_working_day',
      title: 'روز غیرکاری طبق برنامه هفتگی',
      blocking: true,
    })
  }

  const isWorkingDay = !hardBlocked && (weeklyWorking || explicitWorkingOverride !== null)

  return {
    canonicalDate: input.canonicalDate,
    persianDate,
    weekdayIndex,
    isWorkingDay,
    planningAllowed: isWorkingDay,
    officialEvents,
    reasons,
  }
}

export function validateWorkingCalendarOverride(override: WorkingCalendarOverride): void {
  canonicalDateToPersian(override.startsOn)
  canonicalDateToPersian(override.endsOn)
  if (override.id.trim() === '') throw new Error('working calendar override id is required')
  if (override.scopeId.trim() === '') throw new Error('working calendar override scope id is required')
  if (override.title.trim() === '') throw new Error('working calendar override title is required')
  if (override.endsOn < override.startsOn) {
    throw new Error('working calendar override end must not precede start')
  }
}

function matchingOverrides(
  overrides: readonly WorkingCalendarOverride[],
  canonicalDate: string,
): WorkingCalendarOverride[] {
  return overrides
    .filter((override) => {
      validateWorkingCalendarOverride(override)
      return override.startsOn <= canonicalDate && override.endsOn >= canonicalDate
    })
    .sort((left, right) => left.id.localeCompare(right.id))
}

function latestMatching(
  overrides: readonly WorkingCalendarOverride[],
  mode: WorkingCalendarOverrideMode,
): WorkingCalendarOverride | null {
  const matching = overrides.filter((override) => override.mode === mode)
  return matching.length === 0 ? null : matching[matching.length - 1]!
}

function assertWorkingWeekdays(weekdays: ReadonlySet<number>): void {
  for (const weekday of weekdays) {
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      throw new RangeError('working weekday index must be between 0 and 6')
    }
  }
}

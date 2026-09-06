import { readFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

function assert(condition, message) {
  if (!condition) throw new Error(`P3 calendar validation failed: ${message}`)
}

const domainIndex = await read('packages/domain/src/index.ts')
const calendarActivity = await read('packages/domain/src/calendar-activity.ts')
const workingCalendar = await read('packages/domain/src/working-calendar.ts')
const plannerEngine = await read('packages/domain/src/planner-engine.ts')
const calendarRepository = await read('packages/database/src/calendar-repository.ts')
const calendarApi = await read('apps/worker/src/routes/calendar-api.ts')
const calendarPage = await read('apps/web/src/pages/CalendarPage.tsx')
const migrationsDirectory = await readFile(
  path.join(root, 'migrations/workspace/0007_calendar_activities.sql'),
  'utf8',
)
const permissions = await read('packages/permissions/src/index.ts')

// Domain contracts: the visit-KPI boundary is the core P3 invariant.
assert(
  calendarActivity.includes("countsAsVisit: false,") &&
    calendarActivity.includes("countsAsVisit: true,"),
  'activity policies must distinguish visit vs non-visit categories',
)
assert(
  calendarActivity.includes('Non-visit activities must never be able to'),
  'the visit-KPI boundary contract must stay documented in the domain module',
)
assert(
  calendarActivity.includes('export function buildCalendarProjection'),
  'unified calendar projection must be provided by the domain',
)
assert(
  workingCalendar.includes('export function resolveWorkingDayContext'),
  'working-day resolution must be a pure domain service',
)
assert(
  workingCalendar.includes("export type PlanningConflictSeverity = 'info' | 'warning' | 'block'"),
  'conflict severities must include info/warning/block',
)
assert(
  plannerEngine.includes('day_not_plannable') && plannerEngine.includes('dayContext?'),
  'planner engine must consult the calendar constraint service',
)
assert(
  domainIndex.includes("from './calendar-activity'") &&
    domainIndex.includes("from './working-calendar'"),
  'domain barrel must export the P3 calendar modules',
)

// Persistence: activities never store visits; closures store canonical dates.
assert(
  migrationsDirectory.includes("CHECK (activity_type IN ('internal_meeting'"),
  'calendar activities must exclude visit rows at the schema level',
)
assert(
  migrationsDirectory.includes("canonical_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'"),
  'closures must persist canonical civil dates',
)
assert(
  calendarRepository.includes('export class WorkspaceCalendarRepository'),
  'workspace calendar repository must exist',
)

// API: fail-closed scope and self-service boundaries.
assert(
  calendarApi.includes("requireWorkspacePermission('calendar.read.own')"),
  'calendar reads must require calendar.read.own',
)
assert(
  calendarApi.includes("requireWorkspacePermission('activities.create.own')"),
  'leave/trip creation must require activities.create.own',
)
assert(
  calendarApi.includes('leave_request_not_cancellable'),
  'field users must not be able to cancel approved leave',
)
assert(
  permissions.includes("'activities.create.own'") && permissions.includes("'activities.update.own'"),
  'field-user permission set must cover activity create/update',
)

// UI: views render from the domain projection, not local hard-coded days.
assert(
  calendarPage.includes('buildCalendarMonthModel') &&
    calendarPage.includes('buildCalendarWeekModel'),
  'Calendar UI must render month/week views from the domain-backed view model',
)
assert(
  calendarPage.includes("VIEW_LABELS") &&
    calendarPage.includes("'agenda'"),
  'Calendar UI must expose month/week/day/agenda views',
)
assert(
  calendarPage.includes('buildPersianMonthGrid'),
  'Calendar UI must keep rendering from the domain month-grid engine',
)

console.log('P3 calendar structural/source validation: PASS')

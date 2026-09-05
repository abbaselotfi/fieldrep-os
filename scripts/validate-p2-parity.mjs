import { readFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

function assert(condition, message) {
  if (!condition) throw new Error(`P2 parity validation failed: ${message}`)
}

const golden = JSON.parse(await read('fixtures/p2/legacy-workbook-structure.json'))
const adapter = await read('packages/domain/src/legacy-workbook-adapter.ts')
const workbookImport = await read('packages/domain/src/workbook-import.ts')
const planningCycle = await read('packages/domain/src/planning-cycle.ts')
const calendarEngine = await read('packages/domain/src/persian-calendar.ts')
const calendarPage = await read('apps/web/src/pages/CalendarPage.tsx')
const reporting = await read('packages/domain/src/reporting.ts')

assert(golden.schemaVersion === 1, 'golden workbook structure schema must remain version 1')
assert(golden.source?.privacy === 'structural-metadata-only-no-customer-data', 'golden fixture must remain structural and non-identifying')
assert(golden.physision?.dataRows === 122, 'verified Physision row count changed unexpectedly')
assert(golden.physision?.uniqueCombinedLabels === 122, 'verified combined-label cardinality changed unexpectedly')
assert(golden.calendar?.verifiedWeekBlocks === 16, 'verified Calendar week-block count changed unexpectedly')
assert(golden.calendar?.visibleDateHeaders === 95, 'verified Calendar date-header count changed unexpectedly')
assert(golden.calendar?.matchedPlanCells === 359, 'verified Calendar Plan-cell count changed unexpectedly')
assert(golden.calendar?.unknownPlanCustomers === 0, 'verified Calendar must not contain unknown plan customers')
assert(golden.calendar?.dailyCountMismatches === 0, 'verified Calendar daily counts must reconcile exactly')
assert(golden.report?.traceablePhysicianRows === 79, 'verified Report physician-row count changed unexpectedly')
assert(golden.report?.routeMarkerRows === 14, 'verified Report route-marker count changed unexpectedly')
assert(golden.report?.unknownNonMarkerCustomerRows === 0, 'verified Report must not contain unknown non-marker customers')

assert(adapter.includes('LEGACY_DOCTOR_ROWS_PER_SESSION = 7'), 'legacy Calendar session height must remain explicit')
assert(adapter.includes('calendar_layout_verified:week_blocks='), 'legacy Calendar layout verification diagnostic is required')
assert(adapter.includes('calendar_daily_count_mismatch:'), 'legacy Calendar daily-count reconciliation is required')
assert(adapter.includes('report_route_marker_skipped:'), 'legacy Report route markers must remain non-visit rows')
assert(adapter.includes('legacyAliases'), 'legacy combined-label aliases must be preserved without changing canonical customer names')

assert(workbookImport.includes('customerAliases'), 'import preview must resolve legacy aliases to canonical customers')
assert(workbookImport.includes('duplicate_customer_alias'), 'alias collisions must fail closed')
assert(workbookImport.includes('product_counter_untraceable'), 'product counters must remain reconciliation-only')
assert(workbookImport.includes('visited_report_mismatch'), 'Visited must remain reconciled against traceable Actual Visits')

assert(planningCycle.includes("from './persian-calendar'"), 'planning cycles must use the single authoritative Persian calendar engine')
assert(calendarEngine.includes('Unicode ICU PersianCalendar'), 'calendar engine must remain pinned to the ICU-corrected arithmetic contract')
assert(calendarEngine.includes('ICU_NON_LEAP_CORRECTIONS'), 'ICU correction years must remain explicit and version-reviewable')

assert(calendarPage.includes('buildPersianMonthGrid'), 'Calendar UI must render from the domain month-grid engine')
assert(calendarPage.includes('canonicalWeekdayIndex'), 'Calendar selected-day weekday must use the Saturday-first domain index')
assert(!calendarPage.includes('leadingBlankDays'), 'Calendar UI must not restore a hard-coded leading-day offset')
assert(!calendarPage.includes('Array.from({ length: 31'), 'Calendar UI must not restore a hard-coded 31-day month')

assert(reporting.includes("visit.status !== 'completed'"), 'reporting must continue to project completed Actual Visits only')

console.log('P2 Excel-parity structural/source validation: PASS')

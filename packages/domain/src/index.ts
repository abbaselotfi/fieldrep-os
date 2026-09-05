export type {
  ActivityId,
  CalendarEventId,
  CompanyId,
  CustomerId,
  LocationId,
  MembershipId,
  OrganizationUnitId,
  PermissionKey,
  PlanEntryId,
  PlanningCycleId,
  ProductId,
  RoleId,
  RoleKey,
  RouteId,
  UserId,
  VisitId,
  WorkspaceId,
} from './identity'
export type { AuthContext } from './auth-context'
export { toAuthContext } from './auth-context'
export type {
  AuthenticatedWorkspaceResolution,
  SessionId,
  SessionIdentity,
} from './session'
export { resolveAuthenticatedWorkspace } from './session'
export type {
  CompanySummary,
  MembershipStatus,
  ScopeGrant,
  WorkspaceMembershipContext,
  WorkspaceSelectionResult,
  WorkspaceSummary,
} from './tenancy'
export { resolveWorkspaceSelection } from './tenancy'
export type {
  CompletedVisitFact,
  DailyTargetProgress,
  DailyTargetStatus,
  DuplicateConflict,
  DuplicateConflictKind,
  DuplicateConflictSeverity,
  DuplicatePolicy,
  FrequencyStatus,
  JalaliQuarter,
  PlanEntry,
  PlanEntrySource,
  PlanEntryStatus,
  PlanningCycleRef,
  VisitProgress,
} from './planner-contracts'
export {
  countActivePlanEntries,
  deriveVisitProgress,
  evaluateDailyTarget,
  EXCEL_PARITY_DUPLICATE_POLICY,
  findDuplicatePlanConflicts,
} from './planner-rules'
export type {
  PlanCandidateEvaluation,
  PlanCandidateEvaluationInput,
  PlannerIssue,
  PlannerIssueCode,
} from './planner-engine'
export { evaluatePlanCandidate } from './planner-engine'
export type {
  CustomerDetail,
  CustomerListFilters,
  CustomerLocationSummary,
  CustomerRecordScope,
  CustomerSource,
  CustomerStatus,
  CustomerSummary,
  CustomerType,
  DoctorCustomerProfile,
  RouteSummary,
} from './customer'
export type {
  Activity,
  ActivityStatus,
  ActivityType,
  CalendarBehavior,
  CalendarItem,
  CalendarItemStatus,
  CalendarItemType,
  CalendarScope,
  CalendarSourceType,
} from './calendar-contracts'
export {
  activityToCalendarItem,
  isCalendarItemVisibleToUser,
  validateActivity,
  validateCalendarItem,
} from './calendar-contracts'
export type {
  PersianDateParts,
  GregorianDateParts,
  PersianMonthGrid,
  PersianMonthGridCell,
  PersianWeekdayIndex,
} from './persian-calendar'
export {
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
} from './persian-calendar'
export type {
  OfficialCalendarDataset,
  OfficialCalendarEvent,
  OfficialCalendarEventKind,
  OfficialCalendarSource,
  OfficialCalendarValidationResult,
} from './official-calendar'
export {
  isOfficialHoliday,
  officialCalendarEventsOn,
  validateOfficialCalendarDataset,
} from './official-calendar'
export type {
  JalaliDateParts,
  PlanningCycleBounds,
  PlanningCycleSummary,
} from './planning-cycle'
export {
  addCanonicalDays,
  canonicalDateToJalali,
  isDateInPlanningCycle,
  jalaliDateToCanonical,
  jalaliQuarterForCanonicalDate,
  planningCycleBounds,
} from './planning-cycle'
export type {
  CustomerVisitCounters,
  ProductCallCounter,
  ProductSummary,
  VisitActual,
  VisitProductCall,
  VisitSource,
  VisitStatus,
} from './visit-contracts'
export type { CustomerVisitProgressProjection } from './visit-progress'
export { deriveCustomerVisitProgress } from './visit-progress'
export type {
  VisitReportBounds,
  VisitReportPeriod,
  VisitReportProductTotal,
  VisitReportSummary,
} from './reporting'
export {
  completedVisitCountForCustomer,
  completedVisitsInRange,
  summarizeVisitReport,
  visitReportBounds,
} from './reporting'
export type {
  WorkbookExtractedSnapshot,
  WorkbookImportIssue,
  WorkbookImportIssueCode,
  WorkbookImportPreview,
  WorkbookImportSeverity,
  WorkbookNormalizedCustomer,
  WorkbookNormalizedPlan,
  WorkbookNormalizedProduct,
  WorkbookNormalizedRoute,
  WorkbookNormalizedVisit,
  WorkbookPhysicianRow,
  WorkbookPlanRow,
  WorkbookReportRow,
} from './workbook-import'
export { previewWorkbookImport } from './workbook-import'
export type {
  LegacyCellValue,
  LegacyExtractedRow,
  LegacyWorkbookAdapterResult,
  LegacyWorkbookTabularSnapshot,
} from './legacy-workbook-adapter'
export { adaptLegacyWorkbookTabular } from './legacy-workbook-adapter'

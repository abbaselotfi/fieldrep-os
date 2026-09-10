export type {
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
  BusinessTrip,
  BusinessTripStatus,
  CalendarActivity,
  CalendarActivityPolicy,
  CalendarActivityStatus,
  CalendarActivityType,
  CalendarClosure,
  CalendarItem,
  CalendarItemType,
  CalendarLocationRef,
  CalendarProjectionInput,
  CalendarScope,
  CalendarSourceType,
  LeaveRequest,
  LeaveRequestStatus,
  LeaveRequestType,
  PlaceContext,
} from './calendar-activity'
export {
  buildCalendarProjection,
  CALENDAR_ACTIVITY_POLICIES,
  calendarItemFromActivity,
  calendarItemFromBusinessTrip,
  calendarItemFromClosure,
  calendarItemFromLeaveRequest,
  calendarItemFromOfficialEvent,
  calendarItemFromPlanEntry,
} from './calendar-activity'
export type {
  CalendarConstraintReason,
  PlanningConflict,
  PlanningConflictCode,
  PlanningConflictPolicy,
  PlanningConflictSeverity,
  WorkingDayContext,
  WorkingDayInput,
} from './working-calendar'
export {
  DEFAULT_PLANNING_CONFLICT_POLICY,
  DEFAULT_WORKING_WEEKDAYS,
  evaluatePlanDayConflicts,
  evaluatePlanEntryConflicts,
  hasBlockingConflict,
  resolveWorkingDayContext,
} from './working-calendar'

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
  LocationCaptureMode,
  LocationCoordinates,
  LocationEvidence,
  LocationEvidenceValidationCode,
  LocationEvidenceValidationIssue,
  LocationEvidenceValidationResult,
  CreateLocationEvidenceInput,
} from './location-evidence'
export {
  deriveLocationCaptureMode,
  validateLocationEvidenceInput,
} from './location-evidence'
export type { GeoPoint } from './geo-distance'
export { distanceMetersBetween } from './geo-distance'
export type { VisitVerificationPolicy } from './visit-verification-policy'
export {
  DEFAULT_VISIT_VERIFICATION_POLICY,
  normalizeVisitVerificationPolicy,
} from './visit-verification-policy'
export type {
  EvaluateVisitVerificationInput,
  VisitVerificationReason,
  VisitVerificationResult,
  VisitVerificationStatus,
} from './visit-verification'
export { evaluateVisitVerification } from './visit-verification'
export type {
  RecommendationFeatureInputs,
  RecommendationFeatures,
} from './recommendation-features'
export { deriveRecommendationFeatures } from './recommendation-features'
export type { RecommendationWeights } from './recommendation-policy'
export {
  DEFAULT_RECOMMENDATION_WEIGHTS,
  normalizeRecommendationWeights,
  RECOMMENDATION_ENGINE_VERSION,
} from './recommendation-policy'
export type { RecommendationScore, SuggestionReason } from './recommendation-scoring'
export {
  maxRecommendationScore,
  scoreRecommendationCandidate,
} from './recommendation-scoring'
export type {
  RecommendationCandidate,
  RecommendationConstraint,
} from './recommendation-candidate'
export {
  candidateIsAllowed,
  rankRecommendationCandidates,
} from './recommendation-candidate'
export type { PriorityBand, SuggestionStatus, VisitSuggestion } from './recommendation-suggestion'
export { derivePriorityBand } from './recommendation-suggestion'
export type { BuildRecommendationBatchInput, RankedCandidate, RecommendationBatch } from './recommendation-batch'
export { buildRecommendationBatch } from './recommendation-batch'
export type {
  AcceptedPlanSeed,
  DecideSuggestionInput,
  SuggestionAction,
  SuggestionDecision,
} from './recommendation-acceptance'
export { decideSuggestion, SuggestionDecisionError } from './recommendation-acceptance'
export type {
  FindNearbyCustomersInput,
  NearbyCustomer,
  NearbyCustomerCandidate,
} from './nearby-customers'
export { findNearbyCustomers } from './nearby-customers'
export type {
  OptimizableStop,
  OptimizeStopOrderInput,
  OptimizedStopOrder,
} from './route-optimization'
export { optimizeStopOrder } from './route-optimization'
export type {
  MapAdapter,
  MapHttpRequest,
  StaticMapMarker,
  StaticMapRequest,
} from './map-provider'
export { createNeshanMapAdapter } from './map-provider'
export type {
  BuildDistanceMatrixInput,
  DistanceMatrixEntry,
  DistanceMatrixResult,
} from './distance-matrix'
export { buildDistanceMatrix } from './distance-matrix'
export type { NavigationLink, NavigationProvider, NavigationTarget } from './external-navigation'
export { buildNavigationLink, buildNavigationLinks } from './external-navigation'
export type {
  TeamMemberProgress,
  TeamMemberProgressRow,
  TeamProgressSummary,
} from './team-progress'
export { buildTeamProgressSummary } from './team-progress'
export type {
  TeamVerificationSummary,
  UserVerificationSummary,
  VerificationEntry,
  VerificationStatusCounts,
} from './verification-summary'
export { summarizeVerifications } from './verification-summary'
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
export type {
  MemberDrillDownFact,
  MemberDrillDownRow,
  MemberDrillDownSummary,
} from './member-drill-down'
export { buildMemberDrillDown } from './member-drill-down'
export type { TeamExportRow } from './team-export'
export { serializeTeamCoverageCsv } from './team-export'
export type {
  OrgUnitNode,
  OrgUnitParentChangeError,
  OrgUnitRecord,
} from './org-unit-tree'
export {
  buildOrgUnitTree,
  collectOrgUnitDescendants,
  orgUnitContains,
  validateOrgUnitParentChange,
} from './org-unit-tree'
export type {
  WorkspaceFeatureKey,
  WorkspaceFeatureSetting,
  WorkspaceFeatureState,
} from './workspace-feature-policy'
export {
  WORKSPACE_FEATURE_KEYS,
  isWorkspaceFeatureEnabled,
  resolveWorkspaceFeatureState,
} from './workspace-feature-policy'

import type {
  CustomerId,
  PlanEntryId,
  ProductId,
  RouteId,
  UserId,
  VisitId,
  WorkspaceId,
} from './identity'

export type JalaliQuarter = 1 | 2 | 3 | 4

export interface PlanningCycleRef {
  jalaliYear: number
  quarter: JalaliQuarter
}

export type PlanEntryStatus =
  | 'planned'
  | 'completed'
  | 'missed'
  | 'cancelled'
  | 'rescheduled'

export type PlanEntrySource = 'manual' | 'suggested' | 'imported'

export interface PlanEntry {
  id: PlanEntryId
  workspaceId: WorkspaceId
  ownerUserId: UserId
  customerId: CustomerId
  planDate: string
  routeId?: RouteId
  productIds?: ProductId[]
  status: PlanEntryStatus
  source: PlanEntrySource
}

export interface CompletedVisitFact {
  id: VisitId
  workspaceId: WorkspaceId
  ownerUserId: UserId
  customerId: CustomerId
  occurredAt: string
  productIds: ProductId[]
  planEntryId?: PlanEntryId
}

export type FrequencyStatus = 'not_required' | 'incomplete' | 'achieved' | 'over_achieved'

export interface VisitProgress {
  frequency: number
  visited: number
  remaining: number
  achievementRatio: number | null
  achievementPercent: number | null
  status: FrequencyStatus
}

export type DailyTargetStatus = 'below_target' | 'target_met' | 'over_target'

export interface DailyTargetProgress {
  target: number
  planned: number
  remaining: number
  overBy: number
  status: DailyTargetStatus
}

export type DuplicateConflictKind = 'same_day' | 'nearby_day'
export type DuplicateConflictSeverity = 'error' | 'warning'

export interface DuplicateConflict {
  entryId: PlanEntryId
  customerId: CustomerId
  existingDate: string
  candidateDate: string
  dayDistance: number
  kind: DuplicateConflictKind
  severity: DuplicateConflictSeverity
}

export interface DuplicatePolicy {
  nearbyDayWindow: number
  sameDaySeverity: DuplicateConflictSeverity
  nearbyDaySeverity: DuplicateConflictSeverity
}

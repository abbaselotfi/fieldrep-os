import type {
  CustomerId,
  LocationId,
  PlanEntryId,
  ProductId,
  UserId,
  VisitId,
  WorkspaceId,
} from './identity'

export type VisitStatus = 'completed' | 'cancelled'
export type VisitSource = 'planned' | 'unplanned'

export interface VisitProductCall {
  productId: ProductId
  callCount: number
}

export interface VisitActual {
  id: VisitId
  workspaceId: WorkspaceId
  ownerUserId: UserId
  customerId: CustomerId
  planEntryId?: PlanEntryId
  visitDate: string
  occurredAt: number
  status: VisitStatus
  source: VisitSource
  notes?: string
  locationId?: LocationId
  productCalls: VisitProductCall[]
}

export interface ProductSummary {
  id: ProductId
  workspaceId: WorkspaceId
  code: string | null
  name: string
  status: 'active' | 'inactive' | 'archived'
  sortOrder: number
}

export interface ProductCallCounter {
  productId: ProductId
  callCount: number
}

export interface CustomerVisitCounters {
  customerId: CustomerId
  completedVisitRecords: number
  totalProductCalls: number
  byProduct: ProductCallCounter[]
}

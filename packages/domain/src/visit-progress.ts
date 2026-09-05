import type { VisitProgress } from './planner-contracts'
import { deriveVisitProgress } from './planner-rules'
import type { CustomerVisitCounters, ProductCallCounter } from './visit-contracts'

export interface CustomerVisitProgressProjection {
  customerId: CustomerVisitCounters['customerId']
  completedVisitRecords: number
  totalProductCalls: number
  byProduct: ProductCallCounter[]
  progress: VisitProgress
}

export function deriveCustomerVisitProgress(
  requiredFrequency: number,
  counters: CustomerVisitCounters,
): CustomerVisitProgressProjection {
  return {
    customerId: counters.customerId,
    completedVisitRecords: counters.completedVisitRecords,
    totalProductCalls: counters.totalProductCalls,
    byProduct: counters.byProduct.map((item) => ({ ...item })),
    progress: deriveVisitProgress(requiredFrequency, counters.completedVisitRecords),
  }
}

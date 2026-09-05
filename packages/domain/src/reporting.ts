import type { CustomerId, ProductId } from './identity'
import {
  addCanonicalDays,
  canonicalDateToJalali,
  jalaliDateToCanonical,
} from './planning-cycle'
import type { VisitActual } from './visit-contracts'

export type VisitReportPeriod = 'day' | 'week' | 'jalali_month'

export interface VisitReportBounds {
  from: string
  to: string
}

export interface VisitReportProductTotal {
  productId: ProductId
  callCount: number
}

export interface VisitReportSummary {
  bounds: VisitReportBounds
  completedVisits: number
  uniqueCustomers: number
  plannedVisits: number
  unplannedVisits: number
  totalProductCalls: number
  byProduct: VisitReportProductTotal[]
}

export function visitReportBounds(
  anchorDate: string,
  period: VisitReportPeriod,
): VisitReportBounds {
  canonicalDateToJalali(anchorDate)

  if (period === 'day') return { from: anchorDate, to: anchorDate }

  if (period === 'week') {
    const weekday = new Date(`${anchorDate}T00:00:00.000Z`).getUTCDay()
    const daysSinceSaturday = (weekday + 1) % 7
    const from = addCanonicalDays(anchorDate, -daysSinceSaturday)
    return { from, to: addCanonicalDays(from, 6) }
  }

  const jalali = canonicalDateToJalali(anchorDate)
  const from = jalaliDateToCanonical({ year: jalali.year, month: jalali.month, day: 1 })
  const nextMonth = jalali.month === 12
    ? { year: jalali.year + 1, month: 1, day: 1 }
    : { year: jalali.year, month: jalali.month + 1, day: 1 }

  return {
    from,
    to: addCanonicalDays(jalaliDateToCanonical(nextMonth), -1),
  }
}

export function completedVisitsInRange(
  visits: readonly VisitActual[],
  bounds: VisitReportBounds,
): VisitActual[] {
  assertBounds(bounds)
  const unique = new Map<string, VisitActual>()

  for (const visit of visits) {
    if (visit.status !== 'completed') continue
    if (visit.visitDate < bounds.from || visit.visitDate > bounds.to) continue
    if (!unique.has(visit.id)) unique.set(visit.id, visit)
  }

  return [...unique.values()].sort((left, right) =>
    left.visitDate.localeCompare(right.visitDate) ||
    left.occurredAt - right.occurredAt ||
    left.id.localeCompare(right.id),
  )
}

export function summarizeVisitReport(
  visits: readonly VisitActual[],
  bounds: VisitReportBounds,
): VisitReportSummary {
  const completed = completedVisitsInRange(visits, bounds)
  const byProduct = new Map<ProductId, number>()

  for (const visit of completed) {
    for (const call of visit.productCalls) {
      byProduct.set(call.productId, (byProduct.get(call.productId) ?? 0) + call.callCount)
    }
  }

  const productTotals = [...byProduct.entries()]
    .map(([productId, callCount]) => ({ productId, callCount }))
    .sort((left, right) => left.productId.localeCompare(right.productId))

  return {
    bounds: { ...bounds },
    completedVisits: completed.length,
    uniqueCustomers: new Set(completed.map((visit) => visit.customerId)).size,
    plannedVisits: completed.filter((visit) => visit.source === 'planned').length,
    unplannedVisits: completed.filter((visit) => visit.source === 'unplanned').length,
    totalProductCalls: productTotals.reduce((sum, item) => sum + item.callCount, 0),
    byProduct: productTotals,
  }
}

export function completedVisitCountForCustomer(
  visits: readonly VisitActual[],
  bounds: VisitReportBounds,
  customerId: CustomerId,
): number {
  return completedVisitsInRange(visits, bounds).filter(
    (visit) => visit.customerId === customerId,
  ).length
}

function assertBounds(bounds: VisitReportBounds): void {
  canonicalDateToJalali(bounds.from)
  canonicalDateToJalali(bounds.to)
  if (bounds.from > bounds.to) throw new RangeError('report range start must not exceed end')
}

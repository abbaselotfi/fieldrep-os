import { describe, expect, it } from 'vitest'

import type { VisitActual } from './visit-contracts'
import {
  completedVisitCountForCustomer,
  completedVisitsInRange,
  summarizeVisitReport,
  visitReportBounds,
} from './reporting'

function visit(overrides: Partial<VisitActual> = {}): VisitActual {
  return {
    id: 'visit-1',
    workspaceId: 'workspace-a',
    ownerUserId: 'user-1',
    customerId: 'doctor-1',
    visitDate: '2026-09-06',
    occurredAt: Date.parse('2026-09-06T09:00:00.000Z'),
    status: 'completed',
    source: 'planned',
    productCalls: [{ productId: 'product-1', callCount: 1 }],
    ...overrides,
  }
}

const visits: VisitActual[] = [
  visit(),
  visit({
    id: 'visit-2',
    customerId: 'doctor-2',
    visitDate: '2026-09-07',
    occurredAt: Date.parse('2026-09-07T10:00:00.000Z'),
    source: 'unplanned',
    productCalls: [
      { productId: 'product-1', callCount: 1 },
      { productId: 'product-2', callCount: 1 },
    ],
  }),
  visit({
    id: 'visit-3',
    customerId: 'doctor-1',
    visitDate: '2026-09-12',
    occurredAt: Date.parse('2026-09-12T11:00:00.000Z'),
    productCalls: [{ productId: 'product-2', callCount: 1 }],
  }),
  visit({
    id: 'visit-cancelled',
    visitDate: '2026-09-07',
    status: 'cancelled',
  }),
]

describe('visit reporting', () => {
  it('calculates Saturday-Friday week bounds around an anchor date', () => {
    expect(visitReportBounds('2026-09-06', 'week')).toEqual({
      from: '2026-09-05',
      to: '2026-09-11',
    })
  })

  it('calculates Jalali month bounds from the canonical anchor date', () => {
    expect(visitReportBounds('2026-09-06', 'jalali_month')).toEqual({
      from: '2026-08-23',
      to: '2026-09-22',
    })
  })

  it('keeps daily, weekly and monthly reports on the same underlying completed records', () => {
    const daily = summarizeVisitReport(visits, visitReportBounds('2026-09-06', 'day'))
    const weekly = summarizeVisitReport(visits, visitReportBounds('2026-09-06', 'week'))
    const monthly = summarizeVisitReport(visits, visitReportBounds('2026-09-06', 'jalali_month'))

    expect(daily).toMatchObject({ completedVisits: 1, uniqueCustomers: 1, totalProductCalls: 1 })
    expect(weekly).toMatchObject({
      completedVisits: 2,
      uniqueCustomers: 2,
      plannedVisits: 1,
      unplannedVisits: 1,
      totalProductCalls: 3,
    })
    expect(monthly).toMatchObject({ completedVisits: 3, uniqueCustomers: 2, totalProductCalls: 4 })
  })

  it('deduplicates the same visit id and excludes cancelled actuals', () => {
    const duplicate = { ...visits[0]! }
    const completed = completedVisitsInRange(
      [...visits, duplicate],
      { from: '2026-09-01', to: '2026-09-30' },
    )

    expect(completed.map((item) => item.id)).toEqual(['visit-1', 'visit-2', 'visit-3'])
  })

  it('reconciles per-customer report totals with Visited for the same range', () => {
    const bounds = visitReportBounds('2026-09-06', 'jalali_month')

    expect(completedVisitCountForCustomer(visits, bounds, 'doctor-1')).toBe(2)
    expect(completedVisitCountForCustomer(visits, bounds, 'doctor-2')).toBe(1)
  })
})

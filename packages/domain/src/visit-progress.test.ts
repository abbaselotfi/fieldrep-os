import { describe, expect, it } from 'vitest'

import { deriveCustomerVisitProgress } from './visit-progress'

describe('customer visit progress projection', () => {
  it('uses completed actual visit records for Visited rather than product-call totals', () => {
    const projection = deriveCustomerVisitProgress(6, {
      customerId: 'doctor-1',
      completedVisitRecords: 4,
      totalProductCalls: 7,
      byProduct: [
        { productId: 'product-1', callCount: 4 },
        { productId: 'product-2', callCount: 3 },
      ],
    })

    expect(projection.progress).toEqual({
      frequency: 6,
      visited: 4,
      remaining: 2,
      achievementRatio: 4 / 6,
      achievementPercent: (4 / 6) * 100,
      status: 'incomplete',
    })
    expect(projection.totalProductCalls).toBe(7)
  })

  it('preserves over-achievement above 100 percent', () => {
    const projection = deriveCustomerVisitProgress(3, {
      customerId: 'doctor-1',
      completedVisitRecords: 4,
      totalProductCalls: 4,
      byProduct: [],
    })

    expect(projection.progress).toMatchObject({
      visited: 4,
      frequency: 3,
      achievementPercent: 133.33333333333331,
      status: 'over_achieved',
      remaining: 0,
    })
  })

  it('handles zero required frequency without division by zero', () => {
    const projection = deriveCustomerVisitProgress(0, {
      customerId: 'doctor-1',
      completedVisitRecords: 2,
      totalProductCalls: 3,
      byProduct: [],
    })

    expect(projection.progress).toMatchObject({
      frequency: 0,
      visited: 2,
      achievementRatio: null,
      achievementPercent: null,
      status: 'not_required',
    })
  })
})

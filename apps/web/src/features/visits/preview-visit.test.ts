import { describe, expect, it } from 'vitest'

import {
  createPreviewVisitActual,
  normalizePreviewProductCalls,
  previewVisitProducts,
} from './preview-visit'

describe('preview visit actual', () => {
  it('creates a planned actual and preserves product call counters', () => {
    const actual = createPreviewVisitActual(
      {
        customerId: 'doctor-1',
        planEntryId: 'plan-1',
        visitDate: '2026-09-06',
        time: '11:30',
        notes: '  follow-up  ',
        productCounts: {
          [previewVisitProducts[0]!.id]: 2,
          [previewVisitProducts[1]!.id]: 1,
          [previewVisitProducts[2]!.id]: 0,
        },
      },
      'visit-1',
    )

    expect(actual).toMatchObject({
      id: 'visit-1',
      customerId: 'doctor-1',
      planEntryId: 'plan-1',
      source: 'planned',
      status: 'completed',
      notes: 'follow-up',
    })
    expect(actual.productCalls).toEqual([
      { productId: previewVisitProducts[0]!.id, callCount: 2 },
      { productId: previewVisitProducts[1]!.id, callCount: 1 },
    ])
  })

  it('creates an unplanned actual when there is no plan link', () => {
    const actual = createPreviewVisitActual(
      {
        customerId: 'doctor-1',
        visitDate: '2026-09-07',
        time: '09:00',
        productCounts: {},
      },
      'visit-2',
    )

    expect(actual.source).toBe('unplanned')
    expect(actual).not.toHaveProperty('planEntryId')
  })

  it('rejects impossible canonical dates and invalid time values', () => {
    expect(() =>
      createPreviewVisitActual(
        {
          customerId: 'doctor-1',
          visitDate: '2026-02-31',
          time: '09:00',
          productCounts: {},
        },
        'visit-3',
      ),
    ).toThrow('invalid_visit_date')

    expect(() =>
      createPreviewVisitActual(
        {
          customerId: 'doctor-1',
          visitDate: '2026-09-06',
          time: '25:00',
          productCounts: {},
        },
        'visit-4',
      ),
    ).toThrow('invalid_visit_time')
  })

  it('rejects negative or unknown product counters', () => {
    expect(() =>
      normalizePreviewProductCalls({ [previewVisitProducts[0]!.id]: -1 }),
    ).toThrow('invalid_product_call_count')

    expect(() => normalizePreviewProductCalls({ 'unknown-product': 1 })).toThrow('unknown_product')
  })
})

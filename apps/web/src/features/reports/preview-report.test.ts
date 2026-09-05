import { describe, expect, it } from 'vitest'

import { buildPreviewReport, previewProductNames, previewReportVisits } from './preview-report'

describe('preview reporting', () => {
  it('builds daily totals from actual visit records', () => {
    const report = buildPreviewReport('day')

    expect(report).toMatchObject({
      planned: 8,
      completed: 7,
      uniqueCustomers: 7,
      plannedActuals: 6,
      unplannedActuals: 1,
      totalProductCalls: 8,
    })
    expect(report.visits).toHaveLength(7)
  })

  it('uses the same actual records for weekly and monthly rollups without duplication', () => {
    const weekly = buildPreviewReport('week')
    const monthly = buildPreviewReport('month')

    expect(weekly).toMatchObject({ planned: 24, completed: 11, uniqueCustomers: 8, totalProductCalls: 13 })
    expect(monthly).toMatchObject({ planned: 24, completed: 13, uniqueCustomers: 8, totalProductCalls: 15 })
    expect(new Set(monthly.visits.map((visit) => visit.id)).size).toBe(monthly.visits.length)
  })

  it('renders configured product names instead of product ids', () => {
    expect(previewProductNames(previewReportVisits[1]!.productCalls)).toBe('Toujeo، Soliqua')
  })
})

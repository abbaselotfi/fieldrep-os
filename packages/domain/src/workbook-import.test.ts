import { describe, expect, it } from 'vitest'

import { previewWorkbookImport, type WorkbookExtractedSnapshot } from './workbook-import'

const sha = 'a'.repeat(64)

function snapshot(overrides: Partial<WorkbookExtractedSnapshot> = {}): WorkbookExtractedSnapshot {
  return {
    sourceName: 'Plan And Report-Final Q2.xlsm',
    sourceSha256: sha,
    parserVersion: 'fieldrep-excel-adapter-v1',
    physicianRows: [
      {
        rowNumber: 2,
        name: 'دکتر آرمان رضایی',
        specialty: 'داخلی',
        classKey: 'A',
        route: 'Route 8',
        address: 'مشهد، احمدآباد',
        frequency: 6,
        visited: 2,
        achievementPercent: 33.3,
        productCounters: { Toujeo: 1, Soliqua: 1 },
      },
      {
        rowNumber: 3,
        name: 'دکتر سارا زمانی',
        specialty: 'نفرولوژی',
        classKey: 'B',
        route: 'Route 7',
        frequency: 4,
        visited: 1,
        productCounters: { Toujeo: 1 },
      },
    ],
    reportRows: [
      {
        rowNumber: 2,
        visitDate: '2026-09-06',
        customerName: 'دکتر آرمان رضایی',
        productNames: ['Toujeo'],
        reportText: 'Follow-up',
      },
      {
        rowNumber: 3,
        visitDate: '2026-09-07',
        customerName: 'دکتر آرمان رضایی',
        productNames: ['Soliqua'],
      },
      {
        rowNumber: 4,
        visitDate: '2026-09-08',
        customerName: 'دکتر سارا زمانی',
        productNames: ['Toujeo'],
      },
    ],
    planRows: [
      {
        rowNumber: 10,
        planDate: '2026-09-09',
        customerName: 'دکتر آرمان رضایی',
        route: 'Route 8',
        productNames: ['Toujeo'],
      },
    ],
    ...overrides,
  }
}

describe('workbook import preview', () => {
  it('normalizes physician, route, product, actual and plan rows into reviewable entities', () => {
    const preview = previewWorkbookImport(snapshot())

    expect(preview.summary).toMatchObject({
      routes: 2,
      customers: 2,
      products: 2,
      visits: 3,
      plans: 1,
      errors: 0,
      canApply: true,
    })
    expect(preview.customers[0]?.requiredFrequency).toBeGreaterThanOrEqual(4)
    expect(preview.visits[0]).toMatchObject({
      visitDate: '2026-09-06',
      reportText: 'Follow-up',
    })
  })

  it('does not fabricate historical Actual Visits from workbook Visited/product counters', () => {
    const preview = previewWorkbookImport(
      snapshot({
        reportRows: [],
        planRows: [],
      }),
    )

    expect(preview.visits).toHaveLength(0)
    expect(preview.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'visited_report_mismatch', severity: 'warning' }),
        expect.objectContaining({ code: 'product_counter_untraceable', severity: 'warning' }),
      ]),
    )
  })

  it('recomputes achievement instead of trusting spreadsheet percentage cells', () => {
    const preview = previewWorkbookImport(snapshot())

    expect(preview.issues).toContainEqual(
      expect.objectContaining({
        code: 'achievement_recomputed',
        sheetName: 'Physision',
        rowNumber: 2,
        severity: 'warning',
      }),
    )
  })

  it('fails closed when a report row references a customer absent from the physician sheet', () => {
    const preview = previewWorkbookImport(
      snapshot({
        reportRows: [
          {
            rowNumber: 20,
            visitDate: '2026-09-06',
            customerName: 'Unknown Doctor',
            productNames: ['Toujeo'],
          },
        ],
      }),
    )

    expect(preview.summary.canApply).toBe(false)
    expect(preview.summary.errors).toBe(1)
    expect(preview.issues).toContainEqual(
      expect.objectContaining({ code: 'unknown_report_customer', severity: 'error' }),
    )
  })

  it('warns and keeps the first physician row for duplicate normalized names', () => {
    const preview = previewWorkbookImport(
      snapshot({
        physicianRows: [
          snapshot().physicianRows[0]!,
          { ...snapshot().physicianRows[0]!, rowNumber: 50, name: '  دکتر آرمان   رضایی  ' },
        ],
        reportRows: [],
        planRows: [],
      }),
    )

    expect(preview.customers).toHaveLength(1)
    expect(preview.issues).toContainEqual(
      expect.objectContaining({ code: 'duplicate_physician_row', rowNumber: 50 }),
    )
  })

  it('rejects a malformed source fingerprint before producing a preview', () => {
    expect(() => previewWorkbookImport(snapshot({ sourceSha256: 'not-a-sha' }))).toThrow(
      'sourceSha256 must be lowercase SHA-256 hex',
    )
  })
})

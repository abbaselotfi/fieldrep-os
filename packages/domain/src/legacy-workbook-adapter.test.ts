import { describe, expect, it } from 'vitest'

import { adaptLegacyWorkbookTabular, type LegacyWorkbookTabularSnapshot } from './legacy-workbook-adapter'

function source(overrides: Partial<LegacyWorkbookTabularSnapshot> = {}): LegacyWorkbookTabularSnapshot {
  return {
    sourceName: 'legacy.xlsm',
    sourceSha256: 'b'.repeat(64),
    parserVersion: 'fieldrep-ooxml-stdlib-v1',
    sheets: {
      Physision: [
        { rowNumber: 1, cells: ['Name', 'Specialty', 'Class', 'Route', 'Address', 'Frequency', 'Visited', 'Achievement', 'Toujeo', 'Soliqua'] },
        { rowNumber: 2, cells: ['دکتر الف', 'داخلی', 'A', 'Route 8', 'مشهد', 6, 2, 0.3333, 1, 1] },
      ],
      Report: [
        { rowNumber: 1, cells: ['Date', 'Doctor', 'Product', 'Report'] },
        { rowNumber: 2, cells: ['1405/06/15', 'دکتر الف', 'Toujeo, Soliqua', 'پیگیری'] },
        { rowNumber: 3, cells: [46271, 'دکتر الف', 'Toujeo', 'Excel serial date'] },
      ],
      Calendar: [{ rowNumber: 2, cells: ['شهریور'] }],
    },
    ...overrides,
  }
}

describe('legacy workbook tabular adapter', () => {
  it('maps physician headers, product counters and achievement percentages', () => {
    const result = adaptLegacyWorkbookTabular(source())

    expect(result.snapshot.physicianRows).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        name: 'دکتر الف',
        specialty: 'داخلی',
        classKey: 'A',
        route: 'Route 8',
        address: 'مشهد',
        frequency: 6,
        visited: 2,
        achievementPercent: 33.33,
        productCounters: { Toujeo: 1, Soliqua: 1 },
      }),
    ])
  })

  it('converts Jalali report dates and separates multiple products', () => {
    const result = adaptLegacyWorkbookTabular(source())

    expect(result.snapshot.reportRows[0]).toMatchObject({
      rowNumber: 2,
      visitDate: '2026-09-06',
      customerName: 'دکتر الف',
      productNames: ['Toujeo', 'Soliqua'],
      reportText: 'پیگیری',
    })
  })

  it('converts numeric Excel serial dates to canonical dates', () => {
    const result = adaptLegacyWorkbookTabular(source())
    expect(result.snapshot.reportRows[1]?.visitDate).toMatch(/^2026-/u)
  })

  it('does not guess Calendar plan cells before the real workbook layout is verified', () => {
    const result = adaptLegacyWorkbookTabular(source())

    expect(result.snapshot.planRows).toEqual([])
    expect(result.diagnostics).toContain('calendar_present:plan_cell_mapping_requires_verified_workbook_layout')
  })

  it('fails softly into diagnostics when expected sheets are missing', () => {
    const result = adaptLegacyWorkbookTabular(source({ sheets: {} }))

    expect(result.snapshot.physicianRows).toEqual([])
    expect(result.snapshot.reportRows).toEqual([])
    expect(result.diagnostics).toEqual(
      expect.arrayContaining(['missing_sheet:Physision', 'missing_sheet:Report']),
    )
  })
})

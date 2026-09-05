import { describe, expect, it } from 'vitest'

import {
  adaptLegacyWorkbookTabular,
  type LegacyWorkbookTabularSnapshot,
} from './legacy-workbook-adapter'
import { previewWorkbookImport } from './workbook-import'

function source(
  overrides: Partial<LegacyWorkbookTabularSnapshot> = {},
): LegacyWorkbookTabularSnapshot {
  return {
    sourceName: 'legacy.xlsm',
    sourceSha256: 'b'.repeat(64),
    parserVersion: 'fieldrep-ooxml-stdlib-v1',
    sheets: {
      Physision: [
        {
          rowNumber: 1,
          cells: [
            'Column1',
            'نام پزشک',
            'تخصص',
            'Class',
            'مسیر',
            'آدرس',
            'frequency ',
            'Visited',
            'Status',
            '% Achivment',
            'Soliqua',
            'Toujeo',
          ],
        },
        {
          rowNumber: 2,
          cells: [
            'پزشک یک A',
            'پزشک یک',
            'داخلی',
            'A',
            'Route 8',
            'مشهد',
            6,
            2,
            '❌',
            0.5,
            1,
            1,
          ],
        },
        {
          rowNumber: 3,
          cells: [
            'پزشک دو B (0.5)',
            'پزشک دو',
            'قلب',
            'B (0.5)',
            'Route 7',
            'مشهد',
            3,
            1,
            '❌',
            1 / 3,
            0,
            1,
          ],
        },
        {
          rowNumber: 4,
          cells: ['تعطیل x', 'تعطیل', 'تعطیل', 'x', 'تعطیل', 'تعطیل', null, 10, '🟡', '#DIV/0!', 10, 0],
        },
      ],
      Report: [
        { rowNumber: 1, cells: [null, null, null, 'شهریور'] },
        { rowNumber: 2, cells: ['تاريخ', 'روز هفته', 'نام پزشک', 'دارو', 'گزارش ويزيت'] },
        { rowNumber: 3, cells: ['1405/06/14', 'شنبه', 'پزشک یک A', 'Toujeo', 'پیگیری'] },
        { rowNumber: 4, cells: [null, null, 'پزشک دو B (0.5)', 'Soliqua', null] },
        { rowNumber: 5, cells: [null, null, 'Route 8', 'Toujeo', null] },
      ],
      Calendar: [
        {
          rowNumber: 2,
          cells: [
            'شنبه', null,
            'يکشنبه', null,
            'دوشنبه', null,
            'سه‌شنبه', null,
            'چهارشنبه', null,
            'پنج‌شنبه', null,
            'جمعه', null,
          ],
        },
        {
          rowNumber: 3,
          cells: ['1405/06/14', null, null, null, null, null, null, null, null, null, null, null, null, null],
        },
        {
          rowNumber: 4,
          cells: ['Route 8', 'Route 7', null, null, null, null, null, null, null, null, null, null, null, null],
        },
        {
          rowNumber: 5,
          cells: ['پزشک یک A', 'پزشک دو B (0.5)', null, null, null, null, null, null, null, null, null, null, null, null],
        },
        {
          rowNumber: 6,
          cells: ['تعطیل x', null, null, null, null, null, null, null, null, null, null, null, null, null],
        },
        { rowNumber: 12, cells: [3, null, null, null, null, null, null, null, null, null, null, null, null, null] },
      ],
    },
    ...overrides,
  }
}

describe('legacy workbook tabular adapter', () => {
  it('maps exact physician headers while preserving combined-label aliases', () => {
    const result = adaptLegacyWorkbookTabular(source())

    expect(result.snapshot.physicianRows).toHaveLength(2)
    expect(result.snapshot.physicianRows[0]).toEqual(
      expect.objectContaining({
        rowNumber: 2,
        name: 'پزشک یک',
        legacyAliases: ['پزشک یک A'],
        specialty: 'داخلی',
        classKey: 'A',
        route: 'Route 8',
        address: 'مشهد',
        frequency: 6,
        visited: 2,
        achievementPercent: 50,
        productCounters: { Soliqua: 1, Toujeo: 1 },
      }),
    )
    expect(result.snapshot.physicianRows[1]).toEqual(
      expect.objectContaining({
        name: 'پزشک دو',
        legacyAliases: ['پزشک دو B (0.5)'],
        classKey: 'B (0.5)',
      }),
    )
    expect(result.diagnostics).toContain('holiday_sentinel_physician_skipped:row=4')
  })

  it('carries Report dates forward, accepts combined aliases and ignores route markers', () => {
    const result = adaptLegacyWorkbookTabular(source())

    expect(result.snapshot.reportRows).toEqual([
      expect.objectContaining({
        rowNumber: 3,
        visitDate: '2026-09-05',
        customerName: 'پزشک یک A',
        productNames: ['Toujeo'],
        reportText: 'پیگیری',
      }),
      expect.objectContaining({
        rowNumber: 4,
        visitDate: '2026-09-05',
        customerName: 'پزشک دو B (0.5)',
        productNames: ['Soliqua'],
      }),
    ])
    expect(result.diagnostics).toContain(
      'report_route_marker_skipped:row=5:value=Route 8',
    )
    expect(result.diagnostics.some((value) => value.startsWith('report_unknown_customer'))).toBe(false)
  })

  it('maps verified Calendar sessions with exact combined labels and source-cell provenance', () => {
    const result = adaptLegacyWorkbookTabular(source())

    expect(result.snapshot.planRows).toEqual([
      {
        rowNumber: 5,
        sourceCell: 'A5',
        planDate: '2026-09-05',
        customerName: 'پزشک یک A',
        route: 'Route 8',
      },
      {
        rowNumber: 5,
        sourceCell: 'B5',
        planDate: '2026-09-05',
        customerName: 'پزشک دو B (0.5)',
        route: 'Route 7',
      },
    ])
    expect(result.diagnostics).toContain('calendar_holiday_sentinel_skipped:cell=A6')
    expect(result.diagnostics).toContain('calendar_layout_verified:week_blocks=1')
    expect(result.diagnostics.some((value) => value.startsWith('calendar_daily_count_mismatch'))).toBe(false)
  })

  it('resolves Report and Calendar combined labels to canonical physician records', () => {
    const adapted = adaptLegacyWorkbookTabular(source())
    const preview = previewWorkbookImport(adapted.snapshot)

    expect(preview.summary).toMatchObject({
      customers: 2,
      visits: 2,
      plans: 2,
      errors: 0,
      canApply: true,
    })
    expect(preview.visits.map((visit) => visit.customerNaturalKey)).toEqual([
      'پزشک یک',
      'پزشک دو',
    ])
    expect(preview.plans.map((plan) => plan.customerNaturalKey)).toEqual([
      'پزشک یک',
      'پزشک دو',
    ])
  })

  it('converts numeric Excel serial dates to canonical dates', () => {
    const result = adaptLegacyWorkbookTabular(
      source({
        sheets: {
          ...source().sheets,
          Report: [
            { rowNumber: 1, cells: ['Date', 'Doctor', 'Product', 'Report'] },
            { rowNumber: 2, cells: [46271, 'پزشک یک A', 'Toujeo', 'Excel serial date'] },
          ],
        },
      }),
    )
    expect(result.snapshot.reportRows[0]?.visitDate).toMatch(/^2026-/u)
  })

  it('fails softly into diagnostics when expected sheets are missing', () => {
    const result = adaptLegacyWorkbookTabular(source({ sheets: {} }))

    expect(result.snapshot.physicianRows).toEqual([])
    expect(result.snapshot.reportRows).toEqual([])
    expect(result.snapshot.planRows).toEqual([])
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        'missing_sheet:Physision',
        'missing_sheet:Report',
        'missing_sheet:Calendar',
      ]),
    )
  })
})

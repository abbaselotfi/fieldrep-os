import { describe, expect, it } from 'vitest'

import {
  formatJalaliLongDate,
  formatJalaliMonthTitle,
  getJalaliDateParts,
} from './jalali'

describe('Jalali date foundation', () => {
  it('resolves Nowruz 1405 with timezone-aware Persian calendar parts', () => {
    const parts = getJalaliDateParts(new Date('2026-03-21T12:00:00.000Z'))

    expect(parts).toEqual({ year: 1405, month: 1, day: 1 })
  })

  it('formats Persian month and long-date labels for UI surfaces', () => {
    const value = new Date('2026-03-21T12:00:00.000Z')

    expect(formatJalaliMonthTitle(value)).toContain('فروردین')
    expect(formatJalaliLongDate(value)).toContain('فروردین')
  })

  it('rejects invalid dates instead of rendering misleading calendar values', () => {
    expect(() => getJalaliDateParts(new Date(Number.NaN))).toThrow(RangeError)
  })
})

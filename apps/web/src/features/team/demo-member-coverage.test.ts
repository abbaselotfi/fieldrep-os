import { describe, expect, it } from 'vitest'

import { describeCoverageBand } from './demo-member-coverage'

describe('member drill-down demo labels', () => {
  it('bands coverage ratios in Persian', () => {
    expect(describeCoverageBand(1)).toBe('پوشش کامل')
    expect(describeCoverageBand(0.5)).toBe('نیمه‌تمام')
    expect(describeCoverageBand(0.2)).toBe('عقب‌افتاده')
  })
})

import { describe, expect, it } from 'vitest'

import { buildMemberDrillDown } from './member-drill-down'

describe('member drill-down', () => {
  it('projects per-customer coverage for one member only', () => {
    const summary = buildMemberDrillDown('u1', [
      { userId: 'u1', customerId: 'c2', customerName: 'دکتر ب', requiredFrequency: 2, completedVisits: 1, plannedVisits: 1 },
      { userId: 'u1', customerId: 'c1', customerName: 'دکتر الف', requiredFrequency: 3, completedVisits: 3, plannedVisits: 0 },
      { userId: 'u2', customerId: 'c9', customerName: 'دکتر دیگر', requiredFrequency: 5, completedVisits: 5, plannedVisits: 0 },
    ])

    expect(summary.userId).toBe('u1')
    expect(summary.rowCount).toBe(2)
    expect(summary.customersCovered).toBe(1)
    expect(summary.customersRemaining).toBe(1)
    // Deterministic dashboard order.
    expect(summary.rows.map((row) => row.customerId)).toEqual(['c1', 'c2'])
    expect(summary.rows[1]).toMatchObject({ coverageRatio: 0.5, remaining: 1 })
  })

  it('treats not-required customers as fully covered', () => {
    const summary = buildMemberDrillDown('u1', [
      { userId: 'u1', customerId: 'c1', customerName: 'دکتر الف', requiredFrequency: 0, completedVisits: 0, plannedVisits: 0 },
    ])

    expect(summary.rows[0]).toMatchObject({ coverageRatio: 1, remaining: 0 })
    expect(summary.customersCovered).toBe(1)
  })
})

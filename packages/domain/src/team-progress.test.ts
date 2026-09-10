import { describe, expect, it } from 'vitest'

import { buildTeamProgressSummary } from './team-progress'

describe('buildTeamProgressSummary', () => {
  it('aggregates per-member facts with per-member and team ratios', () => {
    const summary = buildTeamProgressSummary([
      { userId: 'u2', planTotal: 4, planCompleted: 3, visitCompleted: 5, visitCancelled: 1 },
      { userId: 'u1', planTotal: 2, planCompleted: 2, visitCompleted: 1, visitCancelled: 0 },
    ])

    expect(summary.memberCount).toBe(2)
    expect(summary.planTotal).toBe(6)
    expect(summary.planCompleted).toBe(5)
    expect(summary.visitCompleted).toBe(6)
    expect(summary.visitCancelled).toBe(1)
    expect(summary.planCompletionRatio).toBeCloseTo(5 / 6)
    // Deterministic dashboard order.
    expect(summary.members.map((m) => m.userId)).toEqual(['u1', 'u2'])
    expect(summary.members[0]!.planCompletionRatio).toBe(1)
    expect(summary.members[1]!.planCompletionRatio).toBeCloseTo(3 / 4)
  })

  it('returns zero ratios for an empty team', () => {
    const summary = buildTeamProgressSummary([])
    expect(summary.memberCount).toBe(0)
    expect(summary.planCompletionRatio).toBe(0)
    expect(summary.members).toEqual([])
  })
})

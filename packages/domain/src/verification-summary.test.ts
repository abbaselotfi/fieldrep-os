import { describe, expect, it } from 'vitest'

import { summarizeVerifications } from './verification-summary'

describe('summarizeVerifications', () => {
  it('rolls up verification statuses per user and team-wide', () => {
    const summary = summarizeVerifications([
      { userId: 'u1', status: 'verified' },
      { userId: 'u1', status: 'nearby' },
      { userId: 'u2', status: 'outside' },
      { userId: 'u2', status: 'unverified' },
      { userId: 'u2', status: 'verified' },
    ])

    expect(summary.team).toMatchObject({ verified: 2, nearby: 1, unverified: 1, outside: 1, total: 5 })
    expect(summary.verifiedRatio).toBeCloseTo(2 / 5)
    expect(summary.byUser.map((u) => u.userId)).toEqual(['u1', 'u2'])
    expect(summary.byUser[0]).toMatchObject({ verified: 1, nearby: 1, total: 2, verifiedRatio: 0.5 })
    expect(summary.byUser[1]).toMatchObject({ verified: 1, total: 3 })
    expect(summary.byUser[1]!.verifiedRatio).toBeCloseTo(1 / 3)
  })

  it('handles an empty entry list', () => {
    const summary = summarizeVerifications([])
    expect(summary.team.total).toBe(0)
    expect(summary.verifiedRatio).toBe(0)
    expect(summary.byUser).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'

import { serializeTeamCoverageCsv } from './team-export'

describe('team coverage export', () => {
  it('serializes a deterministic CSV with a fixed header', () => {
    const csv = serializeTeamCoverageCsv([
      { userId: 'u2', customerId: 'c1', customerName: 'دکتر الف', requiredFrequency: 2, completedVisits: 2, plannedVisits: 0, coverageRatio: 1, remaining: 0 },
      { userId: 'u1', customerId: 'c2', customerName: 'دکتر ب', requiredFrequency: 2, completedVisits: 1, plannedVisits: 1, coverageRatio: 0.5, remaining: 1 },
    ])

    const lines = csv.split('\n')
    expect(lines[0]).toBe('userId,customerId,customerName,requiredFrequency,completedVisits,plannedVisits,coverageRatio,remaining')
    // Sorted by userId, then customerId — deterministic regardless of input order.
    expect(lines[1]?.startsWith('u1,c2')).toBe(true)
    expect(lines[2]?.startsWith('u2,c1')).toBe(true)
    expect(csv.endsWith('\n')).toBe(true)
  })

  it('quotes cells carrying commas', () => {
    const csv = serializeTeamCoverageCsv([
      { userId: 'u1', customerId: 'c1', customerName: 'دکتر الف, تهران', requiredFrequency: 1, completedVisits: 1, plannedVisits: 0, coverageRatio: 1, remaining: 0 },
    ])
    expect(csv).toContain('"دکتر الف, تهران"')
  })
})

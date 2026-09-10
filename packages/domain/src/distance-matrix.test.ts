import { describe, expect, it } from 'vitest'

import { buildDistanceMatrix } from './distance-matrix'

const points = [
  { id: 'a', point: { latitude: 35.6892, longitude: 51.389 } },
  { id: 'b', point: { latitude: 35.69, longitude: 51.3895 } },
  { id: 'c', point: { latitude: 35.75, longitude: 51.45 } },
]

describe('buildDistanceMatrix', () => {
  it('produces ordered pairs without self-distances by default', () => {
    const result = buildDistanceMatrix({ points })
    expect(result.entries).toHaveLength(6)
    expect(
      result.entries.every((entry) => entry.fromId !== entry.toId),
    ).toBe(true)
    expect(result.byId['a']?.['b']).toBeGreaterThan(0)
    expect(result.byId['a']?.['a']).toBeUndefined()
  })

  it('includes self pairs when requested', () => {
    const result = buildDistanceMatrix({ points: points.slice(0, 1), excludeSelf: false })
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]?.distanceMeters).toBe(0)
  })

  it('is symmetric for haversine distances', () => {
    const result = buildDistanceMatrix({ points })
    expect(result.byId['a']?.['b']).toBeCloseTo(result.byId['b']?.['a'] ?? -1, 6)
  })

  it('orders far pairs after near ones', () => {
    const result = buildDistanceMatrix({ points })
    expect(result.byId['a']?.['c']).toBeGreaterThan(result.byId['a']?.['b'] ?? 0)
  })
})
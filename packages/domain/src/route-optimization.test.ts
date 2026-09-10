import { describe, expect, it } from 'vitest'

import { optimizeStopOrder } from './route-optimization'

const start = { latitude: 35.6892, longitude: 51.389 }

describe('optimizeStopOrder', () => {
  const stops = [
    { id: 'far', point: { latitude: 35.75, longitude: 51.45 } },
    { id: 'near', point: { latitude: 35.69, longitude: 51.39 } },
    { id: 'mid', point: { latitude: 35.71, longitude: 51.41 } },
  ]

  it('orders stops greedily from the start point', () => {
    const result = optimizeStopOrder({ start, stops })
    expect(result.orderedStopIds).toEqual(['near', 'mid', 'far'])
    expect(result.legDistancesMeters).toHaveLength(3)
    expect(result.totalDistanceMeters).toBeGreaterThan(0)
  })

  it('appends the end point as the final leg', () => {
    const end = { latitude: 35.6892, longitude: 51.389 }
    const result = optimizeStopOrder({ start, stops: stops.slice(1, 2), end })
    expect(result.orderedStopIds).toEqual(['near'])
    expect(result.legDistancesMeters).toHaveLength(2)
  })

  it('starts from the first stop when no start point is given', () => {
    const result = optimizeStopOrder({ stops })
    expect(result.orderedStopIds[0]).toBe('far')
    expect(result.legDistancesMeters).toHaveLength(2)
  })

  it('is deterministic for identical input (§21)', () => {
    expect(optimizeStopOrder({ start, stops })).toEqual(optimizeStopOrder({ start, stops }))
  })

  it('handles a single stop and an empty list', () => {
    expect(optimizeStopOrder({ stops: [stops[1]!] })).toEqual({
      orderedStopIds: ['near'],
      legDistancesMeters: [],
      totalDistanceMeters: 0,
    })
    expect(optimizeStopOrder({ stops: [] })).toEqual({
      orderedStopIds: [],
      legDistancesMeters: [],
      totalDistanceMeters: 0,
    })
  })
})
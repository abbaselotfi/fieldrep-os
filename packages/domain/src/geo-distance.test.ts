import { describe, expect, it } from 'vitest'

import { distanceMetersBetween } from './geo-distance'

describe('distanceMetersBetween', () => {
  it('returns zero for identical points', () => {
    expect(distanceMetersBetween(
      { latitude: 35.6892, longitude: 51.389 },
      { latitude: 35.6892, longitude: 51.389 },
    )).toBe(0)
  })

  it('measures a known Tehran distance with sane accuracy', () => {
    // Azadi Tower -> Valiasr Square is roughly 8.5 km.
    const meters = distanceMetersBetween(
      { latitude: 35.6997, longitude: 51.3380 },
      { latitude: 35.7166, longitude: 51.4055 },
    )
    expect(meters).toBeGreaterThan(5_000)
    expect(meters).toBeLessThan(8_000)
  })

  it('is symmetric', () => {
    const a = { latitude: 35.6892, longitude: 51.389 }
    const b = { latitude: 35.7, longitude: 51.4 }
    expect(distanceMetersBetween(a, b)).toBeCloseTo(distanceMetersBetween(b, a), 6)
  })

  it('grows with latitude separation', () => {
    const base = { latitude: 0, longitude: 51 }
    const north = distanceMetersBetween(base, { latitude: 1, longitude: 51 })
    expect(north).toBeGreaterThan(110_000)
    expect(north).toBeLessThan(112_000)
  })
})
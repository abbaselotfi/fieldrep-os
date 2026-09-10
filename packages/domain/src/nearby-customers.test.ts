import { describe, expect, it } from 'vitest'

import { findNearbyCustomers } from './nearby-customers'

const center = { latitude: 35.6892, longitude: 51.389 }

function candidates() {
  return [
    {
      customerId: 'doctor-near',
      locationId: 'loc-1',
      point: { latitude: 35.69, longitude: 51.3895 },
      authorized: true,
    },
    {
      customerId: 'doctor-mid',
      locationId: 'loc-2',
      point: { latitude: 35.7, longitude: 51.4 },
      authorized: true,
    },
    {
      customerId: 'doctor-unauthorized',
      locationId: 'loc-3',
      point: { latitude: 35.6893, longitude: 51.3891 },
      authorized: false,
    },
  ] as const
}

describe('findNearbyCustomers', () => {
  it('returns authorized customers within the radius sorted by distance', () => {
    const nearby = findNearbyCustomers({
      point: center,
      radiusMeters: 2_000,
      customers: candidates(),
    })
    expect(nearby.map((entry) => entry.customerId)).toEqual(['doctor-near', 'doctor-mid'])
    expect(nearby[0]?.distanceMeters).toBeLessThan(nearby[1]?.distanceMeters ?? 0)
  })

  it('never presents unauthorized customers regardless of distance (§14)', () => {
    const nearby = findNearbyCustomers({
      point: center,
      radiusMeters: 100,
      customers: candidates(),
    })
    expect(nearby.map((entry) => entry.customerId)).not.toContain('doctor-unauthorized')
  })

  it('excludes customers beyond the radius', () => {
    const nearby = findNearbyCustomers({
      point: center,
      radiusMeters: 300,
      customers: candidates(),
    })
    expect(nearby.map((entry) => entry.customerId)).toEqual(['doctor-near'])
  })

  it('honours the limit and breaks distance ties deterministically', () => {
    const tieA = {
      customerId: 'a-tie',
      point: { latitude: 35.68925, longitude: 51.389 },
      authorized: true,
    }
    const tieB = {
      customerId: 'b-tie',
      point: { latitude: 35.68925, longitude: 51.389 },
      authorized: true,
    }
    const nearby = findNearbyCustomers({
      point: center,
      radiusMeters: 100,
      customers: [tieB, tieA],
      limit: 1,
    })
    expect(nearby.map((entry) => entry.customerId)).toEqual(['a-tie'])
  })
})
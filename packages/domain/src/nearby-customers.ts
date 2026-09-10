import type { GeoPoint } from './geo-distance'
import { distanceMetersBetween } from './geo-distance'

/**
 * Nearby customers (MAPS-LOCATION-SPEC §14).
 *
 * Pure application-owned geospatial filter. Authorization is enforced here:
 * unauthorized customers are dropped before sorting, never merely marked.
 * The device point is only compared against caller-supplied data and is
 * never forwarded to any provider (§14/§25 privacy boundary).
 */
export interface NearbyCustomerCandidate {
  customerId: string
  locationId?: string
  point: GeoPoint
  /** Result of the caller's authorization check for this customer. */
  authorized: boolean
}

export interface NearbyCustomer {
  customerId: string
  locationId?: string
  distanceMeters: number
}

export interface FindNearbyCustomersInput {
  point: GeoPoint
  radiusMeters: number
  customers: readonly NearbyCustomerCandidate[]
  /** Maximum results; defaults to all matches (already distance-sorted). */
  limit?: number
}

export function findNearbyCustomers(input: FindNearbyCustomersInput): NearbyCustomer[] {
  const radius = Math.max(0, input.radiusMeters)

  return input.customers
    .filter((candidate) => candidate.authorized)
    .map((candidate) => ({
      customerId: candidate.customerId,
      ...(candidate.locationId === undefined ? {} : { locationId: candidate.locationId }),
      distanceMeters: distanceMetersBetween(input.point, candidate.point),
    }))
    .filter((entry) => entry.distanceMeters <= radius)
    .sort((a, b) => {
      if (a.distanceMeters !== b.distanceMeters) return a.distanceMeters - b.distanceMeters
      return a.customerId < b.customerId ? -1 : a.customerId > b.customerId ? 1 : 0
    })
    .slice(0, Math.max(0, input.limit ?? Number.POSITIVE_INFINITY))
}
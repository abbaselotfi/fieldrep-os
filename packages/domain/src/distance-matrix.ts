import type { GeoPoint } from './geo-distance'
import { distanceMetersBetween } from './geo-distance'

/**
 * Internal distance matrix (MAPS-LOCATION-SPEC — distance matrix capability).
 *
 * Computed with the application-owned haversine so no device or customer
 * location ever leaves the system for a trivial pairwise distance (§25
 * privacy boundary). Provider matrices stay optional for *road* distances
 * and are plugged in at the edge, never required for core flows.
 */
export interface DistanceMatrixEntry {
  fromId: string
  toId: string
  distanceMeters: number
}

export interface BuildDistanceMatrixInput {
  points: ReadonlyArray<{ id: string; point: GeoPoint }>
  /** Exclude self-pairs (id === id); default true. */
  excludeSelf?: boolean
}

export interface DistanceMatrixResult {
  /** Row-major: every ordered (from, to) pair. */
  entries: DistanceMatrixEntry[]
  /** Direct lookup helper: matrix[fromId][toId] → meters. */
  byId: Record<string, Record<string, number>>
}

export function buildDistanceMatrix(input: BuildDistanceMatrixInput): DistanceMatrixResult {
  const excludeSelf = input.excludeSelf ?? true
  const entries: DistanceMatrixEntry[] = []
  const byId: Record<string, Record<string, number>> = {}

  for (const from of input.points) {
    byId[from.id] = {}
    for (const to of input.points) {
      if (excludeSelf && from.id === to.id) continue
      const meters = distanceMetersBetween(from.point, to.point)
      entries.push({ fromId: from.id, toId: to.id, distanceMeters: meters })
      byId[from.id]![to.id] = meters
    }
  }

  return { entries, byId }
}
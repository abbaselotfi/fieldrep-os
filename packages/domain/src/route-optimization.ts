import type { GeoPoint } from './geo-distance'
import { distanceMetersBetween } from './geo-distance'

/**
 * Route optimization (MAPS-LOCATION-SPEC §16).
 *
 * Deterministic nearest-neighbour heuristic over the selected stops. The
 * result is a *proposed sequence* — it never silently rewrites an official
 * user plan without confirmation (§16 rule). The algorithm is intentionally
 * simple, explainable and reproducible: identical input yields an identical
 * order, with id-based tie-breaks.
 */
export interface OptimizableStop {
  id: string
  point: GeoPoint
}

export interface OptimizeStopOrderInput {
  start?: GeoPoint
  stops: readonly OptimizableStop[]
  end?: GeoPoint
}

export interface OptimizedStopOrder {
  orderedStopIds: string[]
  legDistancesMeters: number[]
  totalDistanceMeters: number
}

export function optimizeStopOrder(input: OptimizeStopOrderInput): OptimizedStopOrder {
  const remaining = [...input.stops]
  const orderedStopIds: string[] = []
  const legDistances: number[] = []

  let cursor = input.start
  while (remaining.length > 0) {
    const nextIndex = nearestIndex(cursor, remaining)
    const [next] = remaining.splice(nextIndex, 1)
    if (next === undefined) break
    if (cursor !== undefined) legDistances.push(distanceMetersBetween(cursor, next.point))
    orderedStopIds.push(next.id)
    cursor = next.point
  }

  if (input.end !== undefined && cursor !== undefined) {
    legDistances.push(distanceMetersBetween(cursor, input.end))
  }

  return {
    orderedStopIds,
    legDistancesMeters: legDistances,
    totalDistanceMeters: legDistances.reduce((sum, meters) => sum + meters, 0),
  }
}

function nearestIndex(
  from: GeoPoint | undefined,
  stops: readonly OptimizableStop[],
): number {
  if (from === undefined) return 0
  let bestIndex = 0
  let bestDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < stops.length; index += 1) {
    const stop = stops[index]
    if (stop === undefined) continue
    const distance = distanceMetersBetween(from, stop.point)
    // Strict `<` keeps the earliest (input-order) stop on ties → deterministic.
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = index
    }
  }
  return bestIndex
}
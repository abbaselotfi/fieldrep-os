/**
 * Great-circle distance between two WGS-84 points (haversine formula).
 *
 * Pure domain math — no map-provider dependency (MAPS-LOCATION-SPEC §23:
 * geofence/distance policy is application-owned, never provider-owned).
 */
const EARTH_RADIUS_METERS = 6_371_008.8

export interface GeoPoint {
  latitude: number
  longitude: number
}

export function distanceMetersBetween(a: GeoPoint, b: GeoPoint): number {
  const rad = Math.PI / 180
  const lat1 = a.latitude * rad
  const lat2 = b.latitude * rad
  const deltaLat = (b.latitude - a.latitude) * rad
  const deltaLng = (b.longitude - a.longitude) * rad

  const sinLat = Math.sin(deltaLat / 2)
  const sinLng = Math.sin(deltaLng / 2)
  const h =
    sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)))
}
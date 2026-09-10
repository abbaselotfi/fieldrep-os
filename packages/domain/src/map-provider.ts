import type { GeoPoint } from './geo-distance'

/**
 * Provider-independent map adapter (MAPS-LOCATION-SPEC: provider geometry is
 * presentation data, not an authoritative business object). The domain only
 * describes *requests*; the concrete provider (Neshan first, Google where
 * required) is plugged in at the edge.
 */
export interface StaticMapMarker {
  point: GeoPoint
  label?: string
  color?: string
}

export interface StaticMapRequest {
  center: GeoPoint
  zoom: number
  width: number
  height: number
  markers?: readonly StaticMapMarker[]
}

/** A fully describable HTTP request — the caller performs the fetch. */
export interface MapHttpRequest {
  url: string
  headers: Record<string, string>
}

export interface MapAdapter {
  readonly providerId: 'neshan' | 'google'
  staticMapRequest(request: StaticMapRequest, apiKey: string): MapHttpRequest
}

/** Neshan static-map v2 (`Api-Key` header auth, standard/night styles). */
export function createNeshanMapAdapter(): MapAdapter {
  return {
    providerId: 'neshan',
    staticMapRequest(request, apiKey) {
      const parts = [
        `lat=${request.center.latitude.toFixed(6)}`,
        `lng=${request.center.longitude.toFixed(6)}`,
        `width=${String(Math.max(1, Math.round(request.width)))}`,
        `height=${String(Math.max(1, Math.round(request.height)))}`,
        `zoom=${String(Math.max(1, Math.min(20, Math.round(request.zoom))))}`,
        'type=standard',
      ]
      for (const marker of request.markers ?? []) {
        parts.push(`markers=${encodeURIComponent(formatNeshanMarker(marker))}`)
      }
      return {
        url: `https://api.neshan.org/v2/static?${parts.join('&')}`,
        headers: { 'Api-Key': apiKey },
      }
    },
  }
}

function formatNeshanMarker(marker: StaticMapMarker): string {
  const parts = [marker.point.latitude.toFixed(6), marker.point.longitude.toFixed(6)]
  if (marker.color !== undefined) parts.push(marker.color.replace('#', ''))
  if (marker.label !== undefined) parts.push(marker.label)
  return parts.join(',')
}
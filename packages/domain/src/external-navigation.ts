/**
 * External navigation hand-off (MAPS-LOCATION-SPEC: external navigation
 * capability). The app describes a *user-initiated* deep link to the device
 * navigation app; no location data flows anywhere until the user taps the
 * link (§25 privacy boundary — explicit action, no background tracking).
 */
export type NavigationProvider = 'neshan' | 'google'

export interface NavigationTarget {
  latitude: number
  longitude: number
  /** Optional free-text label shown by the navigation app. */
  title?: string
}

export interface NavigationLink {
  provider: NavigationProvider
  url: string
}

const NESHAN_BASE = 'https://neshan.org/maps/'
const GOOGLE_BASE = 'https://www.google.com/maps/dir/'

function formatCoord(value: number): string {
  return value.toFixed(6)
}

function appendTitle(url: string, title: string | undefined): string {
  if (title === undefined || title === '') return url
  return `${url}&title=${encodeURIComponent(title)}`
}

export function buildNavigationLink(
  provider: NavigationProvider,
  target: NavigationTarget,
): NavigationLink {
  const lat = formatCoord(target.latitude)
  const lng = formatCoord(target.longitude)

  if (provider === 'neshan') {
    return {
      provider,
      url: appendTitle(`${NESHAN_BASE}?lat=${lat}&lng=${lng}`, target.title),
    }
  }

  return {
    provider,
    // Google dir endpoint takes `destination=lat,lng`.
    url: appendTitle(
      `${GOOGLE_BASE}?api=1&destination=${lat}%2C${lng}`,
      target.title,
    ),
  }
}

export function buildNavigationLinks(target: NavigationTarget): NavigationLink[] {
  return [
    buildNavigationLink('neshan', target),
    buildNavigationLink('google', target),
  ]
}
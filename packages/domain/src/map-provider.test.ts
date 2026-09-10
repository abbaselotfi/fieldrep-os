import { describe, expect, it } from 'vitest'

import { createNeshanMapAdapter } from './map-provider'

const center = { latitude: 35.6892, longitude: 51.389 }

describe('createNeshanMapAdapter', () => {
  const adapter = createNeshanMapAdapter()

  it('builds a Neshan static-map request with header-based auth', () => {
    const request = adapter.staticMapRequest(
      {
        center,
        zoom: 14,
        width: 640,
        height: 360,
        markers: [{ point: center, label: 'A', color: '#10b981' }],
      },
      'test-key',
    )

    expect(request.headers).toEqual({ 'Api-Key': 'test-key' })
    expect(request.url).toContain('https://api.neshan.org/v2/static?')
    expect(request.url).toContain('lat=35.689200')
    expect(request.url).toContain('lng=51.389000')
    expect(request.url).toContain('zoom=14')
    expect(request.url).toContain('markers=35.689200%2C51.389000%2C10b981%2CA')
  })

  it('clamps zoom into the supported range', () => {
    const request = adapter.staticMapRequest({ center, zoom: 99, width: 100, height: 100 }, 'k')
    expect(request.url).toContain('zoom=20')
  })

  it('works without markers', () => {
    const request = adapter.staticMapRequest({ center, zoom: 10, width: 100, height: 100 }, 'k')
    expect(request.url).not.toContain('markers=')
  })

  it('declares its provider id', () => {
    expect(adapter.providerId).toBe('neshan')
  })
})
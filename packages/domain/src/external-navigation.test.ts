import { describe, expect, it } from 'vitest'

import {
  buildNavigationLink,
  buildNavigationLinks,
} from './external-navigation'

const target = { latitude: 35.6892, longitude: 51.389, title: 'مطب دکتر رضایی' }

describe('buildNavigationLink', () => {
  it('builds a Neshan link with an encoded title', () => {
    const link = buildNavigationLink('neshan', target)
    expect(link.provider).toBe('neshan')
    expect(link.url).toContain('https://neshan.org/maps/?lat=35.689200&lng=51.389000')
    expect(link.url).toContain('title=')
    expect(link.url).not.toContain('مطب')
  })

  it('builds a Google directions link with a destination param', () => {
    const link = buildNavigationLink('google', target)
    expect(link.url).toContain('https://www.google.com/maps/dir/?api=1&destination=35.689200%2C51.389000')
  })

  it('omits the title param when absent', () => {
    const link = buildNavigationLink('neshan', { latitude: 1, longitude: 2 })
    expect(link.url).not.toContain('title=')
  })

  it('offers both providers for a hand-off menu', () => {
    const links = buildNavigationLinks(target)
    expect(links.map((link) => link.provider)).toEqual(['neshan', 'google'])
  })
})
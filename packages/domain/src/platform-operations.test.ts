import { describe, expect, it } from 'vitest'

import {
  isDataRouteStatus,
  isDataRouteStoreType,
  validateRouteStatusChange,
} from './platform-operations'

describe('validateRouteStatusChange', () => {
  it('allows same-status updates (idempotent)', () => {
    expect(validateRouteStatusChange('active', 'active')).toBe('ok')
    expect(validateRouteStatusChange('maintenance', 'maintenance')).toBe('ok')
    expect(validateRouteStatusChange('disabled', 'disabled')).toBe('ok')
  })

  it('allows active ↔ maintenance and active → disabled', () => {
    expect(validateRouteStatusChange('active', 'maintenance')).toBe('ok')
    expect(validateRouteStatusChange('maintenance', 'active')).toBe('ok')
    expect(validateRouteStatusChange('active', 'disabled')).toBe('ok')
  })

  it('allows maintenance → disabled', () => {
    expect(validateRouteStatusChange('maintenance', 'disabled')).toBe('ok')
  })

  it('allows only re-activation from disabled (fail-closed)', () => {
    expect(validateRouteStatusChange('disabled', 'active')).toBe('ok')
    expect(validateRouteStatusChange('disabled', 'maintenance')).toBe('invalid_transition')
  })
})

describe('route field guards', () => {
  it('accepts only known store types', () => {
    expect(isDataRouteStoreType('d1')).toBe(true)
    expect(isDataRouteStoreType('service')).toBe(true)
    expect(isDataRouteStoreType('sql')).toBe(true)
    expect(isDataRouteStoreType('other')).toBe(true)
    expect(isDataRouteStoreType('memory')).toBe(false)
  })

  it('accepts only known route statuses', () => {
    expect(isDataRouteStatus('active')).toBe(true)
    expect(isDataRouteStatus('maintenance')).toBe(true)
    expect(isDataRouteStatus('disabled')).toBe(true)
    expect(isDataRouteStatus('paused')).toBe(false)
  })
})
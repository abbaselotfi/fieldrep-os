import { describe, expect, it } from 'vitest'

import {
  DEFAULT_PLATFORM_GLOBAL_SETTINGS,
  isEntitlementStatus,
  MAX_SUPPORT_ACCESS_DURATION_MS,
  MIN_SUPPORT_ACCESS_DURATION_MS,
  normalizePlatformGlobalSettings,
  resolveEntitlementState,
  validateEntitlementWindow,
} from './platform-settings'

describe('normalizePlatformGlobalSettings', () => {
  it('returns base values for an empty patch', () => {
    expect(normalizePlatformGlobalSettings(DEFAULT_PLATFORM_GLOBAL_SETTINGS, {})).toEqual(
      DEFAULT_PLATFORM_GLOBAL_SETTINGS,
    )
  })

  it('applies boolean overrides', () => {
    const settings = normalizePlatformGlobalSettings(DEFAULT_PLATFORM_GLOBAL_SETTINGS, {
      allowWorkspaceSelfService: true,
      requireSupportAccessApproval: false,
    })
    expect(settings.allowWorkspaceSelfService).toBe(true)
    expect(settings.requireSupportAccessApproval).toBe(false)
  })

  it('clamps the support-access duration into the allowed range', () => {
    expect(
      normalizePlatformGlobalSettings(DEFAULT_PLATFORM_GLOBAL_SETTINGS, {
        supportAccessDefaultDurationMs: 1,
      }).supportAccessDefaultDurationMs,
    ).toBe(MIN_SUPPORT_ACCESS_DURATION_MS)
    expect(
      normalizePlatformGlobalSettings(DEFAULT_PLATFORM_GLOBAL_SETTINGS, {
        supportAccessDefaultDurationMs: MAX_SUPPORT_ACCESS_DURATION_MS * 10,
      }).supportAccessDefaultDurationMs,
    ).toBe(MAX_SUPPORT_ACCESS_DURATION_MS)
  })

  it('falls back on malformed numbers and clamps schema version', () => {
    expect(
      normalizePlatformGlobalSettings(DEFAULT_PLATFORM_GLOBAL_SETTINGS, {
        supportAccessDefaultDurationMs: 1.5,
      }).supportAccessDefaultDurationMs,
    ).toBe(DEFAULT_PLATFORM_GLOBAL_SETTINGS.supportAccessDefaultDurationMs)
    expect(
      normalizePlatformGlobalSettings(DEFAULT_PLATFORM_GLOBAL_SETTINGS, {
        defaultWorkspaceSchemaVersion: 0,
      }).defaultWorkspaceSchemaVersion,
    ).toBe(1)
  })

  it('ships fail-safe defaults', () => {
    expect(DEFAULT_PLATFORM_GLOBAL_SETTINGS.allowWorkspaceSelfService).toBe(false)
    expect(DEFAULT_PLATFORM_GLOBAL_SETTINGS.requireSupportAccessApproval).toBe(true)
  })
})

describe('validateEntitlementWindow', () => {
  it('allows open and ordered windows', () => {
    expect(validateEntitlementWindow(null, null)).toBe('ok')
    expect(validateEntitlementWindow(1000, null)).toBe('ok')
    expect(validateEntitlementWindow(null, 1000)).toBe('ok')
    expect(validateEntitlementWindow(1000, 1000)).toBe('ok')
  })

  it('rejects inverted windows', () => {
    expect(validateEntitlementWindow(2000, 1000)).toBe('invalid_window')
  })
})

describe('resolveEntitlementState', () => {
  it('fails closed for non-active statuses', () => {
    expect(resolveEntitlementState({ status: 'disabled', startsAt: null, endsAt: null }, 1000)).toBe('disabled')
    expect(resolveEntitlementState({ status: 'expired', startsAt: null, endsAt: null }, 1000)).toBe('disabled')
  })

  it('treats a not-yet-started schedule as disabled', () => {
    expect(resolveEntitlementState({ status: 'scheduled', startsAt: 5000, endsAt: null }, 1000)).toBe('disabled')
    expect(resolveEntitlementState({ status: 'scheduled', startsAt: 500, endsAt: null }, 1000)).toBe('enabled')
  })

  it('treats a past end as disabled (exclusive bound)', () => {
    expect(resolveEntitlementState({ status: 'enabled', startsAt: null, endsAt: 1000 }, 1000)).toBe('disabled')
    expect(resolveEntitlementState({ status: 'enabled', startsAt: null, endsAt: 1001 }, 1000)).toBe('enabled')
  })
})

describe('isEntitlementStatus', () => {
  it('accepts only known statuses', () => {
    expect(isEntitlementStatus('scheduled')).toBe(true)
    expect(isEntitlementStatus('paused')).toBe(false)
  })
})
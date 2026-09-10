import { describe, expect, it } from 'vitest'

import {
  isWorkspaceFeatureEnabled,
  resolveWorkspaceFeatureState,
  WORKSPACE_FEATURE_KEYS,
  type WorkspaceFeatureSetting,
} from './workspace-feature-policy'

const base: readonly WorkspaceFeatureSetting[] = [
  {
    workspaceId: 'ws-1',
    featureKey: 'visit_verification',
    enabled: true,
    updatedAt: 100,
  },
]

describe('resolveWorkspaceFeatureState', () => {
  it('returns every known feature key with fail-closed fallbacks', () => {
    const state = resolveWorkspaceFeatureState('ws-1', base)
    expect(state.map((item) => item.key)).toEqual(WORKSPACE_FEATURE_KEYS)
    const verification = state.find((item) => item.key === 'visit_verification')!
    expect(verification.enabled).toBe(true)
    expect(verification.fallback).toBe(false)
    const offline = state.find((item) => item.key === 'offline_sync')!
    expect(offline.enabled).toBe(false)
    expect(offline.fallback).toBe(true)
  })

  it('ignores settings for other workspaces and unknown keys', () => {
    const state = resolveWorkspaceFeatureState('ws-2', [
      ...base,
      { workspaceId: 'ws-2', featureKey: 'bogus_key', enabled: true, updatedAt: 200 },
    ])
    expect(state.every((item) => item.enabled === false)).toBe(true)
  })

  it('latest updatedAt wins for duplicate keys', () => {
    const state = resolveWorkspaceFeatureState('ws-1', [
      ...base,
      {
        workspaceId: 'ws-1',
        featureKey: 'visit_verification',
        enabled: false,
        updatedAt: 200,
      },
    ])
    expect(state.find((item) => item.key === 'visit_verification')!.enabled).toBe(false)
  })
})

describe('isWorkspaceFeatureEnabled', () => {
  it('honors the configured value', () => {
    expect(isWorkspaceFeatureEnabled('ws-1', 'visit_verification', base)).toBe(true)
  })

  it('defaults to disabled when unconfigured', () => {
    expect(isWorkspaceFeatureEnabled('ws-1', 'ai_planning', base)).toBe(false)
  })
})
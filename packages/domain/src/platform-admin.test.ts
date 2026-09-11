import { describe, expect, it } from 'vitest'

import {
  canAddUser,
  canCreateWorkspace,
  deriveLimitsUsage,
  type PlatformLimits,
} from './platform-admin'

function limits(overrides: Partial<PlatformLimits> = {}): PlatformLimits {
  return {
    companyId: 'company-1',
    maxWorkspaces: 5,
    maxUsersPerWorkspace: 50,
    maxStorageMb: 1000,
    maxImportsPerCycle: 10,
    usedWorkspaces: 0,
    usedUsers: 0,
    ...overrides,
  }
}

describe('platform-admin domain', () => {
  it('deriveLimitsUsage merges usage into limits', () => {
    const base = limits()
    const result = deriveLimitsUsage(base, 3, 25)
    expect(result.usedWorkspaces).toBe(3)
    expect(result.usedUsers).toBe(25)
  })

  it('canCreateWorkspace returns true when under limit', () => {
    expect(canCreateWorkspace(limits({ usedWorkspaces: 4 }))).toBe(true)
  })

  it('canCreateWorkspace returns false when at limit', () => {
    expect(canCreateWorkspace(limits({ usedWorkspaces: 5 }))).toBe(false)
  })

  it('canCreateWorkspace returns false when over limit', () => {
    expect(canCreateWorkspace(limits({ usedWorkspaces: 6 }))).toBe(false)
  })

  it('canAddUser returns true when under limit', () => {
    expect(canAddUser(limits({ usedUsers: 49 }))).toBe(true)
  })

  it('canAddUser returns false when at limit', () => {
    expect(canAddUser(limits({ usedUsers: 50 }))).toBe(false)
  })

  it('canAddUser returns false when over limit', () => {
    expect(canAddUser(limits({ usedUsers: 51 }))).toBe(false)
  })
})

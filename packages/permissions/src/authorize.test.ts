import type { AuthContext } from '@fieldrep/domain'
import { describe, expect, it } from 'vitest'
import { canAccessWorkspace, hasPermission } from './index'

const context: AuthContext = {
  userId: 'user-1',
  membershipId: 'membership-1',
  companyId: 'company-1',
  workspaceId: 'workspace-1',
  permissions: ['plans.read.own'],
  scopes: [{ type: 'self' }],
}

describe('permission foundation', () => {
  it('requires the named permission', () => {
    expect(hasPermission(context, 'plans.read.own')).toBe(true)
    expect(hasPermission(context, 'reports.read.team')).toBe(false)
  })

  it('denies access to a different workspace even when permission exists', () => {
    expect(canAccessWorkspace(context, 'workspace-1', 'plans.read.own')).toBe(true)
    expect(canAccessWorkspace(context, 'workspace-2', 'plans.read.own')).toBe(false)
  })
})

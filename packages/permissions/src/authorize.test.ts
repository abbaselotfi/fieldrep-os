import type { AuthContext } from '@fieldrep/domain'
import { describe, expect, it } from 'vitest'
import {
  authorizeResource,
  canAccessWorkspace,
  hasPermission,
  scopeGrantAllowsResource,
} from './index'

const context: AuthContext = {
  userId: 'user-1',
  membershipId: 'membership-1',
  companyId: 'company-1',
  workspaceId: 'workspace-1',
  roleKeys: ['user'],
  permissions: ['plans.read.own', 'reports.read.team'],
  scopes: [{ type: 'self' }],
}

describe('permission foundation', () => {
  it('requires the named permission', () => {
    expect(hasPermission(context, 'plans.read.own')).toBe(true)
    expect(hasPermission(context, 'platform.datasets.export')).toBe(false)
  })

  it('denies access to a different active workspace even when permission exists', () => {
    expect(canAccessWorkspace(context, 'workspace-1', 'plans.read.own')).toBe(true)
    expect(canAccessWorkspace(context, 'workspace-2', 'plans.read.own')).toBe(false)
  })

  it('allows a self-scoped resource owned by the current user', () => {
    expect(
      authorizeResource(context, 'plans.read.own', {
        companyId: 'company-1',
        workspaceId: 'workspace-1',
        ownerUserId: 'user-1',
      }),
    ).toBe(true)
  })

  it('denies a colleague resource under self scope', () => {
    expect(
      authorizeResource(context, 'plans.read.own', {
        companyId: 'company-1',
        workspaceId: 'workspace-1',
        ownerUserId: 'user-2',
      }),
    ).toBe(false)
  })

  it('does not let a broad scope cross the active workspace boundary', () => {
    const workspaceContext: AuthContext = {
      ...context,
      scopes: [{ type: 'workspace', id: 'workspace-1' }],
    }

    expect(
      authorizeResource(workspaceContext, 'reports.read.team', {
        companyId: 'company-1',
        workspaceId: 'workspace-2',
      }),
    ).toBe(false)
  })

  it('supports explicit organization-unit descendant evaluation', () => {
    const supervisorContext: AuthContext = {
      ...context,
      roleKeys: ['supervisor'],
      scopes: [
        {
          type: 'organization_unit',
          id: 'east-region',
          includeDescendants: true,
        },
      ],
    }

    expect(
      scopeGrantAllowsResource(
        supervisorContext,
        supervisorContext.scopes[0]!,
        {
          companyId: 'company-1',
          workspaceId: 'workspace-1',
          organizationUnitId: 'mashhad-team',
        },
        {
          organizationUnitContains: (parent, child) =>
            parent === 'east-region' && child === 'mashhad-team',
        },
      ),
    ).toBe(true)
  })
})

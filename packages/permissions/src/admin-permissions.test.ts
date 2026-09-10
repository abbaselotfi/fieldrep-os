import type { AuthContext } from '@fieldrep/domain'
import { describe, expect, it } from 'vitest'

import {
  authorizeResource,
  COMPANY_ADMIN_PERMISSIONS,
  WORKSPACE_ADMIN_PERMISSIONS,
} from './index'

function adminContext(
  permissions: readonly string[],
  scopes: AuthContext['scopes'],
): AuthContext {
  return {
    userId: 'admin-1',
    membershipId: 'membership-1',
    companyId: 'company-1',
    workspaceId: 'workspace-a',
    roleKeys: ['workspace_admin'],
    permissions,
    scopes,
  }
}

describe('workspace admin permissions (PERMISSION-MATRIX §8)', () => {
  it('grants org-unit management within the active workspace scope', () => {
    const context = adminContext([WORKSPACE_ADMIN_PERMISSIONS.orgUnitsManageWorkspace], [
      { type: 'workspace', id: 'workspace-a' },
    ])
    expect(
      authorizeResource(context, 'org_units.manage.workspace', {
        companyId: 'company-1',
        workspaceId: 'workspace-a',
      }),
    ).toBe(true)
  })

  it('denies org-unit management in another workspace without a grant', () => {
    const context = adminContext([WORKSPACE_ADMIN_PERMISSIONS.orgUnitsManageWorkspace], [
      { type: 'workspace', id: 'workspace-a' },
    ])
    expect(
      authorizeResource(context, 'org_units.manage.workspace', {
        companyId: 'company-1',
        workspaceId: 'workspace-b',
      }),
    ).toBe(false)
  })

  it('does not hand out audit access implicitly', () => {
    const context = adminContext([WORKSPACE_ADMIN_PERMISSIONS.workspaceRead], [
      { type: 'workspace', id: 'workspace-a' },
    ])
    expect(
      authorizeResource(context, 'audit.read.workspace', {
        companyId: 'company-1',
        workspaceId: 'workspace-a',
      }),
    ).toBe(false)
  })
})

describe('company admin permissions (PERMISSION-MATRIX §9)', () => {
  it('company-scoped permission applies within the company', () => {
    const context = adminContext([COMPANY_ADMIN_PERMISSIONS.companyRead], [
      { type: 'company', id: 'company-1' },
    ])
    expect(authorizeResource(context, 'company.read', {
      companyId: 'company-1',
      workspaceId: 'workspace-a',
    })).toBe(true)
  })

  it('company admin without an explicit workspace grant cannot read workspace reports', () => {
    const context = adminContext(
      [COMPANY_ADMIN_PERMISSIONS.reportsReadCompany, COMPANY_ADMIN_PERMISSIONS.workspacesReadCompany],
      [{ type: 'company', id: 'company-1' }],
    )
    expect(
      authorizeResource(context, 'reports.read.workspace', {
        companyId: 'company-1',
        workspaceId: 'workspace-a',
      }),
    ).toBe(false)
  })
})
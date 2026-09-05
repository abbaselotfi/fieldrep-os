import { describe, expect, it } from 'vitest'
import type { WorkspaceMembershipContext } from './tenancy'
import { resolveWorkspaceSelection } from './tenancy'

const createMembership = (
  workspaceId: string,
  status: WorkspaceMembershipContext['status'] = 'active',
): WorkspaceMembershipContext => ({
  id: `membership-${workspaceId}`,
  userId: 'user-1',
  company: {
    id: 'company-1',
    name: 'Example Pharma',
    slug: 'example-pharma',
  },
  workspace: {
    id: workspaceId,
    companyId: 'company-1',
    name: workspaceId,
    slug: workspaceId,
  },
  status,
  roleKeys: ['user'],
  permissions: ['plans.read.own'],
  scopes: [{ type: 'self' }],
})

describe('resolveWorkspaceSelection', () => {
  it('automatically resolves one active workspace', () => {
    const result = resolveWorkspaceSelection([createMembership('diabetes')])

    expect(result.kind).toBe('resolved')
    if (result.kind === 'resolved') {
      expect(result.membership.workspace.id).toBe('diabetes')
    }
  })

  it('requires selection when multiple active workspaces are authorized', () => {
    const result = resolveWorkspaceSelection([
      createMembership('diabetes'),
      createMembership('cardiology'),
    ])

    expect(result.kind).toBe('selection_required')
  })

  it('rejects a requested workspace that is not actively authorized', () => {
    const result = resolveWorkspaceSelection(
      [createMembership('diabetes'), createMembership('cardiology', 'disabled')],
      'cardiology',
    )

    expect(result).toEqual({
      kind: 'unavailable',
      reason: 'workspace_not_authorized',
    })
  })
})

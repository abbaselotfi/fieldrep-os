import type { AuthContext, SupportAccessGrant } from '@fieldrep/domain'
import { describe, expect, it } from 'vitest'

import {
  createPlatformSupportApi,
  type PlatformSupportDependencies,
  type PlatformSupportGateway,
} from './platform-support-api'

function authContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'platform-admin-1',
    membershipId: 'membership-pa1',
    companyId: 'company-1',
    workspaceId: 'workspace-a',
    roleKeys: ['platform_admin'],
    permissions: ['platform.settings.read', 'security.read', 'support_access.start'],
    scopes: [{ type: 'platform' }],
    ...overrides,
  }
}

const grant: SupportAccessGrant = {
  id: 'g1',
  workspaceId: 'w1',
  requestedByUserId: 'platform-admin-1',
  reason: 'support investigation',
  status: 'requested',
  requestedAt: 1000,
  decidedAt: null,
  decidedByUserId: null,
  expiresAt: null,
  createdAt: 1000,
  updatedAt: 1000,
}

interface AuditRecord {
  id: string
  actionKey: string
  targetId?: string | undefined
  actorUserId?: string | undefined
}

function gateway(
  overrides: Partial<PlatformSupportGateway> = {},
  audits: AuditRecord[] = [],
): PlatformSupportGateway {
  return {
    getUsageOverview: async () => ({
      companies: { total: 2, active: 1, suspended: 1, archived: 0 },
      workspaces: { total: 1, active: 1, suspended: 0, archived: 0 },
      dataRoutes: { total: 1, active: 1, maintenance: 0, disabled: 0 },
    }),
    listSupportAccessGrants: async () => [grant],
    createSupportAccessGrant: async (input) => ({
      ...grant,
      id: input.id,
      workspaceId: input.workspaceId,
      reason: input.reason,
    }),
    decideSupportAccessGrant: async () => ({
      grant: { ...grant, status: 'approved', decidedByUserId: 'platform-admin-1' },
      transition: 'applied',
    }),
    recordAuditEvent: async (input) => {
      audits.push({ id: input.id, actionKey: input.actionKey, targetId: input.targetId, actorUserId: input.actorUserId })
      return true
    },
    ...overrides,
  }
}

function dependencies(
  gw: PlatformSupportGateway,
  context: AuthContext | null = authContext(),
): PlatformSupportDependencies {
  return {
    authContextResolver: { resolve: async () => context },
    platformSupport: () => gw,
  }
}

describe('platform support API — analytics', () => {
  it('requires authentication', async () => {
    const app = createPlatformSupportApi(dependencies(gateway(), null))
    const response = await app.request('/platform/analytics/usage')
    expect(response.status).toBe(401)
  })

  it('requires platform.settings.read', async () => {
    const app = createPlatformSupportApi(
      dependencies(gateway(), authContext({ permissions: ['security.read'] })),
    )
    const response = await app.request('/platform/analytics/usage')
    expect(response.status).toBe(403)
  })

  it('returns the deterministic usage overview', async () => {
    const app = createPlatformSupportApi(dependencies(gateway()))
    const response = await app.request('/platform/analytics/usage')
    expect(response.status).toBe(200)
    const body = (await response.json()) as { overview: { companies: { total: number } } }
    expect(body.overview.companies.total).toBe(2)
  })
})

describe('platform support API — grants', () => {
  it('requires security.read for grant reads', async () => {
    const app = createPlatformSupportApi(
      dependencies(gateway(), authContext({ permissions: ['support_access.start'] })),
    )
    const response = await app.request('/platform/support-access-grants')
    expect(response.status).toBe(403)
  })

  it('lists grants and forwards narrow filters', async () => {
    let received: unknown = null
    const gw = gateway({
      listSupportAccessGrants: async (filters) => {
        received = filters
        return []
      },
    })
    const app = createPlatformSupportApi(dependencies(gw))
    const response = await app.request(
      '/platform/support-access-grants?workspaceId=w1&status=requested&limit=10',
    )
    expect(response.status).toBe(200)
    const filters = received as { workspaceId: string; status: string; limit: number }
    expect(filters.workspaceId).toBe('w1')
    expect(filters.status).toBe('requested')
    expect(filters.limit).toBe(10)
  })

  it('rejects an unknown status filter', async () => {
    const app = createPlatformSupportApi(dependencies(gateway()))
    const response = await app.request('/platform/support-access-grants?status=paused')
    expect(response.status).toBe(400)
  })

  it('requires support_access.start to create a grant', async () => {
    const app = createPlatformSupportApi(
      dependencies(gateway(), authContext({ permissions: ['security.read'] })),
    )
    const response = await app.request('/platform/support-access-grants', {
      method: 'POST',
      body: JSON.stringify({ id: 'g2', workspaceId: 'w1', reason: 'investigation' }),
    })
    expect(response.status).toBe(403)
  })

  it('creates a grant and records the request audit event', async () => {
    const audits: AuditRecord[] = []
    const app = createPlatformSupportApi(dependencies(gateway({}, audits)))
    const response = await app.request('/platform/support-access-grants', {
      method: 'POST',
      body: JSON.stringify({ id: 'g2', workspaceId: 'w2', reason: 'investigation' }),
    })
    expect(response.status).toBe(201)
    expect(audits).toHaveLength(1)
    expect(audits[0]!.actionKey).toBe('support_access.requested')
    expect(audits[0]!.targetId).toBe('w2')
    expect(audits[0]!.actorUserId).toBe('platform-admin-1')
  })

  it('rejects an invalid create payload', async () => {
    const app = createPlatformSupportApi(dependencies(gateway()))
    const response = await app.request('/platform/support-access-grants', {
      method: 'POST',
      body: JSON.stringify({ id: 'g2', reason: '' }),
    })
    expect(response.status).toBe(400)
  })

  it('returns 404 when deciding an unknown grant', async () => {
    const app = createPlatformSupportApi(
      dependencies(gateway({ decideSupportAccessGrant: async () => null })),
    )
    const response = await app.request('/platform/support-access-grants/missing/decision', {
      method: 'POST',
      body: JSON.stringify({ decision: 'approve' }),
    })
    expect(response.status).toBe(404)
  })

  it('returns 409 for an invalid transition and records no audit event', async () => {
    const audits: AuditRecord[] = []
    const app = createPlatformSupportApi(
      dependencies(
        gateway(
          {
            decideSupportAccessGrant: async () => ({
              grant: { ...grant, status: 'revoked' },
              transition: 'rejected',
            }),
          },
          audits,
        ),
      ),
    )
    const response = await app.request('/platform/support-access-grants/g1/decision', {
      method: 'POST',
      body: JSON.stringify({ decision: 'approve' }),
    })
    expect(response.status).toBe(409)
    expect(((await response.json()) as { error: string }).error).toBe(
      'support_access_transition_invalid',
    )
    expect(audits).toHaveLength(0)
  })

  it('applies a decision and records the mapped audit event', async () => {
    const audits: AuditRecord[] = []
    const app = createPlatformSupportApi(dependencies(gateway({}, audits)))
    const response = await app.request('/platform/support-access-grants/g1/decision', {
      method: 'POST',
      body: JSON.stringify({ decision: 'revoke' }),
    })
    expect(response.status).toBe(200)
    expect(audits).toHaveLength(1)
    expect(audits[0]!.actionKey).toBe('support_access.revoked')
  })
})
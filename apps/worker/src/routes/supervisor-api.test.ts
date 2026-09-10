import type { AuthContext } from '@fieldrep/domain'
import { describe, expect, it } from 'vitest'

import {
  createSupervisorApi,
  type SupervisorApiDependencies,
  type SupervisorTeamFacts,
} from './supervisor-api'

function authContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'supervisor-1',
    membershipId: 'membership-s1',
    companyId: 'company-1',
    workspaceId: 'workspace-a',
    roleKeys: ['supervisor'],
    permissions: ['plans.read.team', 'reports.read.team'],
    scopes: [{ type: 'workspace', id: 'workspace-a' }],
    ...overrides,
  }
}

function facts(overrides: Partial<SupervisorTeamFacts> = {}): SupervisorTeamFacts {
  return {
    listTeamFacts: async () => [
      { userId: 'u1', planTotal: 2, planCompleted: 2, visitCompleted: 3, visitCancelled: 0 },
      { userId: 'u2', planTotal: 4, planCompleted: 1, visitCompleted: 1, visitCancelled: 1 },
    ],
    listTeamVerificationFacts: async () => [
      { userId: 'u1', status: 'verified' },
      { userId: 'u2', status: 'outside' },
    ],
    ...overrides,
  }
}

function dependencies(f: SupervisorTeamFacts, context: AuthContext | null = authContext()): SupervisorApiDependencies {
  return {
    authContextResolver: { resolve: async () => context },
    factsForWorkspace: async (workspaceId) => {
      expect(workspaceId).toBe('workspace-a')
      return f
    },
  }
}

describe('supervisor API', () => {
  it('requires supervisor team permission for team-progress', async () => {
    const app = createSupervisorApi(
      dependencies(facts(), authContext({ permissions: ['plans.read.own'] })),
    )
    const response = await app.request(
      '/workspaces/workspace-a/supervisor/team-progress?from=2026-09-01&to=2026-09-30',
    )
    expect(response.status).toBe(403)
  })

  it('rejects cross-workspace supervisor access before facts resolution', async () => {
    let resolved = false
    const app = createSupervisorApi({
      authContextResolver: { resolve: async () => authContext() },
      factsForWorkspace: async () => {
        resolved = true
        return facts()
      },
    })
    const response = await app.request(
      '/workspaces/workspace-b/supervisor/team-progress?from=2026-09-01&to=2026-09-30',
    )
    expect(response.status).toBe(403)
    expect(resolved).toBe(false)
  })

  it('returns the aggregated team-progress summary', async () => {
    const app = createSupervisorApi(dependencies(facts()))
    const response = await app.request(
      '/workspaces/workspace-a/supervisor/team-progress?from=2026-09-01&to=2026-09-30',
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as { summary: { memberCount: number; planTotal: number } }
    expect(body.summary.memberCount).toBe(2)
    expect(body.summary.planTotal).toBe(6)
  })

  it('returns the team verification summary', async () => {
    const app = createSupervisorApi(dependencies(facts()))
    const response = await app.request(
      '/workspaces/workspace-a/supervisor/verification-summary?from=2026-09-01&to=2026-09-30',
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as { summary: { verifiedRatio: number } }
    expect(body.summary.verifiedRatio).toBeCloseTo(1 / 2)
  })

  it('rejects an inverted range', async () => {
    const app = createSupervisorApi(dependencies(facts()))
    const response = await app.request(
      '/workspaces/workspace-a/supervisor/team-progress?from=2026-09-30&to=2026-09-01',
    )
    expect(response.status).toBe(400)
  })
})

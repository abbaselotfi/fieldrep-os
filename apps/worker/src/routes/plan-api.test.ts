import type { AuthContext, PlanEntry } from '@fieldrep/domain'
import { describe, expect, it } from 'vitest'

import {
  createPlanApi,
  type PlanApiDependencies,
  type PlanApiRepository,
} from './plan-api'

function authContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    membershipId: 'membership-1',
    companyId: 'company-1',
    workspaceId: 'workspace-a',
    roleKeys: ['user'],
    permissions: [
      'plans.read.own',
      'plans.create.own',
      'plans.update.own',
      'plans.delete.own',
    ],
    scopes: [{ type: 'self' }],
    ...overrides,
  }
}

const plan: PlanEntry = {
  id: 'plan-1',
  workspaceId: 'workspace-a',
  ownerUserId: 'user-1',
  customerId: 'doctor-1',
  planDate: '2026-09-05',
  routeId: 'route-1',
  status: 'planned',
  source: 'manual',
}

function repository(overrides: Partial<PlanApiRepository> = {}): PlanApiRepository {
  return {
    listEntries: async () => [],
    getEntry: async () => null,
    createEntry: async () => plan,
    updateEntry: async () => plan,
    cancelEntry: async () => true,
    ...overrides,
  }
}

function dependencies(
  repo: PlanApiRepository,
  context: AuthContext | null = authContext(),
): PlanApiDependencies {
  return {
    authContextResolver: { resolve: async () => context },
    repositoryForWorkspace: async (workspaceId) => {
      expect(workspaceId).toBe('workspace-a')
      return repo
    },
  }
}

describe('plan API', () => {
  it('requires authentication before plan access', async () => {
    const app = createPlanApi(dependencies(repository(), null))
    const response = await app.request(
      '/workspaces/workspace-a/plans?from=2026-09-01&to=2026-09-30',
    )

    expect(response.status).toBe(401)
  })

  it('rejects cross-workspace plan access before repository resolution', async () => {
    let repositoryResolved = false
    const app = createPlanApi({
      authContextResolver: { resolve: async () => authContext() },
      repositoryForWorkspace: async () => {
        repositoryResolved = true
        return repository()
      },
    })

    const response = await app.request(
      '/workspaces/workspace-b/plans?from=2026-09-01&to=2026-09-30',
    )

    expect(response.status).toBe(403)
    expect(repositoryResolved).toBe(false)
  })

  it('lists only the authenticated user range', async () => {
    const app = createPlanApi(
      dependencies(
        repository({
          listEntries: async (ownerUserId, fromDate, toDate, cycleId) => {
            expect(ownerUserId).toBe('user-1')
            expect(fromDate).toBe('2026-09-01')
            expect(toDate).toBe('2026-09-30')
            expect(cycleId).toBe('cycle-1')
            return [plan]
          },
        }),
      ),
    )

    const response = await app.request(
      '/workspaces/workspace-a/plans?from=2026-09-01&to=2026-09-30&cycleId=cycle-1',
    )

    expect(response.status).toBe(200)
    const payload = (await response.json()) as { entries: PlanEntry[] }
    expect(payload.entries).toEqual([plan])
  })

  it('injects authenticated ownership when creating a plan', async () => {
    const app = createPlanApi(
      dependencies(
        repository({
          createEntry: async (input) => {
            expect(input.ownerUserId).toBe('user-1')
            expect(input.customerId).toBe('doctor-1')
            return plan
          },
        }),
      ),
    )

    const response = await app.request('/workspaces/workspace-a/plans', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'plan-1',
        ownerUserId: 'attacker-controlled',
        planningCycleId: 'cycle-1',
        customerId: 'doctor-1',
        planDate: '2026-09-05',
        routeId: 'route-1',
      }),
    })

    expect(response.status).toBe(201)
  })

  it('rejects malformed or impossible canonical dates before repository access', async () => {
    let called = false
    const app = createPlanApi(
      dependencies(
        repository({
          createEntry: async () => {
            called = true
            return plan
          },
        }),
      ),
    )

    const response = await app.request('/workspaces/workspace-a/plans', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'plan-1',
        planningCycleId: 'cycle-1',
        customerId: 'doctor-1',
        planDate: '2026-02-31',
      }),
    })

    expect(response.status).toBe(400)
    expect(called).toBe(false)
  })

  it('maps same-day persistence conflicts to a stable 409 response', async () => {
    const app = createPlanApi(
      dependencies(
        repository({
          createEntry: async () => {
            throw new Error(
              'UNIQUE constraint failed: plan_entries.workspace_id, plan_entries.owner_user_id, plan_entries.customer_id, plan_entries.plan_date',
            )
          },
        }),
      ),
    )

    const response = await app.request('/workspaces/workspace-a/plans', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'plan-2',
        planningCycleId: 'cycle-1',
        customerId: 'doctor-1',
        planDate: '2026-09-05',
      }),
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ error: 'duplicate_same_day' })
  })

  it('requires the specific update permission', async () => {
    const app = createPlanApi(
      dependencies(
        repository(),
        authContext({ permissions: ['plans.read.own', 'plans.create.own'] }),
      ),
    )

    const response = await app.request('/workspaces/workspace-a/plans/plan-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ planDate: '2026-09-06' }),
    })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'permission_denied',
      permission: 'plans.update.own',
    })
  })

  it('soft-cancels through the delete route without exposing other owners', async () => {
    const app = createPlanApi(
      dependencies(
        repository({
          cancelEntry: async (ownerUserId, planEntryId) => {
            expect(ownerUserId).toBe('user-1')
            expect(planEntryId).toBe('plan-1')
            return true
          },
        }),
      ),
    )

    const response = await app.request('/workspaces/workspace-a/plans/plan-1', {
      method: 'DELETE',
    })

    expect(response.status).toBe(204)
  })
})

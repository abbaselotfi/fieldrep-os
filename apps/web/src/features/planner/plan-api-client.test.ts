import { describe, expect, it, vi } from 'vitest'

import { OwnPlanHttpClient, PlanApiError } from './plan-api-client'

const entry = {
  id: 'plan-1',
  workspaceId: 'workspace-a',
  ownerUserId: 'user-1',
  customerId: 'doctor-1',
  planDate: '2026-09-06',
  routeId: 'route-1',
  status: 'planned' as const,
  source: 'manual' as const,
}

describe('OwnPlanHttpClient', () => {
  it('lists own plans with cookie credentials and an encoded workspace path', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ entries: [entry] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const client = new OwnPlanHttpClient('workspace a', '/api/v1/', fetchImpl)

    const result = await client.list('2026-09-01', '2026-09-30', 'cycle-1')

    expect(result).toEqual([entry])
    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe(
      '/api/v1/workspaces/workspace%20a/plans?from=2026-09-01&to=2026-09-30&cycleId=cycle-1',
    )
    expect(init).toMatchObject({ credentials: 'include' })
  })

  it('creates plans without accepting an owner id from the client contract', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
      expect(init?.method).toBe('POST')
      expect(JSON.parse(String(init?.body))).toEqual({
        id: 'plan-1',
        planningCycleId: 'cycle-1',
        customerId: 'doctor-1',
        planDate: '2026-09-06',
      })
      return new Response(JSON.stringify({ entry }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    })
    const client = new OwnPlanHttpClient('workspace-a', '/api/v1', fetchImpl)

    await expect(
      client.create({
        id: 'plan-1',
        planningCycleId: 'cycle-1',
        customerId: 'doctor-1',
        planDate: '2026-09-06',
      }),
    ).resolves.toEqual(entry)
  })

  it('maps stable server error codes to PlanApiError', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ error: 'duplicate_same_day' }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const client = new OwnPlanHttpClient('workspace-a', '/api/v1', fetchImpl)

    await expect(
      client.create({
        id: 'plan-2',
        planningCycleId: 'cycle-1',
        customerId: 'doctor-1',
        planDate: '2026-09-06',
      }),
    ).rejects.toMatchObject<PlanApiError>({
      name: 'PlanApiError',
      status: 409,
      code: 'duplicate_same_day',
    })
  })

  it('treats a successful soft cancel as an empty response', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }))
    const client = new OwnPlanHttpClient('workspace-a', '/api/v1', fetchImpl)

    await expect(client.cancel('plan/1')).resolves.toBeUndefined()
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('/api/v1/workspaces/workspace-a/plans/plan%2F1')
  })
})

import { describe, expect, it, vi } from 'vitest'

import { OwnVisitHttpClient } from './visit-api-client'

const product = {
  id: 'product-1',
  workspaceId: 'workspace-a',
  code: 'TJO',
  name: 'Toujeo',
  status: 'active' as const,
  sortOrder: 1,
}

const visit = {
  id: 'visit-1',
  workspaceId: 'workspace-a',
  ownerUserId: 'user-1',
  customerId: 'doctor-1',
  planEntryId: 'plan-1',
  visitDate: '2026-09-06',
  occurredAt: 1_788_680_400_000,
  status: 'completed' as const,
  source: 'planned' as const,
  productCalls: [{ productId: 'product-1', callCount: 1 }],
}

describe('OwnVisitHttpClient', () => {
  it('loads active products with cookie credentials and an encoded workspace path', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ products: [product] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const client = new OwnVisitHttpClient('workspace a', '/api/v1/', fetchImpl)

    await expect(client.products()).resolves.toEqual([product])
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('/api/v1/workspaces/workspace%20a/visit-products')
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ credentials: 'include' })
  })

  it('creates a planned actual without exposing ownerUserId in the request contract', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
      expect(init?.method).toBe('POST')
      expect(JSON.parse(String(init?.body))).toEqual({
        id: 'visit-1',
        customerId: 'doctor-1',
        planEntryId: 'plan-1',
        visitDate: '2026-09-06',
        occurredAt: 1_788_680_400_000,
        productCalls: [{ productId: 'product-1', callCount: 1 }],
      })
      return new Response(JSON.stringify({ visit }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    })
    const client = new OwnVisitHttpClient('workspace-a', '/api/v1', fetchImpl)

    await expect(
      client.create({
        id: 'visit-1',
        customerId: 'doctor-1',
        planEntryId: 'plan-1',
        visitDate: '2026-09-06',
        occurredAt: 1_788_680_400_000,
        productCalls: [{ productId: 'product-1', callCount: 1 }],
      }),
    ).resolves.toEqual(visit)
  })

  it('lists visits in a canonical date range', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ visits: [visit] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const client = new OwnVisitHttpClient('workspace-a', '/api/v1', fetchImpl)

    await expect(client.list('2026-09-01', '2026-09-30')).resolves.toEqual([visit])
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      '/api/v1/workspaces/workspace-a/visits?from=2026-09-01&to=2026-09-30',
    )
  })

  it('maps stable API failures to VisitApiError', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ error: 'plan_already_completed' }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const client = new OwnVisitHttpClient('workspace-a', '/api/v1', fetchImpl)

    await expect(
      client.create({
        id: 'visit-2',
        customerId: 'doctor-1',
        planEntryId: 'plan-1',
        visitDate: '2026-09-06',
        occurredAt: 1,
        productCalls: [],
      }),
    ).rejects.toMatchObject({
      name: 'VisitApiError',
      status: 409,
      code: 'plan_already_completed',
    })
  })

  it('cancels a visit through the explicit cancel endpoint', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }))
    const client = new OwnVisitHttpClient('workspace-a', '/api/v1', fetchImpl)

    await expect(client.cancel('visit/1')).resolves.toBeUndefined()
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      '/api/v1/workspaces/workspace-a/visits/visit%2F1/cancel',
    )
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' })
  })
})

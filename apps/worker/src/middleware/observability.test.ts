import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'

import {
  InMemoryObservabilitySink,
  emitEvent,
  requestObservability,
  type ObservabilityEnv,
} from './observability'
import { attachAuthContext } from './authorization'
import type { AuthContext } from '@fieldrep/domain'

function authContext(): AuthContext {
  return {
    userId: 'user-1',
    membershipId: 'membership-1',
    companyId: 'company-1',
    workspaceId: 'workspace-1',
    roleKeys: ['user'],
    permissions: ['plans.read.own'],
    scopes: [{ type: 'self' }],
  }
}

function buildApp(sink: InMemoryObservabilitySink, options?: { now?: () => number }) {
  const app = new Hono<ObservabilityEnv>()
  app.use(
    requestObservability({
      sink,
      now: options?.now ?? (() => 2_000),
      random: () => 0,
      component: 'test-worker',
    }),
  )
  app.use('/protected/*', attachAuthContext({ resolve: async () => authContext() }))
  app.get('/protected/ping', (c) => c.json({ ok: true, requestId: c.get('requestId') }))
  app.get('/broken', () => {
    throw new Error('boom')
  })
  return app
}

describe('requestObservability middleware', () => {
  it('correlates a successful request with one structured event', async () => {
    const sink = new InMemoryObservabilitySink()
    const response = await buildApp(sink).request('/protected/ping')
    expect(response.status).toBe(200)

    const requestId = response.headers.get('x-request-id')!
    expect(requestId).toMatch(/^req-[a-z0-9]{12}$/u)

    expect(sink.events).toHaveLength(1)
    const event = sink.events[0]!
    expect(event.kind).toBe('http.request.completed')
    expect(event.level).toBe('info')
    expect(event.component).toBe('test-worker')
    expect(event.requestId).toBe(requestId)
    expect(event.userId).toBe('user-1')
    expect(event.latencyMs).toBe(0)
    expect(event.outcome).toBe('200')
    expect(event.metadata).toEqual({
      method: 'GET',
      path: '/protected/ping',
      requestIdForwarded: false,
    })
    const body = (await response.json()) as { requestId: string }
    expect(body.requestId).toBe(requestId)
  })

  it('forwards a usable caller-supplied request id', async () => {
    const sink = new InMemoryObservabilitySink()
    const response = await buildApp(sink).request('/protected/ping', {
      headers: { 'x-request-id': 'gw-trace-1234' },
    })
    expect(response.headers.get('x-request-id')).toBe('gw-trace-1234')
    expect(sink.events[0]!.requestId).toBe('gw-trace-1234')
    expect(sink.events[0]!.metadata).toMatchObject({ requestIdForwarded: true })
  })

  it('records handler errors as error events; Hono answers a bare 500', async () => {
    const sink = new InMemoryObservabilitySink()
    const app = buildApp(sink, { now: () => 2_500 })
    const response = await app.request('/broken')
    expect(response.status).toBe(500)
    expect(response.headers.get('x-request-id')).toMatch(/^req-[a-z0-9]{12}$/u)

    expect(sink.events).toHaveLength(1)
    const event = sink.events[0]!
    expect(event.level).toBe('error')
    expect(event.outcome).toBe('uncaught_error')
    expect(event.metadata).toMatchObject({ path: '/broken', errorName: 'Error' })
  })

  it('emits standalone events through the shared sink', () => {
    const sink = new InMemoryObservabilitySink()
    emitEvent(sink, {
      kind: 'rate.limited',
      level: 'warn',
      component: 'test-worker',
      message: 'auth surface limited',
      atMs: 3_000,
      outcome: 'rate_limited',
      metadata: { token: 'secret-value', surface: 'auth' },
    })
    expect(sink.events[0]!.kind).toBe('rate.limited')
    expect(sink.events[0]!.metadata).toMatchObject({
      token: '[redacted]',
      surface: 'auth',
    })
  })
})
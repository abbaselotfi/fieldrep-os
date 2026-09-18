import {
  buildLogEvent,
  resolveRequestId,
  type LogEvent,
  type LogEventInput,
  type ObservabilityEventKind,
} from '@fieldrep/domain'
import { createMiddleware } from 'hono/factory'

import type { AuthorizationEnv } from './authorization'

/**
 * Observability middleware (P12-A2, REQUIREMENTS NFR-005): every request gets
 * a correlation id (forwarded when the caller supplied a usable one), and a
 * structured `http.request.completed` event is emitted on every outcome —
 * success, handled error and uncaught failure — through a pluggable sink.
 */

export interface ObservabilityEnv extends AuthorizationEnv {
  Variables: AuthorizationEnv['Variables'] & {
    requestId: string
    requestStartedAtMs: number
  }
}

export interface ObservabilitySink {
  write(event: LogEvent): void
}

/** Collects events in memory — used by tests and local development. */
export class InMemoryObservabilitySink implements ObservabilitySink {
  public readonly events: LogEvent[] = []

  write(event: LogEvent): void {
    this.events.push(event)
  }
}

/** Console-backed sink: the default for the deployed worker. */
export class ConsoleObservabilitySink implements ObservabilitySink {
  write(event: LogEvent): void {
    const payload = JSON.stringify(event)
    if (event.level === 'error' || event.level === 'critical') {
      console.error(payload)
    } else if (event.level === 'warn') {
      console.warn(payload)
    } else {
      console.log(payload)
    }
  }
}

export interface ObservabilityDependencies {
  sink: ObservabilitySink
  now?: (() => number) | undefined
  random?: (() => number) | undefined
  requestIdHeader?: string | undefined
  component?: string | undefined
}

export function requestObservability(dependencies: ObservabilityDependencies) {
  const now = dependencies.now ?? Date.now
  const random = dependencies.random ?? Math.random
  const requestIdHeader = dependencies.requestIdHeader ?? 'x-request-id'
  const component = dependencies.component ?? 'worker'

  return createMiddleware<ObservabilityEnv>(async (c, next) => {
    const startedAtMs = now()
    const correlation = resolveRequestId(c.req.raw.headers.get(requestIdHeader), random)
    const requestId = correlation.requestId

    c.set('requestId', requestId)
    c.set('requestStartedAtMs', startedAtMs)
    c.header('x-request-id', requestId)

    let context: {
      userId?: string | undefined
      companyId?: string | undefined
      workspaceId?: string | undefined
    } = {}
    try {
      await next()
      context =
        (c.get('authContext') as
          | { userId?: string; companyId?: string; workspaceId?: string }
          | undefined) ?? context
    } catch (error) {
      // Some runtimes propagate the throw; Hono surfaces it on `c.error`.
      context = (c.get('authContext') as typeof context | undefined) ?? context
      dependencies.sink.write(uncaughtEvent(error))
      throw error
    }

    const latencyMs = Math.max(now() - startedAtMs, 0)
    const uncaught = (c as unknown as { error?: unknown }).error
    if (uncaught !== undefined) {
      dependencies.sink.write(uncaughtEvent(uncaught))
      return
    }

    const status = c.res.status
    const errored = status >= 500
    const event: LogEventInput = {
      kind: 'http.request.completed',
      level: errored ? 'error' : status >= 400 ? 'warn' : 'info',
      component,
      message: `${c.req.method} ${c.req.path} -> ${status}`,
      atMs: now(),
      requestId,
      ...context,
      latencyMs,
      outcome: String(status),
      metadata: {
        method: c.req.method,
        path: c.req.path,
        requestIdForwarded: correlation.forwardedFromHeader,
      },
    }
    dependencies.sink.write(buildLogEvent(event))

    function uncaughtEvent(error: unknown): LogEvent {
      const authContext = c.get('authContext') as typeof context | undefined
      const scope = authContext ?? context
      return buildLogEvent({
        kind: 'http.request.completed',
        level: 'error',
        component,
        message: 'request failed with an uncaught error',
        atMs: now(),
        requestId,
        ...scope,
        latencyMs: Math.max(now() - startedAtMs, 0),
        outcome: 'uncaught_error',
        metadata: { method: c.req.method, path: c.req.path, errorName: errorNameOf(error) },
      })
    }
  })
}

function errorNameOf(error: unknown): string {
  if (error instanceof Error) return error.name
  return 'UnknownError'
}

/** Emits one structured event through the sink (metrics counters, audits…). */
export function emitEvent(
  sink: ObservabilitySink,
  input: LogEventInput & { kind: ObservabilityEventKind },
): void {
  sink.write(buildLogEvent(input))
}
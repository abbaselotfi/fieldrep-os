import { buildSecurityHeaders } from '@fieldrep/domain'
import { createMiddleware } from 'hono/factory'

/**
 * Hardened response headers (P12-A1). Applied after the handler runs so every
 * response — including 4xx denials — carries the policy.
 */
export function securityHeaders(
  options: {
    contentSecurityPolicy?: string | null | undefined
    frameAncestors?: readonly string[] | undefined
  } = {},
) {
  const headers = buildSecurityHeaders(options)
  return createMiddleware(async (c, next) => {
    await next()
    for (const [name, value] of Object.entries(headers)) {
      c.res.headers.set(name, value)
    }
  })
}
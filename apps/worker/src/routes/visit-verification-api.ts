import type {
  VisitId,
  VisitVerificationResult,
  WorkspaceId,
} from '@fieldrep/domain'
import { evaluateVisitVerification } from '@fieldrep/domain'
import { Hono } from 'hono'
import { z } from 'zod'

import {
  attachAuthContext,
  requireWorkspacePermission,
  type AuthContextResolver,
  type AuthorizationEnv,
} from '../middleware/authorization'

const evaluateSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracyMeters: z.number().finite().min(0).nullable(),
  captureMode: z.enum(['gps', 'network', 'manual', 'offline']),
})

/**
 * Port the route needs from persistence — kept narrow so the worker wiring
 * can compose evidence + location + verification repositories freely.
 */
export interface VisitVerificationPort {
  /** Target customer-location point for the visit; null when untagged. */
  resolveTargetPoint(
    ownerUserId: string,
    visitId: VisitId,
  ): Promise<{ latitude: number; longitude: number } | null>
  /** Persist (or replace) the evaluation outcome. */
  persistResult(input: {
    visitId: VisitId
    ownerUserId: string
    result: VisitVerificationResult
  }): Promise<VisitVerificationResult>
  getResultForVisit(ownerUserId: string, visitId: VisitId): Promise<VisitVerificationResult | null>
}

export interface VisitVerificationApiDependencies {
  authContextResolver: AuthContextResolver
  /** Company/workspace feature toggle (MAPS-LOCATION-SPEC: verification is opt-in). */
  isVerificationEnabled(workspaceId: WorkspaceId): Promise<boolean>
  portForWorkspace(workspaceId: WorkspaceId): Promise<VisitVerificationPort>
}

export function createVisitVerificationApi(dependencies: VisitVerificationApiDependencies) {
  const app = new Hono<AuthorizationEnv>()

  app.use('/workspaces/*', attachAuthContext(dependencies.authContextResolver))

  app.post(
    '/workspaces/:workspaceId/visits/:visitId/verification',
    requireWorkspacePermission('visits.create.own'),
    async (c) => {
      if (!(await dependencies.isVerificationEnabled(c.req.param('workspaceId')))) {
        return c.json({ error: 'verification_disabled' }, 403)
      }

      const parsed = evaluateSchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) return c.json({ error: 'invalid_verification_input' }, 400)

      const authContext = c.get('authContext')
      const port = await dependencies.portForWorkspace(c.req.param('workspaceId'))
      const targetPoint = await port.resolveTargetPoint(authContext.userId, c.req.param('visitId'))

      const result = evaluateVisitVerification({
        targetPoint,
        capturedPoint: { latitude: parsed.data.latitude, longitude: parsed.data.longitude },
        accuracyMeters: parsed.data.accuracyMeters,
        captureMode: parsed.data.captureMode,
      })

      const saved = await port.persistResult({
        visitId: c.req.param('visitId'),
        ownerUserId: authContext.userId,
        result,
      })
      return c.json({ verification: saved }, 201)
    },
  )

  app.get(
    '/workspaces/:workspaceId/visits/:visitId/verification',
    requireWorkspacePermission('visits.read.own'),
    async (c) => {
      if (!(await dependencies.isVerificationEnabled(c.req.param('workspaceId')))) {
        return c.json({ error: 'verification_disabled' }, 403)
      }

      const authContext = c.get('authContext')
      const port = await dependencies.portForWorkspace(c.req.param('workspaceId'))
      const verification = await port.getResultForVisit(
        authContext.userId,
        c.req.param('visitId'),
      )
      if (verification === null) return c.json({ error: 'verification_not_found' }, 404)
      return c.json({ verification })
    },
  )

  return app
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}
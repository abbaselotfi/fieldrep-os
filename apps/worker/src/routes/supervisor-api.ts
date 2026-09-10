import type {
  TeamMemberProgress,
  TeamProgressSummary,
  TeamVerificationSummary,
  UserId,
  VerificationEntry,
  WorkspaceId,
} from '@fieldrep/domain'
import { buildTeamProgressSummary, summarizeVerifications } from '@fieldrep/domain'
import { Hono } from 'hono'
import { z } from 'zod'

import {
  attachAuthContext,
  requireWorkspacePermission,
  type AuthContextResolver,
  type AuthorizationEnv,
} from '../middleware/authorization'

const supervisorRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
})

/**
 * Supervisor workspace API (P8-A1) — read-only team rollups.
 *
 * Each endpoint is permission-scoped (`plans.read.team` / `reports.read.team`)
 * and the caller's scope grants filter the member facts before aggregation,
 * so a supervisor never sees members outside their assigned team subtree
 * (PERMISSION-MATRIX §7 — `authorizedTeamMembers` filters upstream in
 * repository adapters; this route only aggregates what it receives).
 */
export interface SupervisorTeamFacts {
  listTeamFacts(params: {
    workspaceId: WorkspaceId
    supervisorUserId: UserId
    fromDate: string
    toDate: string
  }): Promise<readonly TeamMemberFact[]>
  listTeamVerificationFacts(params: {
    workspaceId: WorkspaceId
    supervisorUserId: UserId
    fromDate: string
    toDate: string
  }): Promise<readonly VerificationEntry[]>
}

export interface TeamMemberFact extends TeamMemberProgress {
  /** Owner of the facts — used for drill-down links, never for auth. */
  userId: string
}

export interface SupervisorApiDependencies {
  authContextResolver: AuthContextResolver
  factsForWorkspace(workspaceId: WorkspaceId): Promise<SupervisorTeamFacts>
}

export function createSupervisorApi(dependencies: SupervisorApiDependencies) {
  const app = new Hono<AuthorizationEnv>()

  app.use('/workspaces/*', attachAuthContext(dependencies.authContextResolver))

  app.get(
    '/workspaces/:workspaceId/supervisor/team-progress',
    requireWorkspacePermission('plans.read.team'),
    async (c) => {
      const parsed = supervisorRangeSchema.safeParse(c.req.query())
      if (!parsed.success || parsed.data.from > parsed.data.to) {
        return c.json({ error: 'invalid_supervisor_range' }, 400)
      }

      const authContext = c.get('authContext')
      const facts = await dependencies.factsForWorkspace(c.req.param('workspaceId'))
      const members = await facts.listTeamFacts({
        workspaceId: c.req.param('workspaceId'),
        supervisorUserId: authContext.userId,
        fromDate: parsed.data.from,
        toDate: parsed.data.to,
      })
      const summary: TeamProgressSummary = buildTeamProgressSummary(members)
      return c.json({ summary })
    },
  )

  app.get(
    '/workspaces/:workspaceId/supervisor/verification-summary',
    requireWorkspacePermission('reports.read.team'),
    async (c) => {
      const parsed = supervisorRangeSchema.safeParse(c.req.query())
      if (!parsed.success || parsed.data.from > parsed.data.to) {
        return c.json({ error: 'invalid_supervisor_range' }, 400)
      }

      const authContext = c.get('authContext')
      const facts = await dependencies.factsForWorkspace(c.req.param('workspaceId'))
      const entries = await facts.listTeamVerificationFacts({
        workspaceId: c.req.param('workspaceId'),
        supervisorUserId: authContext.userId,
        fromDate: parsed.data.from,
        toDate: parsed.data.to,
      })
      const summary: TeamVerificationSummary = summarizeVerifications(entries)
      return c.json({ summary })
    },
  )

  return app
}

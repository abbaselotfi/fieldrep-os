import type {
  OrgUnitParentChangeError,
  OrganizationUnitId,
  WorkspaceId,
  WorkspaceFeatureKey,
  WorkspaceFeatureSetting,
} from '@fieldrep/domain'
import {
  WORKSPACE_FEATURE_KEYS,
  buildOrgUnitTree,
  isWorkspaceFeatureEnabled,
  resolveWorkspaceFeatureState,
} from '@fieldrep/domain'
import { Hono } from 'hono'
import { z } from 'zod'

import {
  attachAuthContext,
  requireWorkspacePermission,
  type AuthContextResolver,
  type AuthorizationEnv,
} from '../middleware/authorization'

/**
 * Company/workspace administration API (P9-A2).
 *
 * Permission-scoped per PERMISSION-MATRIX §8:
 *  - org-unit reads/moves require `org_units.manage.workspace`;
 *  - membership assignment requires `memberships.manage.workspace`;
 *  - feature toggles require `workspace.settings.manage`.
 * Every mutating path re-validates against the domain guards (cycle/
 * cross-workspace rejection, fail-closed feature keys) before writing.
 */

const orgUnitCreateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  unitType: z.enum(['region', 'area', 'district', 'team', 'custom']),
  parentId: z.string().nullable().optional(),
})

const orgUnitMoveSchema = z.object({
  newParentId: z.string().nullable(),
})

const membershipAssignSchema = z.object({
  membershipId: z.string().min(1),
  relationshipType: z.enum(['member', 'supervisor', 'manager', 'owner']).optional(),
})

const featurePatchSchema = z.object({
  patches: z
    .array(
      z.object({
        key: z.enum(WORKSPACE_FEATURE_KEYS),
        enabled: z.boolean(),
      }),
    )
    .min(1),
})

export interface OrgAdminDependencies {
  authContextResolver: AuthContextResolver
  adminForWorkspace(workspaceId: WorkspaceId): Promise<OrgAdminGateway>
}

/**
 * Narrow gateway used by the route (test-friendly, small surface).
 */
export interface OrgAdminGateway {
  listOrgUnits(): Promise<readonly { id: string; parentId: string | null; name: string; unitType: string }[]>
  moveOrgUnit(input: {
    unitId: OrganizationUnitId
    newParentId: OrganizationUnitId | null
  }): Promise<OrgUnitParentChangeError | null>
  assignMembership(input: {
    unitId: OrganizationUnitId
    membershipId: string
    relationshipType?: string
  }): Promise<boolean>
  readFeatureSettings(): Promise<readonly WorkspaceFeatureSetting[]>
  setFeatureSettings(patches: readonly { key: string; enabled: boolean }[], updatedByUserId: string): Promise<void>
}
export function createOrgAdminApi(dependencies: OrgAdminDependencies) {
  const app = new Hono<AuthorizationEnv>()

  app.use('/workspaces/*', attachAuthContext(dependencies.authContextResolver))

  const adminFor = (c: { req: { param: (name: string) => string | undefined } }) => {
    const workspaceId = c.req.param('workspaceId') ?? ''
    return dependencies.adminForWorkspace(workspaceId)
  }

  // Org-unit tree (read) — org_units.manage.workspace
  app.get(
    '/workspaces/:workspaceId/org-units',
    requireWorkspacePermission('org_units.manage.workspace'),
    async (c) => {
      const admin = await adminFor(c)
      const units = await admin.listOrgUnits()
      const tree = buildOrgUnitTree(units.map((unit) => ({
        id: unit.id,
        workspaceId: c.req.param('workspaceId') ?? '',
        parentId: unit.parentId,
        name: unit.name,
        unitType: unit.unitType,
      })))
      return c.json({ tree })
    },
  )

  // Org-unit parent move — org_units.manage.workspace
  app.patch(
    '/workspaces/:workspaceId/org-units/:unitId/parent',
    requireWorkspacePermission('org_units.manage.workspace'),
    async (c) => {
      const parsed = orgUnitMoveSchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) return c.json({ error: 'invalid_org_unit_move' }, 400)

      const admin = await adminFor(c)
      const error = await admin.moveOrgUnit({
        unitId: c.req.param('unitId') ?? '',
        newParentId: parsed.data.newParentId,
      })
      if (error !== null) return c.json({ error: `org_unit_move_${error}` }, 409)
      return c.body(null, 204)
    },
  )

  // Membership assignment — memberships.manage.workspace
  app.post(
    '/workspaces/:workspaceId/org-units/:unitId/members',
    requireWorkspacePermission('memberships.manage.workspace'),
    async (c) => {
      const parsed = membershipAssignSchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) return c.json({ error: 'invalid_membership_assign' }, 400)

      const admin = await adminFor(c)
      const assignInput: {
        unitId: string
        membershipId: string
        relationshipType?: string
      } = {
        unitId: c.req.param('unitId') ?? '',
        membershipId: parsed.data.membershipId,
      }
      if (parsed.data.relationshipType !== undefined) {
        assignInput.relationshipType = parsed.data.relationshipType
      }
      const assigned = await admin.assignMembership(assignInput)
      if (!assigned) return c.json({ error: 'membership_or_unit_not_found' }, 404)
      return c.body(null, 204)
    },
  )

  // Feature states (read) — workspace.settings.manage
  app.get(
    '/workspaces/:workspaceId/features',
    requireWorkspacePermission('workspace.settings.manage'),
    async (c) => {
      const admin = await adminFor(c)
      const settings = await admin.readFeatureSettings()
      const workspaceId = c.req.param('workspaceId') ?? ''
      const states = resolveWorkspaceFeatureState(workspaceId, settings)
      return c.json({ states })
    },
  )

  // Feature toggles (write) — workspace.settings.manage
  app.put(
    '/workspaces/:workspaceId/features',
    requireWorkspacePermission('workspace.settings.manage'),
    async (c) => {
      const parsed = featurePatchSchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) return c.json({ error: 'invalid_feature_patch' }, 400)
      const authContext = c.get('authContext')

      const admin = await adminFor(c)
      await admin.setFeatureSettings(parsed.data.patches, authContext.userId)
      const settings = await admin.readFeatureSettings()
      const workspaceId = c.req.param('workspaceId') ?? ''
      const states = resolveWorkspaceFeatureState(workspaceId, settings)
      return c.json({ states })
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
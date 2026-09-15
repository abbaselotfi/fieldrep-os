import type {
  CompanyId,
  EntitlementStatus,
  FeatureEntitlement,
  PlatformGlobalSettings,
  PlatformGlobalSettingsPatch,
  ResolvedEntitlementState,
} from '@fieldrep/domain'
import { resolveEntitlementState, validateEntitlementWindow } from '@fieldrep/domain'
import { Hono } from 'hono'
import { z } from 'zod'

import {
  attachAuthContext,
  requirePermission,
  type AuthContextResolver,
  type AuthorizationEnv,
} from '../middleware/authorization'

/**
 * Platform global settings & entitlements API (P10-A4).
 *
 * Permission-scoped per PERMISSION-MATRIX §10:
 *  - global settings read/write → `platform.settings.read` / `platform.settings.manage`
 *  - feature entitlements       → `features.manage`
 * Entitlement reads always return the fail-closed *effective* state alongside
 * the stored window.
 */

const settingsPatchSchema = z
  .object({
    allowWorkspaceSelfService: z.boolean().optional(),
    requireSupportAccessApproval: z.boolean().optional(),
    supportAccessDefaultDurationMs: z.number().int().min(1).optional(),
    defaultWorkspaceSchemaVersion: z.number().int().min(1).optional(),
  })
  .refine((value) => Object.keys(value).length > 0)

const entitlementQuerySchema = z.object({
  workspaceId: z.string().min(1).optional(),
})

const entitlementPatchSchema = z
  .object({
    status: z.enum(['enabled', 'disabled', 'scheduled', 'expired']),
    startsAt: z.number().int().min(0).nullable().optional(),
    endsAt: z.number().int().min(0).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0)

export interface PlatformSettingsDependencies {
  authContextResolver: AuthContextResolver
  platformSettings(): PlatformSettingsGateway
  now(): number
}

export interface PlatformSettingsGateway {
  getGlobalSettings(): Promise<PlatformGlobalSettings>
  updateGlobalSettings(patch: PlatformGlobalSettingsPatch): Promise<PlatformGlobalSettings>
  listEntitlements(companyId: CompanyId): Promise<readonly FeatureEntitlement[]>
  getEntitlement(
    companyId: CompanyId,
    featureKey: string,
    workspaceId?: string | undefined,
  ): Promise<FeatureEntitlement | null>
  upsertEntitlement(input: {
    id: string
    companyId: CompanyId
    workspaceId?: string | undefined
    featureKey: string
    status: EntitlementStatus
    startsAt?: number | null | undefined
    endsAt?: number | null | undefined
  }): Promise<FeatureEntitlement>
}

interface EntitlementView extends FeatureEntitlement {
  effectiveState: ResolvedEntitlementState
}

export function createPlatformSettingsApi(dependencies: PlatformSettingsDependencies) {
  const app = new Hono<AuthorizationEnv>()

  app.use('*', attachAuthContext(dependencies.authContextResolver))

  const view = (entitlement: FeatureEntitlement): EntitlementView => ({
    ...entitlement,
    effectiveState: resolveEntitlementState(entitlement, dependencies.now()),
  })

  app.get('/platform/settings', requirePermission('platform.settings.read'), async (c) => {
    const settings = await dependencies.platformSettings().getGlobalSettings()
    return c.json({ settings })
  })

  app.put('/platform/settings', requirePermission('platform.settings.manage'), async (c) => {
    const parsed = settingsPatchSchema.safeParse(await readJson(c.req.raw))
    if (!parsed.success) return c.json({ error: 'invalid_platform_settings' }, 400)
    const settings = await dependencies.platformSettings().updateGlobalSettings(parsed.data)
    return c.json({ settings })
  })

  app.get(
    '/platform/companies/:companyId/entitlements',
    requirePermission('features.manage'),
    async (c) => {
      const entitlements = await dependencies
        .platformSettings()
        .listEntitlements(c.req.param('companyId'))
      return c.json({ entitlements: entitlements.map(view) })
    },
  )

  app.get(
    '/platform/companies/:companyId/entitlements/:featureKey',
    requirePermission('features.manage'),
    async (c) => {
      const parsed = entitlementQuerySchema.safeParse(c.req.query())
      if (!parsed.success) return c.json({ error: 'invalid_entitlement_filter' }, 400)
      const entitlement = await dependencies
        .platformSettings()
        .getEntitlement(c.req.param('companyId'), c.req.param('featureKey'), parsed.data.workspaceId)
      if (entitlement === null) return c.json({ error: 'entitlement_not_found' }, 404)
      return c.json({ entitlement: view(entitlement) })
    },
  )

  app.put(
    '/platform/companies/:companyId/entitlements/:featureKey',
    requirePermission('features.manage'),
    async (c) => {
      const parsed = entitlementPatchSchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) return c.json({ error: 'invalid_entitlement' }, 400)

      const query = entitlementQuerySchema.safeParse(c.req.query())
      if (!query.success) return c.json({ error: 'invalid_entitlement_filter' }, 400)

      const gateway = dependencies.platformSettings()
      const companyId = c.req.param('companyId')
      const featureKey = c.req.param('featureKey')
      const workspaceId = query.data.workspaceId

      const existing = await gateway.getEntitlement(companyId, featureKey, workspaceId)
      const startsAt =
        parsed.data.startsAt === undefined ? (existing?.startsAt ?? null) : parsed.data.startsAt
      const endsAt =
        parsed.data.endsAt === undefined ? (existing?.endsAt ?? null) : parsed.data.endsAt
      if (validateEntitlementWindow(startsAt, endsAt) === 'invalid_window') {
        return c.json({ error: 'entitlement_window_invalid' }, 409)
      }

      const input: Parameters<PlatformSettingsGateway['upsertEntitlement']>[0] = {
        id: existing?.id ?? `entitlement-${companyId}-${featureKey}-${workspaceId ?? 'company'}`,
        companyId,
        featureKey,
        status: parsed.data.status,
        startsAt,
        endsAt,
      }
      if (workspaceId !== undefined) input.workspaceId = workspaceId

      const entitlement = await gateway.upsertEntitlement(input)
      return c.json({ entitlement: view(entitlement) }, existing === null ? 201 : 200)
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
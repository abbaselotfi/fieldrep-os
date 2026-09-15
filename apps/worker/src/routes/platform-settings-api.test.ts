import type {
  AuthContext,
  FeatureEntitlement,
  PlatformGlobalSettings,
  PlatformGlobalSettingsPatch,
} from '@fieldrep/domain'
import { describe, expect, it } from 'vitest'

import {
  createPlatformSettingsApi,
  type PlatformSettingsDependencies,
  type PlatformSettingsGateway,
} from './platform-settings-api'

function authContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'platform-admin-1',
    membershipId: 'membership-pa1',
    companyId: 'company-1',
    workspaceId: 'workspace-a',
    roleKeys: ['platform_admin'],
    permissions: ['platform.settings.read', 'platform.settings.manage', 'features.manage'],
    scopes: [{ type: 'platform' }],
    ...overrides,
  }
}

const settings: PlatformGlobalSettings = {
  allowWorkspaceSelfService: false,
  requireSupportAccessApproval: true,
  supportAccessDefaultDurationMs: 4 * 60 * 60 * 1000,
  defaultWorkspaceSchemaVersion: 1,
}

const entitlement: FeatureEntitlement = {
  id: 'e1',
  companyId: 'company-1',
  workspaceId: null,
  featureKey: 'ai_planning',
  status: 'scheduled',
  startsAt: 9000,
  endsAt: null,
  config: null,
  createdAt: 1000,
  updatedAt: 1000,
}

function mergeSettings(patch: PlatformGlobalSettingsPatch): PlatformGlobalSettings {
  return {
    allowWorkspaceSelfService:
      patch.allowWorkspaceSelfService ?? settings.allowWorkspaceSelfService,
    requireSupportAccessApproval:
      patch.requireSupportAccessApproval ?? settings.requireSupportAccessApproval,
    supportAccessDefaultDurationMs:
      patch.supportAccessDefaultDurationMs ?? settings.supportAccessDefaultDurationMs,
    defaultWorkspaceSchemaVersion:
      patch.defaultWorkspaceSchemaVersion ?? settings.defaultWorkspaceSchemaVersion,
  }
}

function gateway(overrides: Partial<PlatformSettingsGateway> = {}): PlatformSettingsGateway {
  return {
    getGlobalSettings: async () => settings,
    updateGlobalSettings: async (patch) => mergeSettings(patch),
    listEntitlements: async () => [entitlement],
    getEntitlement: async () => entitlement,
    upsertEntitlement: async (input) => ({
      ...entitlement,
      id: input.id,
      featureKey: input.featureKey,
      status: input.status,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
    }),
    ...overrides,
  }
}

function dependencies(
  gw: PlatformSettingsGateway,
  context: AuthContext | null = authContext(),
  now = 1000,
): PlatformSettingsDependencies {
  return {
    authContextResolver: { resolve: async () => context },
    platformSettings: () => gw,
    now: () => now,
  }
}

describe('platform settings API — global settings', () => {
  it('requires authentication', async () => {
    const app = createPlatformSettingsApi(dependencies(gateway(), null))
    const response = await app.request('/platform/settings')
    expect(response.status).toBe(401)
  })

  it('requires platform.settings.read to read settings', async () => {
    const app = createPlatformSettingsApi(
      dependencies(gateway(), authContext({ permissions: ['features.manage'] })),
    )
    const response = await app.request('/platform/settings')
    expect(response.status).toBe(403)
  })

  it('returns the global settings', async () => {
    const app = createPlatformSettingsApi(dependencies(gateway()))
    const response = await app.request('/platform/settings')
    expect(response.status).toBe(200)
    const body = (await response.json()) as { settings: PlatformGlobalSettings }
    expect(body.settings.requireSupportAccessApproval).toBe(true)
  })

  it('requires platform.settings.manage to write settings', async () => {
    const app = createPlatformSettingsApi(
      dependencies(gateway(), authContext({ permissions: ['platform.settings.read'] })),
    )
    const response = await app.request('/platform/settings', {
      method: 'PUT',
      body: JSON.stringify({ allowWorkspaceSelfService: true }),
    })
    expect(response.status).toBe(403)
  })

  it('rejects an empty settings patch', async () => {
    const app = createPlatformSettingsApi(dependencies(gateway()))
    const response = await app.request('/platform/settings', { method: 'PUT', body: '{}' })
    expect(response.status).toBe(400)
  })

  it('applies a settings patch', async () => {
    let received: unknown = null
    const gw = gateway({
      updateGlobalSettings: async (patch) => {
        received = patch
        return mergeSettings(patch)
      },
    })
    const app = createPlatformSettingsApi(dependencies(gw))
    const response = await app.request('/platform/settings', {
      method: 'PUT',
      body: JSON.stringify({ allowWorkspaceSelfService: true }),
    })
    expect(response.status).toBe(200)
    expect((received as { allowWorkspaceSelfService: boolean }).allowWorkspaceSelfService).toBe(true)
  })
})

describe('platform settings API — entitlements', () => {
  it('requires features.manage for entitlement reads', async () => {
    const app = createPlatformSettingsApi(
      dependencies(gateway(), authContext({ permissions: ['platform.settings.read'] })),
    )
    const response = await app.request('/platform/companies/company-1/entitlements')
    expect(response.status).toBe(403)
  })

  it('lists entitlements with the fail-closed effective state', async () => {
    const app = createPlatformSettingsApi(dependencies(gateway(), authContext(), 1000))
    const response = await app.request('/platform/companies/company-1/entitlements')
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      entitlements: readonly { featureKey: string; effectiveState: string }[]
    }
    // scheduled with startsAt 9000 and now = 1000 → disabled
    expect(body.entitlements[0]!.effectiveState).toBe('disabled')
  })

  it('resolves the effective state once the schedule start has passed', async () => {
    const app = createPlatformSettingsApi(dependencies(gateway(), authContext(), 20_000))
    const response = await app.request('/platform/companies/company-1/entitlements')
    const body = (await response.json()) as { entitlements: readonly { effectiveState: string }[] }
    expect(body.entitlements[0]!.effectiveState).toBe('enabled')
  })

  it('returns 404 for a missing entitlement', async () => {
    const app = createPlatformSettingsApi(
      dependencies(gateway({ getEntitlement: async () => null })),
    )
    const response = await app.request('/platform/companies/company-1/entitlements/maps_location')
    expect(response.status).toBe(404)
  })

  it('creates an entitlement when none exists', async () => {
    const app = createPlatformSettingsApi(
      dependencies(gateway({ getEntitlement: async () => null })),
    )
    const response = await app.request('/platform/companies/company-1/entitlements/ai_planning', {
      method: 'PUT',
      body: JSON.stringify({ status: 'enabled' }),
    })
    expect(response.status).toBe(201)
  })

  it('updates an existing entitlement with 200', async () => {
    const app = createPlatformSettingsApi(dependencies(gateway()))
    const response = await app.request('/platform/companies/company-1/entitlements/ai_planning', {
      method: 'PUT',
      body: JSON.stringify({ status: 'disabled' }),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { entitlement: { status: string } }
    expect(body.entitlement.status).toBe('disabled')
  })

  it('rejects an inverted entitlement window with 409', async () => {
    const app = createPlatformSettingsApi(dependencies(gateway()))
    const response = await app.request('/platform/companies/company-1/entitlements/ai_planning', {
      method: 'PUT',
      body: JSON.stringify({ status: 'scheduled', startsAt: 5000, endsAt: 4000 }),
    })
    expect(response.status).toBe(409)
    expect(((await response.json()) as { error: string }).error).toBe('entitlement_window_invalid')
  })

  it('rejects an unknown entitlement status', async () => {
    const app = createPlatformSettingsApi(dependencies(gateway()))
    const response = await app.request('/platform/companies/company-1/entitlements/ai_planning', {
      method: 'PUT',
      body: JSON.stringify({ status: 'paused' }),
    })
    expect(response.status).toBe(400)
  })
})
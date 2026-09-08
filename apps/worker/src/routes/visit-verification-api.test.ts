import type { AuthContext } from '@fieldrep/domain'
import { describe, expect, it } from 'vitest'

import {
  createVisitVerificationApi,
  type VisitVerificationApiDependencies,
  type VisitVerificationPort,
} from './visit-verification-api'

function authContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    membershipId: 'membership-1',
    companyId: 'company-1',
    workspaceId: 'workspace-a',
    roleKeys: ['user'],
    permissions: ['visits.read.own', 'visits.create.own'],
    scopes: [{ type: 'self' }],
    ...overrides,
  }
}

function port(overrides: Partial<VisitVerificationPort> = {}): VisitVerificationPort {
  return {
    resolveTargetPoint: async () => ({ latitude: 35.6892, longitude: 51.389 }),
    persistResult: async (input) => input.result,
    getResultForVisit: async () => null,
    ...overrides,
  }
}

function dependencies(
  portOverrides: Partial<VisitVerificationPort> = {},
  options: { enabled?: boolean } = {},
): VisitVerificationApiDependencies {
  return {
    authContextResolver: { resolve: async () => authContext() },
    isVerificationEnabled: async () => options.enabled ?? true,
    portForWorkspace: async (workspaceId) => {
      expect(workspaceId).toBe('workspace-a')
      return port(portOverrides)
    },
  }
}

const validBody = {
  latitude: 35.6899,
  longitude: 51.3898,
  accuracyMeters: 10,
  captureMode: 'gps',
}

describe('visit verification API', () => {
  it('requires authentication before evaluation', async () => {
    const app = createVisitVerificationApi({
      ...dependencies(),
      authContextResolver: { resolve: async () => null },
    })

    const response = await app.request(
      '/workspaces/workspace-a/visits/visit-1/verification',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
      },
    )
    expect(response.status).toBe(401)
  })

  it('evaluates and persists a verification decision', async () => {
    let persisted: { visitId?: string; ownerUserId?: string } | undefined
    const app = createVisitVerificationApi(
      dependencies({
        persistResult: async (input) => {
          persisted = input
          return {
            ...input.result,
            reasons: input.result.reasons,
          }
        },
      }),
    )

    const response = await app.request(
      '/workspaces/workspace-a/visits/visit-1/verification',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
      },
    )

    expect(response.status).toBe(201)
    const payload = (await response.json()) as { verification: { status: string } }
    expect(payload.verification.status).toBe('verified')
    expect(persisted).toMatchObject({ visitId: 'visit-1', ownerUserId: 'user-1' })
  })

  it('rejects malformed evaluation payloads', async () => {
    const app = createVisitVerificationApi(dependencies())

    const response = await app.request(
      '/workspaces/workspace-a/visits/visit-1/verification',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ latitude: 999 }),
      },
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'invalid_verification_input' })
  })

  it('blocks evaluation when the workspace toggle is off', async () => {
    const app = createVisitVerificationApi(dependencies({}, { enabled: false }))

    const response = await app.request(
      '/workspaces/workspace-a/visits/visit-1/verification',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
      },
    )
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'verification_disabled' })
  })

  it('returns a stored verification under read permission', async () => {
    const app = createVisitVerificationApi(
      dependencies({
        getResultForVisit: async () => ({
          status: 'nearby',
          distanceMeters: 320,
          accuracyMeters: 15,
          policyRadiusMeters: 500,
          reasons: ['within_nearby_radius'],
        }),
      }),
    )

    const response = await app.request(
      '/workspaces/workspace-a/visits/visit-1/verification',
    )
    expect(response.status).toBe(200)
    const payload = (await response.json()) as { verification: { status: string } }
    expect(payload.verification.status).toBe('nearby')
  })

  it('returns 404 when no verification has been recorded', async () => {
    const app = createVisitVerificationApi(dependencies())

    const response = await app.request(
      '/workspaces/workspace-a/visits/visit-1/verification',
    )
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'verification_not_found' })
  })
})
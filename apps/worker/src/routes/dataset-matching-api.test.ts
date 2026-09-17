import type { AuthContext, DatasetBuild, PractitionerSourceRecord } from '@fieldrep/domain'
import { describe, expect, it } from 'vitest'

import {
  createDatasetMatchingApi,
  type DatasetMatchingDependencies,
  type DatasetMatchingGateway,
} from './dataset-matching-api'

function authContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'platform-admin-1',
    membershipId: 'membership-pa1',
    companyId: 'company-1',
    workspaceId: 'workspace-a',
    roleKeys: ['platform_admin'],
    permissions: ['datasets.read', 'datasets.deduplicate', 'datasets.build'],
    scopes: [{ type: 'platform' }],
    ...overrides,
  }
}

const record: PractitionerSourceRecord = {
  id: 'rec1',
  datasetId: 'd1',
  datasetVersionId: 'v1',
  sourceRecordRef: 'row-1',
  matchKey: 'nid:4567891234',
  fullName: 'علی رضایی',
  nationalId: '4567891234',
  phone: null,
  licenseId: null,
  matchStatus: 'candidate',
  practitionerId: null,
  decidedBy: null,
  decidedAt: null,
  createdAt: 1000,
  updatedAt: 1000,
}

const build: DatasetBuild = {
  id: 'b1',
  sourceDatasetId: 'd1',
  sourceVersionId: 'v1',
  targetDatasetId: 'd2',
  targetVersionId: 'v2',
  definition: { specialtyIds: ['cardiology'] },
  recordCount: 120,
  createdBy: 'platform-admin-1',
  createdAt: 1000,
}

function gateway(overrides: Partial<DatasetMatchingGateway> = {}): DatasetMatchingGateway {
  return {
    listRecords: async () => [record],
    registerRecord: async (input) => ({ ...record, id: input.id, sourceRecordRef: input.sourceRecordRef, matchStatus: 'unmatched' }),
    linkMatch: async (input) => ({
      record: {
        ...record,
        matchStatus: 'matched',
        practitionerId: input.practitionerId,
        decidedBy: input.decidedBy,
        decidedAt: 2000,
        updatedAt: 2000,
      },
      outcome: 'linked',
    }),
    confirmUnmatched: async (id, decidedBy) => ({
      record: {
        ...record,
        id,
        matchStatus: 'confirmed_unmatched',
        decidedBy,
        decidedAt: 2000,
        updatedAt: 2000,
      },
      outcome: 'linked',
    }),
    listBuilds: async () => [build],
    createBuild: async (input) => ({ build: { ...build, id: input.id }, outcome: 'created' }),
    ...overrides,
  }
}

function dependencies(
  gw: DatasetMatchingGateway,
  context: AuthContext | null = authContext(),
  now = 1000,
): DatasetMatchingDependencies {
  return {
    authContextResolver: { resolve: async () => context },
    datasetMatching: () => gw,
    now: () => now,
  }
}

describe('practitioner matching API', () => {
  it('requires authentication', async () => {
    const app = createDatasetMatchingApi(dependencies(gateway(), null))
    const response = await app.request('/platform/datasets/d1/versions/v1/match-records')
    expect(response.status).toBe(401)
  })

  it('lists match records with datasets.read, including a status filter', async () => {
    const app = createDatasetMatchingApi(dependencies(gateway()))
    const response = await app.request(
      '/platform/datasets/d1/versions/v1/match-records?status=candidate',
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as { records: readonly PractitionerSourceRecord[] }
    expect(body.records[0]!.matchStatus).toBe('candidate')
  })

  it('registers source records as unmatched with 201', async () => {
    const app = createDatasetMatchingApi(dependencies(gateway()))
    const response = await app.request('/platform/datasets/d1/versions/v1/match-records', {
      method: 'POST',
      body: JSON.stringify({
        records: [{ id: 'rec2', sourceRecordRef: 'row-2', fullName: 'مریم کاظمی' }],
      }),
    })
    expect(response.status).toBe(201)
    const body = (await response.json()) as { records: readonly PractitionerSourceRecord[] }
    expect(body.records[0]!.matchStatus).toBe('unmatched')
  })

  it('rejects an empty record batch with 400', async () => {
    const app = createDatasetMatchingApi(dependencies(gateway()))
    const response = await app.request('/platform/datasets/d1/versions/v1/match-records', {
      method: 'POST',
      body: JSON.stringify({ records: [] }),
    })
    expect(response.status).toBe(400)
  })

  it('links a record to the registry and records the reviewer', async () => {
    const app = createDatasetMatchingApi(dependencies(gateway()))
    const response = await app.request('/platform/datasets/d1/match-records/rec1/link', {
      method: 'POST',
      body: JSON.stringify({ practitionerId: 'pract-7' }),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { record: PractitionerSourceRecord }
    expect(body.record.matchStatus).toBe('matched')
    expect(body.record.practitionerId).toBe('pract-7')
    expect(body.record.decidedBy).toBe('platform-admin-1')
  })

  it('returns 404 for an unknown record and 409 for a refused link', async () => {
    const missing = createDatasetMatchingApi(
      dependencies(gateway({ linkMatch: async () => null })),
    )
    expect(
      (
        await missing.request('/platform/datasets/d1/match-records/x/link', {
          method: 'POST',
          body: JSON.stringify({ practitionerId: 'p1' }),
        })
      ).status,
    ).toBe(404)

    const refused = createDatasetMatchingApi(
      dependencies(gateway({ linkMatch: async () => ({ record, outcome: 'rejected' }) })),
    )
    expect(
      (
        await refused.request('/platform/datasets/d1/match-records/rec1/link', {
          method: 'POST',
          body: JSON.stringify({ practitionerId: 'p1' }),
        })
      ).status,
    ).toBe(409)
  })

  it('confirms unmatched terminally and refuses a repeat decision', async () => {
    const app = createDatasetMatchingApi(dependencies(gateway()))
    const ok = await app.request('/platform/datasets/d1/match-records/rec1/confirm-unmatched', {
      method: 'POST',
    })
    expect(ok.status).toBe(200)
    const body = (await ok.json()) as { record: PractitionerSourceRecord }
    expect(body.record.matchStatus).toBe('confirmed_unmatched')

    const refused = createDatasetMatchingApi(
      dependencies(gateway({ confirmUnmatched: async () => ({ record, outcome: 'rejected' }) })),
    )
    expect(
      (
        await refused.request('/platform/datasets/d1/match-records/rec1/confirm-unmatched', {
          method: 'POST',
        })
      ).status,
    ).toBe(409)
  })

  it('requires datasets.deduplicate to review', async () => {
    const app = createDatasetMatchingApi(
      dependencies(gateway(), authContext({ permissions: ['datasets.read'] })),
    )
    const response = await app.request('/platform/datasets/d1/match-records/rec1/link', {
      method: 'POST',
      body: JSON.stringify({ practitionerId: 'p1' }),
    })
    expect(response.status).toBe(403)
  })
})

describe('dataset build API', () => {
  it('creates a build with 201 and the caller recorded', async () => {
    const app = createDatasetMatchingApi(dependencies(gateway()))
    const response = await app.request('/platform/datasets/d1/versions/v1/builds', {
      method: 'POST',
      body: JSON.stringify({
        id: 'b2',
        targetDatasetId: 'd2',
        targetVersionId: 'v2',
        definition: { specialtyIds: ['cardiology'] },
        recordCount: 120,
      }),
    })
    expect(response.status).toBe(201)
    const body = (await response.json()) as { build: DatasetBuild }
    expect(body.build.createdBy).toBe('platform-admin-1')
  })

  it('lists builds with datasets.read', async () => {
    const app = createDatasetMatchingApi(dependencies(gateway()))
    const response = await app.request('/platform/datasets/d1/versions/v1/builds')
    expect(response.status).toBe(200)
    const body = (await response.json()) as { builds: readonly DatasetBuild[] }
    expect(body.builds[0]!.targetVersionId).toBe('v2')
  })

  it('returns 400 for an empty definition and 409 for a refused build', async () => {
    const app = createDatasetMatchingApi(dependencies(gateway()))
    const invalid = await app.request('/platform/datasets/d1/versions/v1/builds', {
      method: 'POST',
      body: JSON.stringify({
        id: 'b3',
        targetDatasetId: 'd2',
        targetVersionId: 'v3',
        definition: {},
        recordCount: 5,
      }),
    })
    expect(invalid.status).toBe(400)

    const refused = createDatasetMatchingApi(
      dependencies(gateway({ createBuild: async () => ({ build, outcome: 'rejected' }) })),
    )
    const response = await refused.request('/platform/datasets/d1/versions/v1/builds', {
      method: 'POST',
      body: JSON.stringify({
        id: 'b4',
        targetDatasetId: 'd2',
        targetVersionId: 'v4',
        definition: { specialtyIds: ['x'] },
        recordCount: 5,
      }),
    })
    expect(response.status).toBe(409)
  })

  it('requires datasets.build to create a build', async () => {
    const app = createDatasetMatchingApi(
      dependencies(gateway(), authContext({ permissions: ['datasets.read'] })),
    )
    const response = await app.request('/platform/datasets/d1/versions/v1/builds', {
      method: 'POST',
      body: JSON.stringify({
        id: 'b5',
        targetDatasetId: 'd2',
        targetVersionId: 'v5',
        definition: { specialtyIds: ['x'] },
        recordCount: 5,
      }),
    })
    expect(response.status).toBe(403)
  })
})
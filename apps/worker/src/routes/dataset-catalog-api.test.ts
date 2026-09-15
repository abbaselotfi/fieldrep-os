import type { AuthContext, Dataset, DatasetAssignment, DatasetVersion } from '@fieldrep/domain'
import { describe, expect, it } from 'vitest'

import {
  createDatasetCatalogApi,
  type DatasetCatalogDependencies,
  type DatasetCatalogGateway,
} from './dataset-catalog-api'

function authContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'platform-admin-1',
    membershipId: 'membership-pa1',
    companyId: 'company-1',
    workspaceId: 'workspace-a',
    roleKeys: ['platform_admin'],
    permissions: [
      'datasets.read',
      'datasets.import',
      'datasets.version',
      'datasets.build',
      'datasets.assign',
      'datasets.revoke',
    ],
    scopes: [{ type: 'platform' }],
    ...overrides,
  }
}

const dataset: Dataset = {
  id: 'd1',
  ownerType: 'platform',
  ownerId: null,
  name: 'Iran practitioners',
  datasetType: 'practitioners',
  status: 'draft',
  sourceType: 'purchase',
  createdAt: 1000,
  updatedAt: 1000,
}

const version: DatasetVersion = {
  id: 'v1',
  datasetId: 'd1',
  versionLabel: '2026-09',
  status: 'draft',
  recordCount: 1200,
  createdBy: 'platform-admin-1',
  sourceImportId: null,
  createdAt: 1000,
  publishedAt: null,
}

const assignment: DatasetAssignment = {
  id: 'a1',
  datasetId: 'd1',
  datasetVersionId: 'v1',
  recipientCompanyId: 'company-1',
  recipientWorkspaceId: null,
  mode: 'snapshot',
  status: 'active',
  validFrom: null,
  validUntil: null,
  createdAt: 1000,
  updatedAt: 1000,
}

function gateway(overrides: Partial<DatasetCatalogGateway> = {}): DatasetCatalogGateway {
  return {
    listDatasets: async () => [dataset],
    getDataset: async () => dataset,
    createDataset: async (input) => ({
      id: input.id,
      ownerType: input.ownerType ?? 'platform',
      ownerId: input.ownerId ?? null,
      name: input.name,
      datasetType: input.datasetType,
      status: 'draft',
      sourceType: input.sourceType,
      createdAt: 1000,
      updatedAt: 1000,
    }),
    listVersions: async () => [version],
    createVersion: async (input) => ({
      id: input.id,
      datasetId: input.datasetId,
      versionLabel: input.versionLabel,
      status: 'draft',
      recordCount: input.recordCount,
      createdBy: input.createdBy ?? null,
      sourceImportId: input.sourceImportId ?? null,
      createdAt: 1000,
      publishedAt: null,
    }),
    publishVersion: async () => ({
      version: { ...version, status: 'published' as const },
      outcome: 'published' as const,
    }),
    listAssignments: async () => [assignment],
    createAssignment: async (input) => ({
      assignment: {
        id: input.id,
        datasetId: input.datasetId,
        datasetVersionId: input.datasetVersionId ?? null,
        recipientCompanyId: input.recipientCompanyId,
        recipientWorkspaceId: input.recipientWorkspaceId ?? null,
        mode: input.mode,
        status: 'active' as const,
        validFrom: input.validFrom ?? null,
        validUntil: input.validUntil ?? null,
        createdAt: 1000,
        updatedAt: 1000,
      },
      outcome: 'created' as const,
    }),
    revokeAssignment: async () => ({
      assignment: { ...assignment, status: 'revoked' as const },
      outcome: 'revoked' as const,
    }),
    ...overrides,
  }
}

function dependencies(
  gw: DatasetCatalogGateway,
  context: AuthContext | null = authContext(),
  now = 1000,
): DatasetCatalogDependencies {
  return {
    authContextResolver: { resolve: async () => context },
    datasetCatalog: () => gw,
    now: () => now,
  }
}

describe('dataset catalog API — catalog', () => {
  it('requires authentication', async () => {
    const app = createDatasetCatalogApi(dependencies(gateway(), null))
    const response = await app.request('/platform/datasets')
    expect(response.status).toBe(401)
  })

  it('requires datasets.read for catalog reads', async () => {
    const app = createDatasetCatalogApi(
      dependencies(gateway(), authContext({ permissions: ['datasets.assign'] })),
    )
    const response = await app.request('/platform/datasets')
    expect(response.status).toBe(403)
  })

  it('lists datasets', async () => {
    const app = createDatasetCatalogApi(dependencies(gateway()))
    const response = await app.request('/platform/datasets')
    expect(response.status).toBe(200)
    const body = (await response.json()) as { datasets: readonly Dataset[] }
    expect(body.datasets[0]!.name).toBe('Iran practitioners')
  })

  it('requires datasets.import to create a dataset', async () => {
    const app = createDatasetCatalogApi(
      dependencies(gateway(), authContext({ permissions: ['datasets.read'] })),
    )
    const response = await app.request('/platform/datasets', {
      method: 'POST',
      body: JSON.stringify({ id: 'd2', name: 'x', datasetType: 'mixed', sourceType: 'curated' }),
    })
    expect(response.status).toBe(403)
  })

  it('creates a dataset with 201', async () => {
    const app = createDatasetCatalogApi(dependencies(gateway()))
    const response = await app.request('/platform/datasets', {
      method: 'POST',
      body: JSON.stringify({ id: 'd2', name: 'Mixed', datasetType: 'mixed', sourceType: 'curated' }),
    })
    expect(response.status).toBe(201)
    const body = (await response.json()) as { dataset: Dataset }
    expect(body.dataset.status).toBe('draft')
  })

  it('rejects an unknown dataset type', async () => {
    const app = createDatasetCatalogApi(dependencies(gateway()))
    const response = await app.request('/platform/datasets', {
      method: 'POST',
      body: JSON.stringify({ id: 'd2', name: 'x', datasetType: 'doctors', sourceType: 'curated' }),
    })
    expect(response.status).toBe(400)
  })

  it('returns 404 for an unknown dataset', async () => {
    const app = createDatasetCatalogApi(dependencies(gateway({ getDataset: async () => null })))
    const response = await app.request('/platform/datasets/missing')
    expect(response.status).toBe(404)
  })

  it('returns the dataset with its versions', async () => {
    const app = createDatasetCatalogApi(dependencies(gateway()))
    const response = await app.request('/platform/datasets/d1')
    expect(response.status).toBe(200)
    const body = (await response.json()) as { versions: readonly DatasetVersion[] }
    expect(body.versions).toHaveLength(1)
  })
})

describe('dataset catalog API — versions & publication', () => {
  it('requires datasets.version to create a version', async () => {
    const app = createDatasetCatalogApi(
      dependencies(gateway(), authContext({ permissions: ['datasets.read'] })),
    )
    const response = await app.request('/platform/datasets/d1/versions', {
      method: 'POST',
      body: JSON.stringify({ id: 'v2', versionLabel: '2026-10', recordCount: 5 }),
    })
    expect(response.status).toBe(403)
  })

  it('creates a version attributed to the acting admin', async () => {
    let received: unknown = null
    const gw = gateway({
      createVersion: async (input) => {
        received = input
        return {
          id: input.id,
          datasetId: input.datasetId,
          versionLabel: input.versionLabel,
          status: 'draft' as const,
          recordCount: input.recordCount,
          createdBy: input.createdBy ?? null,
          sourceImportId: input.sourceImportId ?? null,
          createdAt: 1000,
          publishedAt: null,
        }
      },
    })
    const app = createDatasetCatalogApi(dependencies(gw))
    const response = await app.request('/platform/datasets/d1/versions', {
      method: 'POST',
      body: JSON.stringify({ id: 'v2', versionLabel: '2026-10', recordCount: 5 }),
    })
    expect(response.status).toBe(201)
    expect((received as { createdBy: string }).createdBy).toBe('platform-admin-1')
  })

  it('publishes a version', async () => {
    const app = createDatasetCatalogApi(dependencies(gateway()))
    const response = await app.request('/platform/datasets/d1/versions/v1/publish', {
      method: 'POST',
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { version: DatasetVersion }
    expect(body.version.status).toBe('published')
  })

  it('returns 409 when publication is refused', async () => {
    const app = createDatasetCatalogApi(
      dependencies(gateway({ publishVersion: async () => ({ version, outcome: 'rejected' }) })),
    )
    const response = await app.request('/platform/datasets/d1/versions/v1/publish', {
      method: 'POST',
    })
    expect(response.status).toBe(409)
    expect(((await response.json()) as { error: string }).error).toBe('publication_not_allowed')
  })

  it('returns 404 when publishing an unknown version', async () => {
    const app = createDatasetCatalogApi(
      dependencies(gateway({ publishVersion: async () => null })),
    )
    const response = await app.request('/platform/datasets/d1/versions/missing/publish', {
      method: 'POST',
    })
    expect(response.status).toBe(404)
  })
})

describe('dataset catalog API — assignments', () => {
  it('requires datasets.assign to create an assignment', async () => {
    const app = createDatasetCatalogApi(
      dependencies(gateway(), authContext({ permissions: ['datasets.read'] })),
    )
    const response = await app.request('/platform/datasets/d1/assignments', {
      method: 'POST',
      body: JSON.stringify({ id: 'a2', recipientCompanyId: 'c1', mode: 'live' }),
    })
    expect(response.status).toBe(403)
  })

  it('creates a snapshot assignment with 201', async () => {
    const app = createDatasetCatalogApi(dependencies(gateway()))
    const response = await app.request('/platform/datasets/d1/assignments', {
      method: 'POST',
      body: JSON.stringify({
        id: 'a2',
        recipientCompanyId: 'c1',
        mode: 'snapshot',
        datasetVersionId: 'v1',
      }),
    })
    expect(response.status).toBe(201)
  })

  it('returns 409 when assignment creation is refused (no write)', async () => {
    const app = createDatasetCatalogApi(
      dependencies(gateway({ createAssignment: async () => ({ assignment, outcome: 'rejected' }) })),
    )
    const response = await app.request('/platform/datasets/d1/assignments', {
      method: 'POST',
      body: JSON.stringify({ id: 'a2', recipientCompanyId: 'c1', mode: 'snapshot' }),
    })
    expect(response.status).toBe(409)
    expect(((await response.json()) as { error: string }).error).toBe('assignment_not_allowed')
  })

  it('lists assignments with the fail-closed effective state', async () => {
    const app = createDatasetCatalogApi(dependencies(gateway(), authContext(), 5000))
    const response = await app.request('/platform/datasets/d1/assignments')
    expect(response.status).toBe(200)
    const body = (await response.json()) as { assignments: readonly { effectiveState: string }[] }
    expect(body.assignments[0]!.effectiveState).toBe('active')
  })

  it('marks a window-expired assignment inactive', async () => {
    const app = createDatasetCatalogApi(
      dependencies(
        gateway({ listAssignments: async () => [{ ...assignment, validUntil: 4000 }] }),
        authContext(),
        5000,
      ),
    )
    const response = await app.request('/platform/datasets/d1/assignments')
    const body = (await response.json()) as { assignments: readonly { effectiveState: string }[] }
    expect(body.assignments[0]!.effectiveState).toBe('inactive')
  })

  it('requires datasets.revoke to revoke', async () => {
    const app = createDatasetCatalogApi(
      dependencies(gateway(), authContext({ permissions: ['datasets.read'] })),
    )
    const response = await app.request('/platform/datasets/d1/assignments/a1/revoke', {
      method: 'POST',
    })
    expect(response.status).toBe(403)
  })

  it('revokes an assignment', async () => {
    const app = createDatasetCatalogApi(dependencies(gateway()))
    const response = await app.request('/platform/datasets/d1/assignments/a1/revoke', {
      method: 'POST',
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { assignment: DatasetAssignment }
    expect(body.assignment.status).toBe('revoked')
  })

  it('returns 404 for an unknown assignment and 409 for a repeat revocation', async () => {
    const missing = createDatasetCatalogApi(
      dependencies(gateway({ revokeAssignment: async () => null })),
    )
    expect(
      (await missing.request('/platform/datasets/d1/assignments/x/revoke', { method: 'POST' }))
        .status,
    ).toBe(404)

    const repeat = createDatasetCatalogApi(
      dependencies(
        gateway({
          revokeAssignment: async () => ({
            assignment: { ...assignment, status: 'revoked' },
            outcome: 'rejected',
          }),
        }),
      ),
    )
    expect(
      (await repeat.request('/platform/datasets/d1/assignments/a1/revoke', { method: 'POST' }))
        .status,
    ).toBe(409)
  })
})
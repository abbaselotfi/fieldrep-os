import type { AuthContext, DatasetImport, DuplicateReviewCandidate } from '@fieldrep/domain'
import { describe, expect, it } from 'vitest'

import {
  createDatasetImportApi,
  type DatasetImportDependencies,
  type DatasetImportGateway,
} from './dataset-import-api'

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
      'datasets.normalize',
      'datasets.deduplicate',
    ],
    scopes: [{ type: 'platform' }],
    ...overrides,
  }
}

const datasetImport: DatasetImport = {
  id: 'imp1',
  datasetId: 'd1',
  sourceFileReference: 's3://raw/imp1.ndjson',
  originalFilename: 'practitioners.csv',
  importedBy: 'platform-admin-1',
  importedAt: 1000,
  status: 'received',
  rowCount: 0,
  validCount: 0,
  invalidCount: 0,
  manifest: null,
}

const candidate: DuplicateReviewCandidate = {
  id: 'dup1',
  datasetId: 'd1',
  importId: 'imp1',
  matchKey: 'nid:4567891234',
  recordRefs: ['row-1', 'row-2'],
  status: 'pending',
  decidedBy: null,
  decidedAt: null,
  createdAt: 1000,
  updatedAt: 1000,
}

function gateway(overrides: Partial<DatasetImportGateway> = {}): DatasetImportGateway {
  return {
    listImports: async () => [datasetImport],
    createImport: async (input) => ({ ...datasetImport, id: input.id, importedBy: input.importedBy ?? null }),
    completeNormalization: async () => ({
      datasetImport: { ...datasetImport, status: 'normalized', rowCount: 100, validCount: 95, invalidCount: 5 },
      outcome: 'normalized',
    }),
    retryImport: async () => ({
      datasetImport: { ...datasetImport, status: 'received' },
      outcome: 'reopened',
    }),
    listCandidates: async () => [candidate],
    recordCandidate: async (input) => ({
      candidate: { ...candidate, id: input.id, matchKey: input.matchKey },
      outcome: 'recorded',
    }),
    decideCandidate: async (input) => ({
      candidate: {
        ...candidate,
        status: input.decision,
        decidedBy: input.decidedBy,
        decidedAt: 1700,
        updatedAt: 1700,
      },
      outcome: 'decided',
    }),
    ...overrides,
  }
}

function dependencies(
  gw: DatasetImportGateway,
  context: AuthContext | null = authContext(),
  now = 1000,
): DatasetImportDependencies {
  return {
    authContextResolver: { resolve: async () => context },
    datasetImport: () => gw,
    now: () => now,
  }
}

describe('import ledger API', () => {
  it('requires authentication', async () => {
    const app = createDatasetImportApi(dependencies(gateway(), null))
    const response = await app.request('/platform/datasets/d1/imports')
    expect(response.status).toBe(401)
  })

  it('lists imports with datasets.read', async () => {
    const app = createDatasetImportApi(dependencies(gateway()))
    const response = await app.request('/platform/datasets/d1/imports')
    expect(response.status).toBe(200)
    const body = (await response.json()) as { imports: readonly DatasetImport[] }
    expect(body.imports[0]!.id).toBe('imp1')
  })

  it('refuses listing without datasets.read', async () => {
    const app = createDatasetImportApi(
      dependencies(gateway(), authContext({ permissions: ['datasets.import'] })),
    )
    const response = await app.request('/platform/datasets/d1/imports')
    expect(response.status).toBe(403)
  })

  it('registers an import with 201 and records the caller', async () => {
    const app = createDatasetImportApi(dependencies(gateway()))
    const response = await app.request('/platform/datasets/d1/imports', {
      method: 'POST',
      body: JSON.stringify({
        id: 'imp2',
        originalFilename: 'new.csv',
        sourceFileReference: 's3://raw/imp2',
      }),
    })
    expect(response.status).toBe(201)
    const body = (await response.json()) as { import: DatasetImport }
    expect(body.import.id).toBe('imp2')
    expect(body.import.importedBy).toBe('platform-admin-1')
  })

  it('rejects an invalid import payload with 400', async () => {
    const app = createDatasetImportApi(dependencies(gateway()))
    const response = await app.request('/platform/datasets/d1/imports', {
      method: 'POST',
      body: JSON.stringify({ originalFilename: '' }),
    })
    expect(response.status).toBe(400)
  })

  it('completes normalization with 200 and the ledger outcome', async () => {
    const app = createDatasetImportApi(dependencies(gateway()))
    const response = await app.request('/platform/datasets/d1/imports/imp1/normalize', {
      method: 'POST',
      body: JSON.stringify({ rowCount: 100, validCount: 95, invalidCount: 5 }),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { outcome: string; import: DatasetImport }
    expect(body.outcome).toBe('normalized')
    expect(body.import.status).toBe('normalized')
  })

  it('returns 400 for non-partitioning count payloads before touching the ledger', async () => {
    const app = createDatasetImportApi(dependencies(gateway()))
    const response = await app.request('/platform/datasets/d1/imports/imp1/normalize', {
      method: 'POST',
      body: JSON.stringify({ rowCount: 100, validCount: 95, invalidCount: 10 }),
    })
    expect(response.status).toBe(400)
  })

  it('returns 404 for an unknown import and 409 for a refused normalization', async () => {
    const missing = createDatasetImportApi(
      dependencies(gateway({ completeNormalization: async () => null })),
    )
    expect(
      (
        await missing.request('/platform/datasets/d1/imports/x/normalize', {
          method: 'POST',
          body: JSON.stringify({ rowCount: 1, validCount: 1, invalidCount: 0 }),
        })
      ).status,
    ).toBe(404)

    const refused = createDatasetImportApi(
      dependencies(
        gateway({ completeNormalization: async () => ({ datasetImport, outcome: 'rejected' }) }),
      ),
    )
    const response = await refused.request('/platform/datasets/d1/imports/imp1/normalize', {
      method: 'POST',
      body: JSON.stringify({ rowCount: 1, validCount: 1, invalidCount: 0 }),
    })
    expect(response.status).toBe(409)
  })

  it('retries a failed import and refuses a retry that is not allowed', async () => {
    const app = createDatasetImportApi(dependencies(gateway()))
    const ok = await app.request('/platform/datasets/d1/imports/imp1/retry', { method: 'POST' })
    expect(ok.status).toBe(200)
    const body = (await ok.json()) as { import: DatasetImport }
    expect(body.import.status).toBe('received')

    const refused = createDatasetImportApi(
      dependencies(gateway({ retryImport: async () => ({ datasetImport, outcome: 'rejected' }) })),
    )
    expect(
      (await refused.request('/platform/datasets/d1/imports/imp1/retry', { method: 'POST' })).status,
    ).toBe(409)
  })

  it('requires datasets.normalize to normalize', async () => {
    const app = createDatasetImportApi(
      dependencies(gateway(), authContext({ permissions: ['datasets.read'] })),
    )
    const response = await app.request('/platform/datasets/d1/imports/imp1/normalize', {
      method: 'POST',
      body: JSON.stringify({ rowCount: 1, validCount: 1, invalidCount: 0 }),
    })
    expect(response.status).toBe(403)
  })
})

describe('duplicate review API', () => {
  it('lists candidates with datasets.read', async () => {
    const app = createDatasetImportApi(dependencies(gateway()))
    const response = await app.request('/platform/datasets/d1/duplicates?status=pending')
    expect(response.status).toBe(200)
    const body = (await response.json()) as { candidates: readonly DuplicateReviewCandidate[] }
    expect(body.candidates[0]!.matchKey).toBe('nid:4567891234')
  })

  it('records a candidate with 201 and refuses an invalid one with 409', async () => {
    const app = createDatasetImportApi(dependencies(gateway()))
    const ok = await app.request('/platform/datasets/d1/duplicates', {
      method: 'POST',
      body: JSON.stringify({
        id: 'dup2',
        importId: 'imp1',
        matchKey: 'name:علی رضا',
        recordRefs: ['row-3', 'row-4'],
      }),
    })
    expect(ok.status).toBe(201)

    const refused = createDatasetImportApi(
      dependencies(gateway({ recordCandidate: async () => ({ candidate, outcome: 'rejected' }) })),
    )
    const bad = await refused.request('/platform/datasets/d1/duplicates', {
      method: 'POST',
      body: JSON.stringify({ id: 'dup3', importId: 'imp1', matchKey: 'k', recordRefs: ['r1', 'r1'] }),
    })
    expect(bad.status).toBe(409)
  })

  it('decides a candidate with 200 and the deciding admin recorded', async () => {
    const app = createDatasetImportApi(dependencies(gateway()))
    const response = await app.request('/platform/datasets/d1/duplicates/dup1/decision', {
      method: 'POST',
      body: JSON.stringify({ decision: 'merged' }),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { candidate: DuplicateReviewCandidate }
    expect(body.candidate.status).toBe('merged')
    expect(body.candidate.decidedBy).toBe('platform-admin-1')
  })

  it('returns 404 for an unknown candidate and 409 for a repeat decision', async () => {
    const missing = createDatasetImportApi(
      dependencies(gateway({ decideCandidate: async () => null })),
    )
    expect(
      (
        await missing.request('/platform/datasets/d1/duplicates/x/decision', {
          method: 'POST',
          body: JSON.stringify({ decision: 'merged' }),
        })
      ).status,
    ).toBe(404)

    const repeat = createDatasetImportApi(
      dependencies(gateway({ decideCandidate: async () => ({ candidate, outcome: 'rejected' }) })),
    )
    expect(
      (
        await repeat.request('/platform/datasets/d1/duplicates/dup1/decision', {
          method: 'POST',
          body: JSON.stringify({ decision: 'merged' }),
        })
      ).status,
    ).toBe(409)
  })

  it('requires datasets.deduplicate to decide', async () => {
    const app = createDatasetImportApi(
      dependencies(gateway(), authContext({ permissions: ['datasets.read'] })),
    )
    const response = await app.request('/platform/datasets/d1/duplicates/dup1/decision', {
      method: 'POST',
      body: JSON.stringify({ decision: 'merged' }),
    })
    expect(response.status).toBe(403)
  })
})
import type { AuthContext, DatasetExportRecord, DatasetLicense } from '@fieldrep/domain'
import { describe, expect, it } from 'vitest'

import {
  createDatasetLicenseApi,
  type DatasetLicenseDependencies,
  type DatasetLicenseGateway,
  type TenantAccessEntry,
} from './dataset-license-api'

function authContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'platform-admin-1',
    membershipId: 'membership-pa1',
    companyId: 'company-1',
    workspaceId: 'workspace-a',
    roleKeys: ['platform_admin'],
    permissions: ['datasets.read', 'datasets.export'],
    scopes: [{ type: 'platform' }],
    ...overrides,
  }
}

const license: DatasetLicense = {
  datasetId: 'd1',
  licenseReference: 'IQVIA-2026',
  exportAllowed: true,
  redistributionAllowed: false,
  maxExportRecords: null,
  territory: null,
  updatedAt: 1000,
}

const exportRecord: DatasetExportRecord = {
  id: 'e1',
  datasetId: 'd1',
  datasetVersionId: 'v1',
  format: 'csv',
  recordCount: 100,
  reason: null,
  requestedBy: 'platform-admin-1',
  status: 'pending',
  createdAt: 1000,
  completedAt: null,
}

const accessEntry: TenantAccessEntry = {
  datasetId: 'd1',
  assignmentId: 'a1',
  mode: 'snapshot',
  versionId: 'v1',
  exportAllowed: true,
}

function gateway(overrides: Partial<DatasetLicenseGateway> = {}): DatasetLicenseGateway {
  return {
    resolveLicense: async () => license,
    upsertLicense: async (datasetId, input) => ({
      datasetId,
      licenseReference: input.licenseReference ?? null,
      exportAllowed: input.exportAllowed,
      redistributionAllowed: input.redistributionAllowed === true,
      maxExportRecords: input.maxExportRecords ?? null,
      territory: input.territory ?? null,
      updatedAt: 2000,
    }),
    listExports: async () => [exportRecord],
    createExport: async (input) => ({
      draft: { ...exportRecord, id: input.id, datasetVersionId: input.datasetVersionId },
      outcome: 'created',
      evaluation: { outcome: 'allowed', effectiveVersionId: input.datasetVersionId },
    }),
    decideExport: async (id, decision) => ({
      export: { ...exportRecord, id, status: decision, completedAt: 3000 },
      outcome: 'decided',
    }),
    resolveTenantAccess: async () => [accessEntry],
    ...overrides,
  }
}

function dependencies(
  gw: DatasetLicenseGateway,
  context: AuthContext | null = authContext(),
  now = 3000,
): DatasetLicenseDependencies {
  return {
    authContextResolver: { resolve: async () => context },
    datasetLicense: () => gw,
    now: () => now,
  }
}

describe('dataset license API', () => {
  it('requires authentication', async () => {
    const app = createDatasetLicenseApi(dependencies(gateway(), null))
    const response = await app.request('/platform/datasets/d1/license')
    expect(response.status).toBe(401)
  })

  it('reads the effective license terms with datasets.read', async () => {
    const app = createDatasetLicenseApi(dependencies(gateway()))
    const response = await app.request('/platform/datasets/d1/license')
    expect(response.status).toBe(200)
    const body = (await response.json()) as { license: DatasetLicense }
    expect(body.license.licenseReference).toBe('IQVIA-2026')
  })

  it('returns 404 when the dataset is unknown', async () => {
    const app = createDatasetLicenseApi(
      dependencies(gateway({ resolveLicense: async () => null })),
    )
    expect((await app.request('/platform/datasets/x/license')).status).toBe(404)
  })

  it('requires datasets.export to manage license terms and rejects bad payloads', async () => {
    const forbidden = createDatasetLicenseApi(
      dependencies(gateway(), authContext({ permissions: ['datasets.read'] })),
    )
    expect(
      (
        await forbidden.request('/platform/datasets/d1/license', {
          method: 'PUT',
          body: JSON.stringify({ exportAllowed: true }),
        })
      ).status,
    ).toBe(403)

    const app = createDatasetLicenseApi(dependencies(gateway()))
    expect(
      (
        await app.request('/platform/datasets/d1/license', {
          method: 'PUT',
          body: JSON.stringify({ exportAllowed: 'yes' }),
        })
      ).status,
    ).toBe(400)
  })

  it('up-inserts license terms with 200', async () => {
    const app = createDatasetLicenseApi(dependencies(gateway()))
    const response = await app.request('/platform/datasets/d1/license', {
      method: 'PUT',
      body: JSON.stringify({ exportAllowed: true, maxExportRecords: 250 }),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { license: DatasetLicense }
    expect(body.license.maxExportRecords).toBe(250)
  })

  it('lists the export ledger', async () => {
    const app = createDatasetLicenseApi(dependencies(gateway()))
    const response = await app.request('/platform/datasets/d1/exports')
    expect(response.status).toBe(200)
    const body = (await response.json()) as { exports: readonly DatasetExportRecord[] }
    expect(body.exports[0]!.id).toBe('e1')
  })
})

describe('dataset export API', () => {
  it('creates a platform export with 201 and records the requester', async () => {
    const app = createDatasetLicenseApi(dependencies(gateway()))
    const response = await app.request('/platform/datasets/d1/exports', {
      method: 'POST',
      body: JSON.stringify({
        id: 'e2',
        datasetVersionId: 'v1',
        format: 'csv',
        recordCount: 100,
      }),
    })
    expect(response.status).toBe(201)
    const body = (await response.json()) as { export: DatasetExportRecord }
    expect(body.export.id).toBe('e2')
    expect(body.export.requestedBy).toBe('platform-admin-1')
  })

  it('surfaces the deterministic refusal reason with 409', async () => {
    const app = createDatasetLicenseApi(
      dependencies(
        gateway({
          createExport: async (input) => ({
            draft: { ...exportRecord, id: input.id },
            outcome: 'rejected',
            evaluation: { outcome: 'license_denied', effectiveVersionId: null },
          }),
        }),
      ),
    )
    const response = await app.request('/platform/datasets/d1/exports', {
      method: 'POST',
      body: JSON.stringify({
        id: 'e3',
        datasetVersionId: 'v1',
        format: 'csv',
        recordCount: 10,
      }),
    })
    expect(response.status).toBe(409)
    const body = (await response.json()) as { error: string; reason: string }
    expect(body.reason).toBe('license_denied')
  })

  it('rejects an invalid export payload and an unknown format', async () => {
    const app = createDatasetLicenseApi(dependencies(gateway()))
    expect(
      (
        await app.request('/platform/datasets/d1/exports', {
          method: 'POST',
          body: JSON.stringify({ id: 'e4', datasetVersionId: 'v1', format: 'pdf', recordCount: 1 }),
        })
      ).status,
    ).toBe(400)
  })

  it('requests a tenant-scoped export on the assignment-governed path', async () => {
    let seenScope: string | undefined
    const app = createDatasetLicenseApi(
      dependencies(
        gateway({
          createExport: async (input, resolution) => {
            seenScope = `${resolution.scope}:${resolution.companyId ?? ''}:${resolution.workspaceId ?? ''}`
            return {
              draft: { ...exportRecord, id: input.id },
              outcome: 'created',
              evaluation: { outcome: 'allowed', effectiveVersionId: 'v1' },
            }
          },
        }),
      ),
    )
    const response = await app.request('/platform/tenants/c1/datasets/d1/exports', {
      method: 'POST',
      body: JSON.stringify({
        id: 'e5',
        datasetVersionId: 'v1',
        format: 'json',
        recordCount: 10,
        workspaceId: 'w-a',
      }),
    })
    expect(response.status).toBe(201)
    expect(seenScope).toBe('tenant:c1:w-a')
  })

  it('completes and rejects an export once, mapping 404/409', async () => {
    const app = createDatasetLicenseApi(dependencies(gateway()))
    const completed = await app.request('/platform/datasets/d1/exports/e1/complete', {
      method: 'POST',
    })
    expect(completed.status).toBe(200)
    const body = (await completed.json()) as { export: DatasetExportRecord }
    expect(body.export.status).toBe('completed')

    const missing = createDatasetLicenseApi(
      dependencies(gateway({ decideExport: async () => null })),
    )
    expect(
      (await missing.request('/platform/datasets/d1/exports/x/complete', { method: 'POST' })).status,
    ).toBe(404)

    const refused = createDatasetLicenseApi(
      dependencies(
        gateway({ decideExport: async () => ({ export: exportRecord, outcome: 'refused' }) }),
      ),
    )
    expect(
      (await refused.request('/platform/datasets/d1/exports/e1/complete', { method: 'POST' })).status,
    ).toBe(409)
  })

  it('records a rejection reason and requires it', async () => {
    const app = createDatasetLicenseApi(dependencies(gateway()))
    const response = await app.request('/platform/datasets/d1/exports/e1/reject', {
      method: 'POST',
      body: JSON.stringify({ reason: 'not approved' }),
    })
    expect(response.status).toBe(200)
    expect(((await response.json()) as { export: DatasetExportRecord }).export.status).toBe(
      'rejected',
    )

    expect(
      (
        await app.request('/platform/datasets/d1/exports/e1/reject', {
          method: 'POST',
          body: JSON.stringify({}),
        })
      ).status,
    ).toBe(400)
  })

  it('requires datasets.export for export writes', async () => {
    const app = createDatasetLicenseApi(
      dependencies(gateway(), authContext({ permissions: ['datasets.read'] })),
    )
    const response = await app.request('/platform/datasets/d1/exports', {
      method: 'POST',
      body: JSON.stringify({ id: 'e6', datasetVersionId: 'v1', format: 'csv', recordCount: 1 }),
    })
    expect(response.status).toBe(403)
  })
})

describe('tenant access enforcement surface', () => {
  it('returns the enforced access entries for a company', async () => {
    const app = createDatasetLicenseApi(dependencies(gateway()))
    const response = await app.request('/platform/tenants/c1/datasets/access?workspaceId=w-a')
    expect(response.status).toBe(200)
    const body = (await response.json()) as { access: readonly TenantAccessEntry[] }
    expect(body.access[0]!.versionId).toBe('v1')
    expect(body.access[0]!.exportAllowed).toBe(true)
  })

  it('serves nothing when no assignment is active (fail-closed)', async () => {
    const app = createDatasetLicenseApi(
      dependencies(gateway({ resolveTenantAccess: async () => [] })),
    )
    const response = await app.request('/platform/tenants/c1/datasets/access')
    expect(response.status).toBe(200)
    expect(((await response.json()) as { access: readonly TenantAccessEntry[] }).access).toEqual([])
  })

  it('requires datasets.read to resolve access', async () => {
    const app = createDatasetLicenseApi(
      dependencies(gateway(), authContext({ permissions: ['datasets.export'] })),
    )
    expect((await app.request('/platform/tenants/c1/datasets/access')).status).toBe(403)
  })
})
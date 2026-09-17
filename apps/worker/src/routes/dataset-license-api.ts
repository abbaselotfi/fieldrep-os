import type {
  CreateDatasetExportInput,
  DatasetExportRecord,
  DatasetLicense,
  DatasetLicenseInput,
} from '@fieldrep/domain'
import { Hono } from 'hono'
import { z } from 'zod'

import {
  attachAuthContext,
  requirePermission,
  type AuthContextResolver,
  type AuthorizationEnv,
} from '../middleware/authorization'

/**
 * Dataset licensing, export & assignment-enforcement API (P11-A4).
 *
 * Permission-scoped per PERMISSION-MATRIX §11 (Example F — a dataset export
 * requires a governed catalog entry and is always ledgered):
 *  - license / export-ledger reads   → `datasets.read`
 *  - license management, export creation and export decisions, tenant access
 *    resolution                     → `datasets.export`
 */

const licenseSchema = z.object({
  licenseReference: z.string().min(1).nullable().optional(),
  exportAllowed: z.boolean(),
  redistributionAllowed: z.boolean().optional(),
  maxExportRecords: z.number().int().min(0).nullable().optional(),
  territory: z.string().min(1).nullable().optional(),
})

const exportFormatSchema = z.enum(['csv', 'xlsx', 'json', 'ndjson'])

const createExportSchema = z.object({
  id: z.string().min(1),
  datasetVersionId: z.string().min(1),
  format: exportFormatSchema,
  recordCount: z.number().int().min(0),
  reason: z.string().min(1).optional(),
})

const tenantExportSchema = createExportSchema.extend({
  workspaceId: z.string().min(1).optional(),
})

const rejectExportSchema = z.object({ reason: z.string().min(1) })

/** The enforced tenant view of one dataset (P11-A4 data-path contract). */
export interface TenantAccessEntry {
  datasetId: string
  assignmentId: string
  mode: 'snapshot' | 'live'
  /** Enforced version to serve; null means "serve nothing". */
  versionId: string | null
  /** License AND assignment both permit export. */
  exportAllowed: boolean
}

export interface DatasetExportResolution {
  scope: 'platform' | 'tenant'
  companyId?: string | undefined
  workspaceId?: string | undefined
  atMs: number
}

export interface DatasetLicenseDependencies {
  authContextResolver: AuthContextResolver
  datasetLicense(): DatasetLicenseGateway
  now(): number
}

export interface DatasetLicenseGateway {
  resolveLicense(datasetId: string): Promise<DatasetLicense | null>
  upsertLicense(datasetId: string, input: DatasetLicenseInput): Promise<DatasetLicense>
  listExports(datasetId: string): Promise<readonly DatasetExportRecord[]>
  createExport(
    input: CreateDatasetExportInput,
    resolution: DatasetExportResolution,
  ): Promise<
    | {
        draft: DatasetExportRecord
        outcome: 'created' | 'rejected'
        evaluation: { outcome: string; effectiveVersionId: string | null }
      }
  >
  decideExport(
    id: string,
    decision: 'completed' | 'rejected',
    reason?: string | undefined,
  ): Promise<
    { export: DatasetExportRecord; outcome: 'decided' | 'refused' } | null
  >
  resolveTenantAccess(
    companyId: string,
    workspaceId: string | undefined,
    atMs: number,
  ): Promise<readonly TenantAccessEntry[]>
}

export function createDatasetLicenseApi(dependencies: DatasetLicenseDependencies) {
  const app = new Hono<AuthorizationEnv>()

  app.use('*', attachAuthContext(dependencies.authContextResolver))

  app.get(
    '/platform/datasets/:datasetId/license',
    requirePermission('datasets.read'),
    async (c) => {
      const license = await dependencies
        .datasetLicense()
        .resolveLicense(c.req.param('datasetId'))
      if (license === null) return c.json({ error: 'dataset_not_found' }, 404)
      return c.json({ license })
    },
  )

  app.put(
    '/platform/datasets/:datasetId/license',
    requirePermission('datasets.export'),
    async (c) => {
      const parsed = licenseSchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) return c.json({ error: 'invalid_dataset_license' }, 400)
      const license = await dependencies
        .datasetLicense()
        .upsertLicense(c.req.param('datasetId'), parsed.data)
      return c.json({ license })
    },
  )

  app.get(
    '/platform/datasets/:datasetId/exports',
    requirePermission('datasets.read'),
    async (c) => {
      const exports = await dependencies
        .datasetLicense()
        .listExports(c.req.param('datasetId'))
      return c.json({ exports })
    },
  )

  app.post(
    '/platform/datasets/:datasetId/exports',
    requirePermission('datasets.export'),
    async (c) => {
      const parsed = createExportSchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) return c.json({ error: 'invalid_dataset_export' }, 400)
      const auth = c.get('authContext')
      const result = await dependencies.datasetLicense().createExport(
        {
          id: parsed.data.id,
          datasetId: c.req.param('datasetId'),
          datasetVersionId: parsed.data.datasetVersionId,
          format: parsed.data.format,
          recordCount: parsed.data.recordCount,
          reason: parsed.data.reason,
          requestedBy: auth.userId,
        },
        { scope: 'platform', atMs: dependencies.now() },
      )
      if (result.outcome === 'rejected') {
        // The refusal reason is exposed so callers can act deterministically.
        return c.json(
          { error: 'export_not_allowed', reason: result.evaluation.outcome },
          409,
        )
      }
      return c.json({ export: result.draft }, 201)
    },
  )

  app.post(
    '/platform/tenants/:companyId/datasets/:datasetId/exports',
    requirePermission('datasets.export'),
    async (c) => {
      const parsed = tenantExportSchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) return c.json({ error: 'invalid_dataset_export' }, 400)
      const auth = c.get('authContext')
      const result = await dependencies.datasetLicense().createExport(
        {
          id: parsed.data.id,
          datasetId: c.req.param('datasetId'),
          datasetVersionId: parsed.data.datasetVersionId,
          format: parsed.data.format,
          recordCount: parsed.data.recordCount,
          reason: parsed.data.reason,
          requestedBy: auth.userId,
        },
        {
          scope: 'tenant',
          companyId: c.req.param('companyId'),
          workspaceId: parsed.data.workspaceId,
          atMs: dependencies.now(),
        },
      )
      if (result.outcome === 'rejected') {
        return c.json(
          { error: 'export_not_allowed', reason: result.evaluation.outcome },
          409,
        )
      }
      return c.json({ export: result.draft }, 201)
    },
  )

  app.post(
    '/platform/datasets/:datasetId/exports/:exportId/complete',
    requirePermission('datasets.export'),
    async (c) => {
      const result = await dependencies
        .datasetLicense()
        .decideExport(c.req.param('exportId'), 'completed')
      if (result === null) return c.json({ error: 'dataset_export_not_found' }, 404)
      if (result.outcome === 'refused') {
        return c.json({ error: 'export_already_decided' }, 409)
      }
      return c.json({ export: result.export })
    },
  )

  app.post(
    '/platform/datasets/:datasetId/exports/:exportId/reject',
    requirePermission('datasets.export'),
    async (c) => {
      const parsed = rejectExportSchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) return c.json({ error: 'invalid_export_rejection' }, 400)
      const result = await dependencies
        .datasetLicense()
        .decideExport(c.req.param('exportId'), 'rejected', parsed.data.reason)
      if (result === null) return c.json({ error: 'dataset_export_not_found' }, 404)
      if (result.outcome === 'refused') {
        return c.json({ error: 'export_already_decided' }, 409)
      }
      return c.json({ export: result.export })
    },
  )

  app.get(
    '/platform/tenants/:companyId/datasets/access',
    requirePermission('datasets.read'),
    async (c) => {
      const workspaceId = c.req.query('workspaceId')
      const entries = await dependencies
        .datasetLicense()
        .resolveTenantAccess(
          c.req.param('companyId'),
          workspaceId === undefined || workspaceId === '' ? undefined : workspaceId,
          dependencies.now(),
        )
      return c.json({ access: entries })
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
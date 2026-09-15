import type {
  AssignmentMode,
  CompanyId,
  Dataset,
  DatasetAssignment,
  DatasetSourceType,
  DatasetType,
  DatasetVersion,
  WorkspaceId,
} from '@fieldrep/domain'
import { resolveAssignmentState } from '@fieldrep/domain'
import { Hono } from 'hono'
import { z } from 'zod'

import {
  attachAuthContext,
  requirePermission,
  type AuthContextResolver,
  type AuthorizationEnv,
} from '../middleware/authorization'

/**
 * Dataset catalog API (P11-A1).
 *
 * Permission-scoped per PERMISSION-MATRIX §11 (dataset management is a distinct
 * privileged domain):
 *  - catalog reads       → `datasets.read`
 *  - dataset creation    → `datasets.import`
 *  - version creation    → `datasets.version`
 *  - publication         → `datasets.build`
 *  - assignments         → `datasets.assign`
 *  - revocation          → `datasets.revoke`
 */

const datasetTypeSchema = z.enum(['practitioners', 'pharmacies', 'hospitals', 'clinics', 'mixed'])
const sourceTypeSchema = z.enum(['import', 'purchase', 'curated', 'internal', 'partner'])

const createDatasetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  datasetType: datasetTypeSchema,
  sourceType: sourceTypeSchema,
  ownerType: z.enum(['platform', 'company', 'workspace']).optional(),
  ownerId: z.string().min(1).optional(),
})

const createVersionSchema = z.object({
  id: z.string().min(1),
  versionLabel: z.string().min(1),
  recordCount: z.number().int().min(0),
  sourceImportId: z.string().min(1).optional(),
})

const createAssignmentSchema = z.object({
  id: z.string().min(1),
  recipientCompanyId: z.string().min(1),
  mode: z.enum(['snapshot', 'live']),
  datasetVersionId: z.string().min(1).optional(),
  recipientWorkspaceId: z.string().min(1).optional(),
  validFrom: z.number().int().min(0).optional(),
  validUntil: z.number().int().min(0).optional(),
})

export interface DatasetCatalogDependencies {
  authContextResolver: AuthContextResolver
  datasetCatalog(): DatasetCatalogGateway
  now(): number
}

export interface DatasetCatalogGateway {
  listDatasets(): Promise<readonly Dataset[]>
  getDataset(id: string): Promise<Dataset | null>
  createDataset(input: {
    id: string
    name: string
    datasetType: DatasetType
    sourceType: DatasetSourceType
    ownerType?: Dataset['ownerType'] | undefined
    ownerId?: string | undefined
  }): Promise<Dataset>
  listVersions(datasetId: string): Promise<readonly DatasetVersion[]>
  createVersion(input: {
    id: string
    datasetId: string
    versionLabel: string
    recordCount: number
    createdBy?: string | undefined
    sourceImportId?: string | undefined
  }): Promise<DatasetVersion>
  publishVersion(
    versionId: string,
  ): Promise<{ version: DatasetVersion; outcome: 'published' | 'rejected' } | null>
  listAssignments(datasetId: string): Promise<readonly DatasetAssignment[]>
  createAssignment(input: {
    id: string
    datasetId: string
    recipientCompanyId: CompanyId
    mode: AssignmentMode
    datasetVersionId?: string | undefined
    recipientWorkspaceId?: WorkspaceId | undefined
    validFrom?: number | undefined
    validUntil?: number | undefined
  }): Promise<{ assignment: DatasetAssignment; outcome: 'created' | 'revoked' | 'rejected' }>
  revokeAssignment(
    id: string,
  ): Promise<{ assignment: DatasetAssignment; outcome: 'created' | 'revoked' | 'rejected' } | null>
}

export function createDatasetCatalogApi(dependencies: DatasetCatalogDependencies) {
  const app = new Hono<AuthorizationEnv>()

  app.use('*', attachAuthContext(dependencies.authContextResolver))

  app.get('/platform/datasets', requirePermission('datasets.read'), async (c) => {
    const datasets = await dependencies.datasetCatalog().listDatasets()
    return c.json({ datasets })
  })

  app.post('/platform/datasets', requirePermission('datasets.import'), async (c) => {
    const parsed = createDatasetSchema.safeParse(await readJson(c.req.raw))
    if (!parsed.success) return c.json({ error: 'invalid_dataset' }, 400)
    const dataset = await dependencies.datasetCatalog().createDataset(parsed.data)
    return c.json({ dataset }, 201)
  })

  app.get('/platform/datasets/:datasetId', requirePermission('datasets.read'), async (c) => {
    const gateway = dependencies.datasetCatalog()
    const dataset = await gateway.getDataset(c.req.param('datasetId'))
    if (dataset === null) return c.json({ error: 'dataset_not_found' }, 404)
    const versions = await gateway.listVersions(dataset.id)
    return c.json({ dataset, versions })
  })

  app.get(
    '/platform/datasets/:datasetId/versions',
    requirePermission('datasets.read'),
    async (c) => {
      const versions = await dependencies
        .datasetCatalog()
        .listVersions(c.req.param('datasetId'))
      return c.json({ versions })
    },
  )

  app.post(
    '/platform/datasets/:datasetId/versions',
    requirePermission('datasets.version'),
    async (c) => {
      const parsed = createVersionSchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) return c.json({ error: 'invalid_dataset_version' }, 400)
      const auth = c.get('authContext')
      const version = await dependencies.datasetCatalog().createVersion({
        id: parsed.data.id,
        datasetId: c.req.param('datasetId'),
        versionLabel: parsed.data.versionLabel,
        recordCount: parsed.data.recordCount,
        createdBy: auth.userId,
        sourceImportId: parsed.data.sourceImportId,
      })
      return c.json({ version }, 201)
    },
  )

  app.post(
    '/platform/datasets/:datasetId/versions/:versionId/publish',
    requirePermission('datasets.build'),
    async (c) => {
      const result = await dependencies
        .datasetCatalog()
        .publishVersion(c.req.param('versionId'))
      if (result === null) return c.json({ error: 'dataset_version_not_found' }, 404)
      if (result.outcome === 'rejected') {
        return c.json({ error: 'publication_not_allowed' }, 409)
      }
      return c.json({ version: result.version })
    },
  )

  app.get(
    '/platform/datasets/:datasetId/assignments',
    requirePermission('datasets.read'),
    async (c) => {
      const assignments = await dependencies
        .datasetCatalog()
        .listAssignments(c.req.param('datasetId'))
      return c.json({
        assignments: assignments.map((assignment) => ({
          ...assignment,
          effectiveState: resolveAssignmentState(assignment, dependencies.now()),
        })),
      })
    },
  )

  app.post(
    '/platform/datasets/:datasetId/assignments',
    requirePermission('datasets.assign'),
    async (c) => {
      const parsed = createAssignmentSchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) return c.json({ error: 'invalid_dataset_assignment' }, 400)
      const result = await dependencies.datasetCatalog().createAssignment({
        ...parsed.data,
        datasetId: c.req.param('datasetId'),
      })
      if (result.outcome === 'rejected') {
        return c.json({ error: 'assignment_not_allowed' }, 409)
      }
      return c.json({ assignment: result.assignment }, 201)
    },
  )

  app.post(
    '/platform/datasets/:datasetId/assignments/:assignmentId/revoke',
    requirePermission('datasets.revoke'),
    async (c) => {
      const result = await dependencies
        .datasetCatalog()
        .revokeAssignment(c.req.param('assignmentId'))
      if (result === null) return c.json({ error: 'assignment_not_found' }, 404)
      if (result.outcome === 'rejected') {
        return c.json({ error: 'assignment_already_revoked' }, 409)
      }
      return c.json({ assignment: result.assignment })
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
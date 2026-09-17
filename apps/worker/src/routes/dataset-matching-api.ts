import type {
  DatasetBuild,
  PractitionerMatchStatus,
  PractitionerSourceRecord,
} from '@fieldrep/domain'
import { isRecordableBuildDefinition } from '@fieldrep/domain'
import { Hono } from 'hono'
import { z } from 'zod'

import {
  attachAuthContext,
  requirePermission,
  type AuthContextResolver,
  type AuthorizationEnv,
} from '../middleware/authorization'

/**
 * Practitioner matching & dataset build API (P11-A3).
 *
 * Permission-scoped per PERMISSION-MATRIX §11:
 *  - record/lineage reads       → `datasets.read`
 *  - source-record registration + review decisions (link / confirm-unmatched)
 *                               → `datasets.deduplicate`
 *  - build creation             → `datasets.build`
 */

const registerRecordsSchema = z.object({
  records: z
    .array(
      z.object({
        id: z.string().min(1),
        sourceRecordRef: z.string().min(1),
        matchKey: z.string().min(1).nullable().optional(),
        fullName: z.string().min(1).nullable().optional(),
        nationalId: z.string().min(1).nullable().optional(),
        phone: z.string().min(1).nullable().optional(),
        licenseId: z.string().min(1).nullable().optional(),
      }),
    )
    .min(1),
})

const linkMatchSchema = z.object({
  practitionerId: z.string().min(1),
})

const createBuildSchema = z.object({
  id: z.string().min(1),
  targetDatasetId: z.string().min(1),
  targetVersionId: z.string().min(1),
  definition: z.object({ specialtyIds: z.array(z.string().min(1)).optional() }),
  recordCount: z.number().int().min(0),
})

export interface DatasetMatchingDependencies {
  authContextResolver: AuthContextResolver
  datasetMatching(): DatasetMatchingGateway
  now(): number
}

export interface DatasetMatchingGateway {
  listRecords(
    versionId: string,
    status?: PractitionerMatchStatus | undefined,
  ): Promise<readonly PractitionerSourceRecord[]>
  registerRecord(input: {
    id: string
    datasetId: string
    datasetVersionId: string
    sourceRecordRef: string
    matchKey?: string | null | undefined
    fullName?: string | null | undefined
    nationalId?: string | null | undefined
    phone?: string | null | undefined
    licenseId?: string | null | undefined
  }): Promise<PractitionerSourceRecord>
  linkMatch(input: {
    id: string
    practitionerId: string
    decidedBy: string
  }): Promise<{ record: PractitionerSourceRecord; outcome: 'linked' | 'rejected' } | null>
  confirmUnmatched(
    id: string,
    decidedBy: string,
  ): Promise<{ record: PractitionerSourceRecord; outcome: 'linked' | 'rejected' } | null>
  listBuilds(sourceVersionId: string): Promise<readonly DatasetBuild[]>
  /**
   * Creates the build lineage; the wiring resolves the live source version
   * snapshot and re-validates readiness before writing.
   */
  createBuild(input: {
    id: string
    sourceDatasetId: string
    sourceVersionId: string
    targetDatasetId: string
    targetVersionId: string
    definition: { specialtyIds?: string[] | undefined }
    recordCount: number
    createdBy?: string | undefined
  }): Promise<{ build: DatasetBuild; outcome: 'created' | 'rejected' }>
}

export function createDatasetMatchingApi(dependencies: DatasetMatchingDependencies) {
  const app = new Hono<AuthorizationEnv>()

  app.use('*', attachAuthContext(dependencies.authContextResolver))

  app.get(
    '/platform/datasets/:datasetId/versions/:versionId/match-records',
    requirePermission('datasets.read'),
    async (c) => {
      const statusParam = c.req.query('status')
      const status = isMatchStatusParam(statusParam) ? statusParam : undefined
      const records = await dependencies
        .datasetMatching()
        .listRecords(c.req.param('versionId'), status)
      return c.json({ records })
    },
  )

  app.post(
    '/platform/datasets/:datasetId/versions/:versionId/match-records',
    requirePermission('datasets.deduplicate'),
    async (c) => {
      const parsed = registerRecordsSchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) return c.json({ error: 'invalid_match_records' }, 400)
      const gateway = dependencies.datasetMatching()
      const datasetId = c.req.param('datasetId')
      const versionId = c.req.param('versionId')
      const records = await Promise.all(
        parsed.data.records.map((record) =>
          gateway.registerRecord({ ...record, datasetId, datasetVersionId: versionId }),
        ),
      )
      return c.json({ records }, 201)
    },
  )

  app.post(
    '/platform/datasets/:datasetId/match-records/:recordId/link',
    requirePermission('datasets.deduplicate'),
    async (c) => {
      const parsed = linkMatchSchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) return c.json({ error: 'invalid_match_link' }, 400)
      const auth = c.get('authContext')
      const result = await dependencies.datasetMatching().linkMatch({
        id: c.req.param('recordId'),
        practitionerId: parsed.data.practitionerId,
        decidedBy: auth.userId,
      })
      if (result === null) return c.json({ error: 'match_record_not_found' }, 404)
      if (result.outcome === 'rejected') {
        return c.json({ error: 'match_link_not_allowed' }, 409)
      }
      return c.json({ record: result.record })
    },
  )

  app.post(
    '/platform/datasets/:datasetId/match-records/:recordId/confirm-unmatched',
    requirePermission('datasets.deduplicate'),
    async (c) => {
      const auth = c.get('authContext')
      const result = await dependencies
        .datasetMatching()
        .confirmUnmatched(c.req.param('recordId'), auth.userId)
      if (result === null) return c.json({ error: 'match_record_not_found' }, 404)
      if (result.outcome === 'rejected') {
        return c.json({ error: 'match_decision_not_allowed' }, 409)
      }
      return c.json({ record: result.record })
    },
  )

  app.get(
    '/platform/datasets/:datasetId/versions/:versionId/builds',
    requirePermission('datasets.read'),
    async (c) => {
      const builds = await dependencies
        .datasetMatching()
        .listBuilds(c.req.param('versionId'))
      return c.json({ builds })
    },
  )

  app.post(
    '/platform/datasets/:datasetId/versions/:versionId/builds',
    requirePermission('datasets.build'),
    async (c) => {
      const parsed = createBuildSchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) return c.json({ error: 'invalid_dataset_build' }, 400)
      // Boundary re-check: a definition that selects nothing must never reach
      // the lineage ledger.
      if (!isRecordableBuildDefinition(parsed.data.definition)) {
        return c.json({ error: 'invalid_dataset_build' }, 400)
      }
      const auth = c.get('authContext')
      const result = await dependencies.datasetMatching().createBuild({
        id: parsed.data.id,
        sourceDatasetId: c.req.param('datasetId'),
        sourceVersionId: c.req.param('versionId'),
        targetDatasetId: parsed.data.targetDatasetId,
        targetVersionId: parsed.data.targetVersionId,
        definition: parsed.data.definition,
        recordCount: parsed.data.recordCount,
        createdBy: auth.userId,
      })
      if (result.outcome === 'rejected') {
        return c.json({ error: 'build_not_allowed' }, 409)
      }
      return c.json({ build: result.build }, 201)
    },
  )

  return app
}

function isMatchStatusParam(
  value: string | undefined,
): value is PractitionerMatchStatus {
  return (
    value === 'unmatched' ||
    value === 'candidate' ||
    value === 'matched' ||
    value === 'confirmed_unmatched'
  )
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}
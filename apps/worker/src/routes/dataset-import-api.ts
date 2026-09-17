import type {
  DatasetImport,
  DuplicateReviewCandidate,
  DuplicateReviewDecision,
  DuplicateReviewStatus,
  ImportQualityPolicy,
  NormalizationCounts,
} from '@fieldrep/domain'
import { validateNormalizationCounts } from '@fieldrep/domain'
import { Hono } from 'hono'
import { z } from 'zod'

import {
  attachAuthContext,
  requirePermission,
  type AuthContextResolver,
  type AuthorizationEnv,
} from '../middleware/authorization'

/**
 * Dataset import & normalization API (P11-A2).
 *
 * Permission-scoped per PERMISSION-MATRIX §11:
 *  - import ledger reads        → `datasets.read`
 *  - import registration/retry  → `datasets.import`
 *  - normalization completion   → `datasets.normalize`
 *  - duplicate review writes    → `datasets.deduplicate`
 */

const createImportSchema = z.object({
  id: z.string().min(1),
  originalFilename: z.string().min(1),
  sourceFileReference: z.string().min(1).optional(),
  manifest: z.record(z.string(), z.unknown()).optional(),
})

const normalizeSchema = z.object({
  rowCount: z.number().int().min(0),
  validCount: z.number().int().min(0),
  invalidCount: z.number().int().min(0),
  minValidRatio: z.number().min(0).max(1).optional(),
})

const recordCandidateSchema = z.object({
  id: z.string().min(1),
  importId: z.string().min(1),
  matchKey: z.string().min(1),
  recordRefs: z.array(z.string().min(1)).min(2),
})

const candidateDecisionSchema = z.object({
  decision: z.enum(['merged', 'kept_both', 'discarded']),
})

export interface DatasetImportDependencies {
  authContextResolver: AuthContextResolver
  datasetImport(): DatasetImportGateway
  now(): number
}

export interface DatasetImportGateway {
  listImports(datasetId: string): Promise<readonly DatasetImport[]>
  createImport(input: {
    id: string
    datasetId: string
    originalFilename: string
    sourceFileReference?: string | undefined
    importedBy?: string | undefined
    manifest?: Record<string, unknown> | undefined
  }): Promise<DatasetImport>
  completeNormalization(
    id: string,
    counts: NormalizationCounts,
    policy?: Partial<ImportQualityPolicy> | undefined,
  ): Promise<
    | { datasetImport: DatasetImport; outcome: 'normalized' | 'failed' | 'rejected' | 'reopened' }
    | null
  >
  retryImport(
    id: string,
  ): Promise<
    | { datasetImport: DatasetImport; outcome: 'normalized' | 'failed' | 'rejected' | 'reopened' }
    | null
  >
  listCandidates(
    datasetId: string,
    status?: DuplicateReviewStatus | undefined,
  ): Promise<readonly DuplicateReviewCandidate[]>
  recordCandidate(input: {
    id: string
    datasetId: string
    importId: string
    matchKey: string
    recordRefs: readonly string[]
  }): Promise<{ candidate: DuplicateReviewCandidate; outcome: 'recorded' | 'decided' | 'rejected' }>
  decideCandidate(input: {
    id: string
    decision: DuplicateReviewDecision
    decidedBy: string
  }): Promise<
    | { candidate: DuplicateReviewCandidate; outcome: 'recorded' | 'decided' | 'rejected' }
    | null
  >
}

export function createDatasetImportApi(dependencies: DatasetImportDependencies) {
  const app = new Hono<AuthorizationEnv>()

  app.use('*', attachAuthContext(dependencies.authContextResolver))

  app.get(
    '/platform/datasets/:datasetId/imports',
    requirePermission('datasets.read'),
    async (c) => {
      const imports = await dependencies
        .datasetImport()
        .listImports(c.req.param('datasetId'))
      return c.json({ imports })
    },
  )

  app.post(
    '/platform/datasets/:datasetId/imports',
    requirePermission('datasets.import'),
    async (c) => {
      const parsed = createImportSchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) return c.json({ error: 'invalid_import' }, 400)
      const auth = c.get('authContext')
      const datasetImport = await dependencies.datasetImport().createImport({
        id: parsed.data.id,
        datasetId: c.req.param('datasetId'),
        originalFilename: parsed.data.originalFilename,
        sourceFileReference: parsed.data.sourceFileReference,
        importedBy: auth.userId,
        manifest: parsed.data.manifest,
      })
      return c.json({ import: datasetImport }, 201)
    },
  )

  app.post(
    '/platform/datasets/:datasetId/imports/:importId/normalize',
    requirePermission('datasets.normalize'),
    async (c) => {
      const parsed = normalizeSchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) return c.json({ error: 'invalid_normalization_counts' }, 400)
      const { rowCount, validCount, invalidCount, minValidRatio } = parsed.data
      const counts = { rowCount, validCount, invalidCount }
      // Boundary re-check of the partition invariant — invalid counts must
      // never reach the ledger, even through a well-typed payload.
      if (validateNormalizationCounts(counts) !== 'ok') {
        return c.json({ error: 'invalid_normalization_counts' }, 400)
      }
      const result = await dependencies
        .datasetImport()
        .completeNormalization(
          c.req.param('importId'),
          counts,
          minValidRatio === undefined ? undefined : { minValidRatio },
        )
      if (result === null) return c.json({ error: 'import_not_found' }, 404)
      if (result.outcome === 'rejected') {
        return c.json({ error: 'normalization_not_allowed' }, 409)
      }
      return c.json({ import: result.datasetImport, outcome: result.outcome })
    },
  )

  app.post(
    '/platform/datasets/:datasetId/imports/:importId/retry',
    requirePermission('datasets.normalize'),
    async (c) => {
      const result = await dependencies
        .datasetImport()
        .retryImport(c.req.param('importId'))
      if (result === null) return c.json({ error: 'import_not_found' }, 404)
      if (result.outcome === 'rejected') {
        return c.json({ error: 'retry_not_allowed' }, 409)
      }
      return c.json({ import: result.datasetImport })
    },
  )

  app.get(
    '/platform/datasets/:datasetId/duplicates',
    requirePermission('datasets.read'),
    async (c) => {
      const statusParam = c.req.query('status')
      const status =
        statusParam === 'pending' ||
        statusParam === 'merged' ||
        statusParam === 'kept_both' ||
        statusParam === 'discarded'
          ? statusParam
          : undefined
      const candidates = await dependencies
        .datasetImport()
        .listCandidates(c.req.param('datasetId'), status)
      return c.json({ candidates })
    },
  )

  app.post(
    '/platform/datasets/:datasetId/duplicates',
    requirePermission('datasets.deduplicate'),
    async (c) => {
      const parsed = recordCandidateSchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) return c.json({ error: 'invalid_duplicate_candidate' }, 400)
      const result = await dependencies.datasetImport().recordCandidate({
        ...parsed.data,
        datasetId: c.req.param('datasetId'),
      })
      if (result.outcome === 'rejected') {
        return c.json({ error: 'invalid_duplicate_candidate' }, 409)
      }
      return c.json({ candidate: result.candidate }, 201)
    },
  )

  app.post(
    '/platform/datasets/:datasetId/duplicates/:candidateId/decision',
    requirePermission('datasets.deduplicate'),
    async (c) => {
      const parsed = candidateDecisionSchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) return c.json({ error: 'invalid_duplicate_decision' }, 400)
      const auth = c.get('authContext')
      const result = await dependencies.datasetImport().decideCandidate({
        id: c.req.param('candidateId'),
        decision: parsed.data.decision,
        decidedBy: auth.userId,
      })
      if (result === null) return c.json({ error: 'candidate_not_found' }, 404)
      if (result.outcome === 'rejected') {
        return c.json({ error: 'candidate_already_decided' }, 409)
      }
      return c.json({ candidate: result.candidate })
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
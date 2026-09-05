import type {
  CustomerId,
  CustomerVisitCounters,
  LocationId,
  PlanEntryId,
  ProductSummary,
  UserId,
  VisitActual,
  VisitId,
  VisitProductCall,
  WorkspaceId,
} from '@fieldrep/domain'
import { Hono, type Context } from 'hono'
import { z } from 'zod'

import {
  attachAuthContext,
  requireWorkspacePermission,
  type AuthContextResolver,
  type AuthorizationEnv,
} from '../middleware/authorization'

export interface CreateVisitInput {
  id: VisitId
  ownerUserId: UserId
  customerId: CustomerId
  planEntryId?: PlanEntryId
  visitDate: string
  occurredAt: number
  notes?: string
  locationId?: LocationId
  productCalls: readonly VisitProductCall[]
}

export interface VisitApiRepository {
  listProducts(): Promise<ProductSummary[]>
  listVisits(ownerUserId: UserId, fromDate: string, toDate: string): Promise<VisitActual[]>
  createCompletedVisit(input: CreateVisitInput): Promise<VisitActual>
  cancelVisit(ownerUserId: UserId, visitId: VisitId): Promise<boolean>
  getCustomerCounters(
    ownerUserId: UserId,
    customerId: CustomerId,
    fromDate: string,
    toDate: string,
  ): Promise<CustomerVisitCounters>
}

export interface VisitApiDependencies {
  authContextResolver: AuthContextResolver
  repositoryForWorkspace(workspaceId: WorkspaceId): Promise<VisitApiRepository>
}

const canonicalDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine(isCanonicalDate)

const visitRangeSchema = z.object({
  from: canonicalDateSchema,
  to: canonicalDateSchema,
})

const productCallSchema = z.object({
  productId: z.string().min(1),
  callCount: z.number().int().min(1).max(100),
})

const createVisitSchema = z.object({
  id: z.string().min(1),
  customerId: z.string().min(1),
  planEntryId: z.string().min(1).optional(),
  visitDate: canonicalDateSchema,
  occurredAt: z.number().int().positive(),
  notes: z.string().trim().max(5000).optional(),
  locationId: z.string().min(1).optional(),
  productCalls: z.array(productCallSchema).max(20).default([]),
})

export function createVisitApi(dependencies: VisitApiDependencies) {
  const app = new Hono<AuthorizationEnv>()

  app.use('/workspaces/*', attachAuthContext(dependencies.authContextResolver))

  app.get(
    '/workspaces/:workspaceId/visit-products',
    requireWorkspacePermission('visits.create.own'),
    async (c) => {
      const repository = await dependencies.repositoryForWorkspace(c.req.param('workspaceId'))
      return c.json({ products: await repository.listProducts() })
    },
  )

  app.get(
    '/workspaces/:workspaceId/visit-counters/:customerId',
    requireWorkspacePermission('visits.read.own'),
    async (c) => {
      const parsed = visitRangeSchema.safeParse(c.req.query())
      if (!parsed.success || parsed.data.from > parsed.data.to) {
        return c.json({ error: 'invalid_visit_range' }, 400)
      }

      const authContext = c.get('authContext')
      const repository = await dependencies.repositoryForWorkspace(c.req.param('workspaceId'))
      const counters = await repository.getCustomerCounters(
        authContext.userId,
        c.req.param('customerId'),
        parsed.data.from,
        parsed.data.to,
      )
      return c.json({ counters })
    },
  )

  app.get(
    '/workspaces/:workspaceId/visits',
    requireWorkspacePermission('visits.read.own'),
    async (c) => {
      const parsed = visitRangeSchema.safeParse(c.req.query())
      if (!parsed.success || parsed.data.from > parsed.data.to) {
        return c.json({ error: 'invalid_visit_range' }, 400)
      }

      const authContext = c.get('authContext')
      const repository = await dependencies.repositoryForWorkspace(c.req.param('workspaceId'))
      const visits = await repository.listVisits(
        authContext.userId,
        parsed.data.from,
        parsed.data.to,
      )
      return c.json({ visits })
    },
  )

  app.post(
    '/workspaces/:workspaceId/visits',
    requireWorkspacePermission('visits.create.own'),
    async (c) => {
      const parsed = createVisitSchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) return c.json({ error: 'invalid_visit_report' }, 400)

      const authContext = c.get('authContext')
      const repository = await dependencies.repositoryForWorkspace(c.req.param('workspaceId'))
      const input: CreateVisitInput = {
        id: parsed.data.id,
        ownerUserId: authContext.userId,
        customerId: parsed.data.customerId,
        visitDate: parsed.data.visitDate,
        occurredAt: parsed.data.occurredAt,
        productCalls: parsed.data.productCalls,
      }
      if (parsed.data.planEntryId !== undefined) input.planEntryId = parsed.data.planEntryId
      if (parsed.data.notes !== undefined && parsed.data.notes !== '') input.notes = parsed.data.notes
      if (parsed.data.locationId !== undefined) input.locationId = parsed.data.locationId

      try {
        const visit = await repository.createCompletedVisit(input)
        return c.json({ visit }, 201)
      } catch (error) {
        return visitWriteError(c, error)
      }
    },
  )

  app.post(
    '/workspaces/:workspaceId/visits/:visitId/cancel',
    requireWorkspacePermission('visits.update.own'),
    async (c) => {
      const authContext = c.get('authContext')
      const repository = await dependencies.repositoryForWorkspace(c.req.param('workspaceId'))
      const cancelled = await repository.cancelVisit(authContext.userId, c.req.param('visitId'))
      if (!cancelled) return c.json({ error: 'visit_not_found' }, 404)
      return c.body(null, 204)
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

function isCanonicalDate(value: string): boolean {
  const parsed = Date.parse(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed) && new Date(parsed).toISOString().slice(0, 10) === value
}

function visitWriteError(c: Context<AuthorizationEnv>, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)

  if (message.includes('visit_customer_scope_mismatch')) {
    return c.json({ error: 'customer_not_found' }, 404)
  }
  if (message.includes('visit_plan_scope_mismatch')) {
    return c.json({ error: 'invalid_plan_link' }, 422)
  }
  if (message.includes('visit_location_scope_mismatch')) {
    return c.json({ error: 'invalid_location' }, 422)
  }
  if (message.includes('visit_product_scope_mismatch')) {
    return c.json({ error: 'invalid_product' }, 422)
  }
  if (message.includes('invalid_product_call_count')) {
    return c.json({ error: 'invalid_product_call_count' }, 400)
  }
  if (
    message.includes('visits_plan_entry_active_unique_idx') ||
    message.includes('UNIQUE constraint failed: visits.plan_entry_id')
  ) {
    return c.json({ error: 'plan_already_completed' }, 409)
  }

  throw error
}

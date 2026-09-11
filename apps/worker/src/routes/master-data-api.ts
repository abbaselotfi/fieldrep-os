import type {
  CustomerType,
  WorkspaceId,
} from '@fieldrep/domain'
import { Hono } from 'hono'
import { z } from 'zod'

import {
  attachAuthContext,
  requireWorkspacePermission,
  type AuthContextResolver,
  type AuthorizationEnv,
} from '../middleware/authorization'

/**
 * Master-data administration API (P9-A3).
 *
 * Permission-scoped per PERMISSION-MATRIX §8: routes/products/customers
 * each require their `*.manage.workspace` permission. Every write re-validates
 * through the narrow gateway; archive is a soft-delete so historical
 * plans/visits keep their FK references.
 */

const entityId = z.string().min(1)

const createRouteSchema = z.object({
  id: entityId,
  code: z.string().min(1).nullable().optional(),
  name: z.string().min(1),
})

const createProductSchema = z.object({
  id: entityId,
  code: z.string().min(1).nullable().optional(),
  name: z.string().min(1),
  sortOrder: z.number().int().min(0).default(0),
})

const createCustomerSchema = z.object({
  id: entityId,
  type: z.enum(['doctor', 'pharmacy', 'hospital', 'clinic', 'laboratory', 'other']),
  displayName: z.string().min(1),
  doctorProfile: z
    .object({
      specialty: z.string().nullable().optional(),
      classKey: z.string().nullable().optional(),
      requiredFrequency: z.number().int().min(0),
    })
    .optional(),
})

export interface MasterDataDependencies {
  authContextResolver: AuthContextResolver
  masterDataForWorkspace(workspaceId: WorkspaceId): Promise<MasterDataGateway>
}

/**
 * Narrow gateway (test-friendly, small surface).
 */
export interface MasterDataGateway {
  listRoutes(): Promise<readonly { id: string; code: string | null; name: string; status: string }[]>
  upsertRoute(input: { id: string; code: string | null; name: string }, actorUserId: string): Promise<void>
  archiveRoute(id: string, actorUserId: string): Promise<boolean>
  listProducts(): Promise<readonly { id: string; code: string | null; name: string; sortOrder: number; status: string }[]>
  upsertProduct(input: { id: string; code: string | null; name: string; sortOrder: number }, actorUserId: string): Promise<void>
  archiveProduct(id: string, actorUserId: string): Promise<boolean>
  listCustomers(): Promise<readonly { id: string; type: string; displayName: string; status: string }[]>
  upsertCustomer(input: { id: string; type: CustomerType; displayName: string; doctorProfile?: { specialty?: string | null | undefined; classKey?: string | null | undefined; requiredFrequency: number } }, actorUserId: string): Promise<void>
  archiveCustomer(id: string, actorUserId: string): Promise<boolean>
}

export function createMasterDataApi(dependencies: MasterDataDependencies) {
  const app = new Hono<AuthorizationEnv>()

  app.use('/workspaces/*', attachAuthContext(dependencies.authContextResolver))

  app.get(
    '/workspaces/:workspaceId/master-data/routes',
    requireWorkspacePermission('routes.manage.workspace'),
    async (c) => {
      const gateway = await dependencies.masterDataForWorkspace(c.req.param('workspaceId'))
      const routes = await gateway.listRoutes()
      return c.json({ routes })
    },
  )

  app.post(
    '/workspaces/:workspaceId/master-data/routes',
    requireWorkspacePermission('routes.manage.workspace'),
    async (c) => {
      const parsed = createRouteSchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) {
        return c.json({ error: 'invalid_route' }, 400)
      }
      const authContext = c.get('authContext')
      const gateway = await dependencies.masterDataForWorkspace(c.req.param('workspaceId'))
      await gateway.upsertRoute({ id: parsed.data.id, code: parsed.data.code ?? null, name: parsed.data.name }, authContext.userId)
      return c.body(null, 204)
    },
  )

  app.delete(
    '/workspaces/:workspaceId/master-data/routes/:routeId',
    requireWorkspacePermission('routes.manage.workspace'),
    async (c) => {
      const authContext = c.get('authContext')
      const gateway = await dependencies.masterDataForWorkspace(c.req.param('workspaceId'))
      const archived = await gateway.archiveRoute(c.req.param('routeId'), authContext.userId)
      if (!archived) return c.json({ error: 'route_not_found' }, 404)
      return c.body(null, 204)
    },
  )

  app.get(
    '/workspaces/:workspaceId/master-data/products',
    requireWorkspacePermission('products.manage.workspace'),
    async (c) => {
      const gateway = await dependencies.masterDataForWorkspace(c.req.param('workspaceId'))
      const products = await gateway.listProducts()
      return c.json({ products })
    },
  )

  app.post(
    '/workspaces/:workspaceId/master-data/products',
    requireWorkspacePermission('products.manage.workspace'),
    async (c) => {
      const parsed = createProductSchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) {
        return c.json({ error: 'invalid_product' }, 400)
      }
      const authContext = c.get('authContext')
      const gateway = await dependencies.masterDataForWorkspace(c.req.param('workspaceId'))
      await gateway.upsertProduct(
        { id: parsed.data.id, code: parsed.data.code ?? null, name: parsed.data.name, sortOrder: parsed.data.sortOrder },
        authContext.userId,
      )
      return c.body(null, 204)
    },
  )

  app.delete(
    '/workspaces/:workspaceId/master-data/products/:productId',
    requireWorkspacePermission('products.manage.workspace'),
    async (c) => {
      const authContext = c.get('authContext')
      const gateway = await dependencies.masterDataForWorkspace(c.req.param('workspaceId'))
      const archived = await gateway.archiveProduct(c.req.param('productId'), authContext.userId)
      if (!archived) return c.json({ error: 'product_not_found' }, 404)
      return c.body(null, 204)
    },
  )

  app.get(
    '/workspaces/:workspaceId/master-data/customers',
    requireWorkspacePermission('customers.manage.workspace'),
    async (c) => {
      const gateway = await dependencies.masterDataForWorkspace(c.req.param('workspaceId'))
      const customers = await gateway.listCustomers()
      return c.json({ customers })
    },
  )

  app.post(
    '/workspaces/:workspaceId/master-data/customers',
    requireWorkspacePermission('customers.manage.workspace'),
    async (c) => {
      const parsed = createCustomerSchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) {
        return c.json({ error: 'invalid_customer' }, 400)
      }
      const authContext = c.get('authContext')
      const gateway = await dependencies.masterDataForWorkspace(c.req.param('workspaceId'))
      const customerInput: { id: string; type: CustomerType; displayName: string; doctorProfile?: { specialty?: string | null | undefined; classKey?: string | null | undefined; requiredFrequency: number } } = {
        id: parsed.data.id,
        type: parsed.data.type,
        displayName: parsed.data.displayName,
      }
      if (parsed.data.doctorProfile !== undefined) {
        customerInput.doctorProfile = parsed.data.doctorProfile
      }
      await gateway.upsertCustomer(customerInput, authContext.userId)
      return c.body(null, 204)
    },
  )

  app.delete(
    '/workspaces/:workspaceId/master-data/customers/:customerId',
    requireWorkspacePermission('customers.manage.workspace'),
    async (c) => {
      const authContext = c.get('authContext')
      const gateway = await dependencies.masterDataForWorkspace(c.req.param('workspaceId'))
      const archived = await gateway.archiveCustomer(c.req.param('customerId'), authContext.userId)
      if (!archived) return c.json({ error: 'customer_not_found' }, 404)
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

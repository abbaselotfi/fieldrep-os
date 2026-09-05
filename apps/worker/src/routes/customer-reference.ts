import type {
  CustomerDetail,
  CustomerListFilters,
  CustomerSummary,
  RouteSummary,
  WorkspaceId,
} from '@fieldrep/domain'
import { Hono } from 'hono'

import {
  attachAuthContext,
  requireWorkspacePermission,
  type AuthContextResolver,
  type AuthorizationEnv,
} from '../middleware/authorization'

export interface CustomerReferenceRepository {
  listRoutes(): Promise<RouteSummary[]>
  listCustomers(userId: string, filters?: CustomerListFilters): Promise<CustomerSummary[]>
  getCustomer(userId: string, customerId: string): Promise<CustomerDetail | null>
}

export interface CustomerReferenceApiDependencies {
  authContextResolver: AuthContextResolver
  repositoryForWorkspace(workspaceId: WorkspaceId): Promise<CustomerReferenceRepository>
}

export function createCustomerReferenceApi(dependencies: CustomerReferenceApiDependencies) {
  const app = new Hono<AuthorizationEnv>()

  app.use('/workspaces/*', attachAuthContext(dependencies.authContextResolver))

  app.get(
    '/workspaces/:workspaceId/routes',
    requireWorkspacePermission('customers.read.assigned'),
    async (c) => {
      const workspaceId = c.req.param('workspaceId')
      const repository = await dependencies.repositoryForWorkspace(workspaceId)
      const routes = await repository.listRoutes()
      return c.json({ routes })
    },
  )

  app.get(
    '/workspaces/:workspaceId/customers',
    requireWorkspacePermission('customers.read.assigned'),
    async (c) => {
      const workspaceId = c.req.param('workspaceId')
      const authContext = c.get('authContext')
      const repository = await dependencies.repositoryForWorkspace(workspaceId)
      const filters = customerFiltersFromQuery(c.req.query())
      const customers = await repository.listCustomers(authContext.userId, filters)
      return c.json({ customers })
    },
  )

  app.get(
    '/workspaces/:workspaceId/customers/:customerId',
    requireWorkspacePermission('customers.read.assigned'),
    async (c) => {
      const workspaceId = c.req.param('workspaceId')
      const authContext = c.get('authContext')
      const repository = await dependencies.repositoryForWorkspace(workspaceId)
      const customer = await repository.getCustomer(authContext.userId, c.req.param('customerId'))

      if (customer === null) {
        return c.json({ error: 'customer_not_found' }, 404)
      }

      return c.json({ customer })
    },
  )

  return app
}

function customerFiltersFromQuery(query: Record<string, string>): CustomerListFilters {
  const filters: CustomerListFilters = {}

  const search = query.search?.trim()
  if (search !== undefined && search !== '') filters.search = search

  const routeId = query.routeId?.trim()
  if (routeId !== undefined && routeId !== '') filters.routeId = routeId

  const classKey = query.classKey?.trim()
  if (classKey !== undefined && classKey !== '') filters.classKey = classKey

  const specialty = query.specialty?.trim()
  if (specialty !== undefined && specialty !== '') filters.specialty = specialty

  return filters
}

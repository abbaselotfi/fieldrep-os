import type {
  CompanyId,
  CreateCompanyInput,
  CreateWorkspaceInput,
  PlatformLimits,
  UpdateLimitsInput,
  WorkspaceId,
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
 * Platform administration API (P10-A1).
 *
 * Company/workspace lifecycle, limits, global settings. Permission-scoped per
 * PERMISSION-MATRIX §10: each endpoint requires its `companies.manage`,
 * `workspaces.manage`, etc. permission.
 */

const entityId = z.string().min(1)

const createCompanySchema = z.object({
  id: entityId,
  name: z.string().min(1),
  slug: z.string().min(1).optional(),
  legalName: z.string().min(1).nullable().optional(),
  country: z.string().min(1).nullable().optional(),
})

const createWorkspaceSchema = z.object({
  id: entityId,
  companyId: entityId,
  name: z.string().min(1),
  slug: z.string().min(1).optional(),
})

const updateLimitsSchema = z
  .object({
    maxWorkspaces: z.number().int().min(1).optional(),
    maxUsersPerWorkspace: z.number().int().min(1).optional(),
    maxStorageMb: z.number().int().min(1).optional(),
    maxImportsPerCycle: z.number().int().min(1).optional(),
  })
  .refine((value) => Object.keys(value).length > 0)

export interface PlatformAdminDependencies {
  authContextResolver: AuthContextResolver
  platformAdmin(): PlatformAdminGateway
}

export interface PlatformAdminGateway {
  listCompanies(): Promise<readonly { id: string; name: string; slug: string; status: string }[]>
  createCompany(input: CreateCompanyInput): Promise<{ id: string; name: string; slug: string; status: string }>
  listWorkspaces(companyId: CompanyId): Promise<readonly { id: string; name: string; slug: string; status: string }[]>
  createWorkspace(input: CreateWorkspaceInput): Promise<{ id: string; name: string; slug: string; status: string }>
  getLimits(companyId: CompanyId): Promise<PlatformLimits | null>
  updateLimits(companyId: CompanyId, patch: UpdateLimitsInput): Promise<boolean>
}

export function createPlatformAdminApi(dependencies: PlatformAdminDependencies) {
  const app = new Hono<AuthorizationEnv>()

  app.use('*', attachAuthContext(dependencies.authContextResolver))

  app.get(
    '/platform/companies',
    requirePermission('companies.read'),
    async (c) => {
      const companies = await dependencies.platformAdmin().listCompanies()
      return c.json({ companies })
    },
  )

  app.post(
    '/platform/companies',
    requirePermission('companies.manage'),
    async (c) => {
      const parsed = createCompanySchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) {
        return c.json({ error: 'invalid_company' }, 400)
      }
      const company = await dependencies.platformAdmin().createCompany(parsed.data)
      return c.json({ company }, 201)
    },
  )

  app.get(
    '/platform/companies/:companyId/workspaces',
    requirePermission('workspaces.read.all'),
    async (c) => {
      const workspaces = await dependencies.platformAdmin().listWorkspaces(c.req.param('companyId'))
      return c.json({ workspaces })
    },
  )

  app.post(
    '/platform/companies/:companyId/workspaces',
    requirePermission('workspaces.manage'),
    async (c) => {
      const parsed = createWorkspaceSchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) {
        return c.json({ error: 'invalid_workspace' }, 400)
      }
      const workspace = await dependencies.platformAdmin().createWorkspace(parsed.data)
      return c.json({ workspace }, 201)
    },
  )

  app.get(
    '/platform/companies/:companyId/limits',
    requirePermission('limits.read'),
    async (c) => {
      const limits = await dependencies.platformAdmin().getLimits(c.req.param('companyId'))
      if (limits === null) return c.json({ error: 'company_not_found' }, 404)
      return c.json({ limits })
    },
  )

  app.put(
    '/platform/companies/:companyId/limits',
    requirePermission('limits.manage'),
    async (c) => {
      const parsed = updateLimitsSchema.safeParse(await readJson(c.req.raw))
      if (!parsed.success) {
        return c.json({ error: 'invalid_limits' }, 400)
      }
      const updated = await dependencies.platformAdmin().updateLimits(c.req.param('companyId'), parsed.data)
      if (!updated) return c.json({ error: 'company_not_found' }, 404)
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
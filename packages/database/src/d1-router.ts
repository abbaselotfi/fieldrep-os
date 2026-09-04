import type { WorkspaceId } from '@fieldrep/domain'

import type {
  D1BindingRegistry,
  D1DatabaseLike,
  WorkspaceDataRouter,
  WorkspaceDataStore,
} from './contracts'

interface WorkspaceDataRouteRow {
  workspace_id: string
  store_type: string
  store_identifier: string
  status: string
  schema_version: number
}

interface WorkspaceIdentityRow {
  workspace_id: string
  schema_version: number
}

export type WorkspaceDataRouteErrorCode =
  | 'workspace_route_not_found'
  | 'workspace_route_inactive'
  | 'workspace_store_type_unsupported'
  | 'workspace_binding_missing'
  | 'workspace_identity_missing'
  | 'workspace_identity_mismatch'
  | 'workspace_schema_too_old'

export class WorkspaceDataRouteError extends Error {
  readonly code: WorkspaceDataRouteErrorCode
  readonly workspaceId: WorkspaceId
  readonly detail: string | undefined

  constructor(
    code: WorkspaceDataRouteErrorCode,
    workspaceId: WorkspaceId,
    detail?: string,
  ) {
    super(detail === undefined ? code : `${code}: ${detail}`)
    this.name = 'WorkspaceDataRouteError'
    this.code = code
    this.workspaceId = workspaceId
    this.detail = detail
  }
}

class D1WorkspaceDataStore implements WorkspaceDataStore {
  readonly workspaceId: WorkspaceId
  readonly schemaVersion: number

  constructor(
    workspaceId: WorkspaceId,
    schemaVersion: number,
    private readonly database: D1DatabaseLike,
  ) {
    this.workspaceId = workspaceId
    this.schemaVersion = schemaVersion
  }

  async health(): Promise<boolean> {
    try {
      const identity = await readWorkspaceIdentity(this.database)
      return (
        identity !== null &&
        identity.workspace_id === this.workspaceId &&
        normalizeSchemaVersion(identity.schema_version) >= this.schemaVersion
      )
    } catch {
      return false
    }
  }
}

export class BoundD1WorkspaceDataRouter implements WorkspaceDataRouter {
  constructor(
    private readonly controlDatabase: D1DatabaseLike,
    private readonly workspaceBindings: D1BindingRegistry,
  ) {}

  async get(workspaceId: WorkspaceId): Promise<WorkspaceDataStore> {
    const route = await this.controlDatabase
      .prepare(
        `SELECT workspace_id, store_type, store_identifier, status, schema_version
         FROM workspace_data_routes
         WHERE workspace_id = ?
         LIMIT 1`,
      )
      .bind(workspaceId)
      .first<WorkspaceDataRouteRow>()

    if (route === null) {
      throw new WorkspaceDataRouteError('workspace_route_not_found', workspaceId)
    }

    if (route.status !== 'active') {
      throw new WorkspaceDataRouteError(
        'workspace_route_inactive',
        workspaceId,
        `status=${route.status}`,
      )
    }

    if (route.store_type !== 'd1') {
      throw new WorkspaceDataRouteError(
        'workspace_store_type_unsupported',
        workspaceId,
        `store_type=${route.store_type}`,
      )
    }

    const binding = Object.hasOwn(this.workspaceBindings, route.store_identifier)
      ? this.workspaceBindings[route.store_identifier]
      : undefined

    if (binding === undefined) {
      throw new WorkspaceDataRouteError(
        'workspace_binding_missing',
        workspaceId,
        `store_identifier=${route.store_identifier}`,
      )
    }

    const identity = await readWorkspaceIdentity(binding)
    if (identity === null) {
      throw new WorkspaceDataRouteError('workspace_identity_missing', workspaceId)
    }

    if (identity.workspace_id !== workspaceId) {
      throw new WorkspaceDataRouteError(
        'workspace_identity_mismatch',
        workspaceId,
        `database_workspace_id=${identity.workspace_id}`,
      )
    }

    const expectedSchemaVersion = normalizeSchemaVersion(route.schema_version)
    const actualSchemaVersion = normalizeSchemaVersion(identity.schema_version)

    if (actualSchemaVersion < expectedSchemaVersion) {
      throw new WorkspaceDataRouteError(
        'workspace_schema_too_old',
        workspaceId,
        `expected>=${expectedSchemaVersion};actual=${actualSchemaVersion}`,
      )
    }

    return new D1WorkspaceDataStore(workspaceId, actualSchemaVersion, binding)
  }
}

async function readWorkspaceIdentity(
  database: D1DatabaseLike,
): Promise<WorkspaceIdentityRow | null> {
  return database
    .prepare(
      `SELECT workspace_id, schema_version
       FROM workspace_identity
       WHERE singleton_key = 'workspace'
       LIMIT 1`,
    )
    .first<WorkspaceIdentityRow>()
}

function normalizeSchemaVersion(value: number): number {
  const normalized = Number(value)
  return Number.isInteger(normalized) && normalized >= 1 ? normalized : 0
}

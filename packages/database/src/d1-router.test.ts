import { describe, expect, it } from 'vitest'

import type { D1DatabaseLike, D1PreparedStatementLike, D1ResultLike } from './contracts'
import { BoundD1WorkspaceDataRouter } from './d1-router'

type RowResolver = (query: string, values: readonly unknown[]) => unknown | unknown[] | null

class FakePreparedStatement implements D1PreparedStatementLike {
  private values: unknown[] = []

  constructor(
    private readonly query: string,
    private readonly resolver: RowResolver,
  ) {}

  bind(...values: unknown[]): D1PreparedStatementLike {
    this.values = values
    return this
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const value = this.resolver(this.query, this.values)
    if (Array.isArray(value)) {
      return (value[0] ?? null) as T | null
    }
    return value as T | null
  }

  async all<T = Record<string, unknown>>(): Promise<D1ResultLike<T>> {
    const value = this.resolver(this.query, this.values)
    return {
      results: (value === null ? [] : Array.isArray(value) ? value : [value]) as T[],
    }
  }
}

class FakeDatabase implements D1DatabaseLike {
  constructor(private readonly resolver: RowResolver) {}

  prepare(query: string): D1PreparedStatementLike {
    return new FakePreparedStatement(query, this.resolver)
  }
}

function controlDatabase(route: Record<string, unknown> | null): D1DatabaseLike {
  return new FakeDatabase((query, values) => {
    if (!query.includes('workspace_data_routes')) {
      throw new Error(`Unexpected control query: ${query}`)
    }

    if (route === null || values[0] !== route.workspace_id) {
      return null
    }

    return route
  })
}

function workspaceDatabase(
  workspaceId: string | null,
  schemaVersion = 1,
): D1DatabaseLike {
  return new FakeDatabase((query) => {
    if (!query.includes('workspace_identity')) {
      throw new Error(`Unexpected workspace query: ${query}`)
    }

    return workspaceId === null
      ? null
      : { workspace_id: workspaceId, schema_version: schemaVersion }
  })
}

const activeRoute = {
  workspace_id: 'workspace-a',
  store_type: 'd1',
  store_identifier: 'WORKSPACE_A_DB',
  status: 'active',
  schema_version: 1,
}

describe('BoundD1WorkspaceDataRouter', () => {
  it('resolves an active D1 route only when the physical database identity matches', async () => {
    const router = new BoundD1WorkspaceDataRouter(controlDatabase(activeRoute), {
      WORKSPACE_A_DB: workspaceDatabase('workspace-a', 1),
    })

    const store = await router.get('workspace-a')

    expect(store.workspaceId).toBe('workspace-a')
    expect(store.schemaVersion).toBe(1)
    await expect(store.health()).resolves.toBe(true)
  })

  it('exposes bound query methods only after identity verification', async () => {
    const database = new FakeDatabase((query) => {
      if (query.includes('workspace_identity')) {
        return { workspace_id: 'workspace-a', schema_version: 1 }
      }
      if (query.includes('FROM routes')) {
        return [{ id: 'route-1' }, { id: 'route-2' }]
      }
      throw new Error(`Unexpected query: ${query}`)
    })
    const router = new BoundD1WorkspaceDataRouter(controlDatabase(activeRoute), {
      WORKSPACE_A_DB: database,
    })

    const store = await router.get('workspace-a')
    await expect(store.queryAll<{ id: string }>('SELECT id FROM routes')).resolves.toEqual([
      { id: 'route-1' },
      { id: 'route-2' },
    ])
  })

  it('rejects a route whose physical database belongs to another workspace', async () => {
    const router = new BoundD1WorkspaceDataRouter(controlDatabase(activeRoute), {
      WORKSPACE_A_DB: workspaceDatabase('workspace-b', 1),
    })

    await expect(router.get('workspace-a')).rejects.toMatchObject({
      code: 'workspace_identity_mismatch',
      workspaceId: 'workspace-a',
    })
  })

  it('rejects a route when its D1 binding is not deployed', async () => {
    const router = new BoundD1WorkspaceDataRouter(controlDatabase(activeRoute), {})

    await expect(router.get('workspace-a')).rejects.toMatchObject({
      code: 'workspace_binding_missing',
    })
  })

  it('rejects an inactive route', async () => {
    const router = new BoundD1WorkspaceDataRouter(
      controlDatabase({ ...activeRoute, status: 'maintenance' }),
      { WORKSPACE_A_DB: workspaceDatabase('workspace-a') },
    )

    await expect(router.get('workspace-a')).rejects.toMatchObject({
      code: 'workspace_route_inactive',
    })
  })

  it('rejects a workspace database behind the required schema version', async () => {
    const router = new BoundD1WorkspaceDataRouter(
      controlDatabase({ ...activeRoute, schema_version: 2 }),
      { WORKSPACE_A_DB: workspaceDatabase('workspace-a', 1) },
    )

    await expect(router.get('workspace-a')).rejects.toMatchObject({
      code: 'workspace_schema_too_old',
    })
  })

  it('rejects an unknown workspace without probing any workspace database', async () => {
    const router = new BoundD1WorkspaceDataRouter(controlDatabase(null), {
      WORKSPACE_A_DB: workspaceDatabase('workspace-a'),
    })

    await expect(router.get('workspace-a')).rejects.toMatchObject({
      code: 'workspace_route_not_found',
    })
  })
})

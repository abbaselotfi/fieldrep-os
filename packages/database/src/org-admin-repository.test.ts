import type { OrgUnitRecord } from '@fieldrep/domain'
import { describe, expect, it } from 'vitest'

import type { WorkspaceWritableDataStore } from './contracts'
import { WorkspaceOrgAdminRepository } from './org-admin-repository'

/**
 * Minimal in-memory store implementing the workspace data-store contract so
 * the repository logic (validation + SQL shape) is unit-testable without D1.
 */
class MemoryStore implements WorkspaceWritableDataStore {
  readonly workspaceId = 'ws-1'
  readonly schemaVersion = 1
  units: OrgUnitRecord[]
  memberships: { membership_id: string; relationship_type: string }[]
  executed: { query: string; values: unknown[] }[] = []

  constructor(units: OrgUnitRecord[] = []) {
    this.units = units
    this.memberships = []
  }

  async health(): Promise<boolean> {
    return true
  }
  async queryFirst<T = Record<string, unknown>>(
    query: string,
    values?: readonly unknown[],
  ): Promise<T | null> {
    if (query.includes('organization_memberships') && query.includes('relationship_type')) {
      const membership = this.memberships.find(
        (row) => row.membership_id === values?.[1],
      )
      return (membership as T) ?? null
    }
    return null
  }
  async queryAll<T = Record<string, unknown>>(
    query: string,
    _values?: readonly unknown[],
  ): Promise<T[]> {
    if (query.includes('organization_units')) {
      return this.units.map((unit) => ({
        id: unit.id,
        workspace_id: unit.workspaceId,
        parent_id: unit.parentId,
        name: unit.name,
        unit_type: unit.unitType,
      })) as unknown as T[]
    }
    return [] as T[]
  }
  async execute(query: string, values?: readonly unknown[]): Promise<{ success: boolean; changes: number }> {
    this.executed.push({ query, values: [...(values ?? [])] })
    return { success: true, changes: 1 }
  }
}

describe('WorkspaceOrgAdminRepository', () => {
  it('lists org units mapped to domain records', async () => {
    const repo = new WorkspaceOrgAdminRepository(
      new MemoryStore([
        { id: 'team-a', workspaceId: 'ws-1', parentId: null, name: 'A', unitType: 'team' },
      ]),
    )
    const units = await repo.listOrgUnits()
    expect(units[0]!.name).toBe('A')
    expect(units[0]!.unitType).toBe('team')
  })

  it('rejects a cycle when moving a unit under its descendant', async () => {
    const store = new MemoryStore([
      { id: 'team-a', workspaceId: 'ws-1', parentId: null, name: 'A', unitType: 'team' },
      { id: 'sub-a1', workspaceId: 'ws-1', parentId: 'team-a', name: 'A1', unitType: 'team' },
    ])
    const repo = new WorkspaceOrgAdminRepository(store)
    const error = await repo.moveOrgUnit({ unitId: 'team-a', newParentId: 'sub-a1' })
    expect(error).toBe('new_parent_descendant')
    expect(store.executed).toHaveLength(0)
  })

  it('rejects a cross-workspace parent', async () => {
    const store = new MemoryStore([
      { id: 'team-a', workspaceId: 'ws-1', parentId: null, name: 'A', unitType: 'team' },
      { id: 'other-ws', workspaceId: 'ws-2', parentId: null, name: 'X', unitType: 'team' },
    ])
    const repo = new WorkspaceOrgAdminRepository(store)
    const error = await repo.moveOrgUnit({ unitId: 'team-a', newParentId: 'other-ws' })
    expect(error).toBe('workspace_mismatch')
  })

  it('applies a valid move to root', async () => {
    const store = new MemoryStore([
      { id: 'team-a', workspaceId: 'ws-1', parentId: null, name: 'A', unitType: 'team' },
      { id: 'sub-a1', workspaceId: 'ws-1', parentId: 'team-a', name: 'A1', unitType: 'team' },
    ])
    const repo = new WorkspaceOrgAdminRepository(store, () => 900)
    const error = await repo.moveOrgUnit({ unitId: 'sub-a1', newParentId: null })
    expect(error).toBeNull()
    expect(store.executed[0]!.values[0]).toBeNull()
  })

  it('assigns an existing workspace membership to a unit', async () => {
    const store = new MemoryStore([
      { id: 'team-a', workspaceId: 'ws-1', parentId: null, name: 'A', unitType: 'team' },
    ])
    store.memberships = [
      { membership_id: 'm1', relationship_type: 'member' },
    ]
    const repo = new WorkspaceOrgAdminRepository(store, () => 900)
    const assigned = await repo.assignMembership({
      unitId: 'team-a',
      membershipId: 'm1',
      relationshipType: 'manager',
    })
    expect(assigned).toBe(true)
    expect(store.executed[0]!.values[0]).toBe('team-a')
    expect(store.executed[0]!.values[1]).toBe('manager')
  })

  it('returns false when the unit or membership is not in this workspace', async () => {
    const store = new MemoryStore()
    const repo = new WorkspaceOrgAdminRepository(store)
    expect(
      await repo.assignMembership({ unitId: 'missing', membershipId: 'm1' }),
    ).toBe(false)
  })

  it('writes feature settings as upserts', async () => {
    const store = new MemoryStore()
    const repo = new WorkspaceOrgAdminRepository(store, () => 900)
    await repo.setFeatureSettings([{ key: 'ai_planning', enabled: true }], 'admin-1')
    expect(store.executed[0]!.values[1]).toBe('feature:ai_planning')
    expect(store.executed[0]!.values[3]).toBe('admin-1')
  })
})
import { describe, expect, it } from 'vitest'

import type { OrgUnitRecord } from './org-unit-tree'
import {
  buildOrgUnitTree,
  collectOrgUnitDescendants,
  orgUnitContains,
  validateOrgUnitParentChange,
} from './org-unit-tree'

const units: readonly OrgUnitRecord[] = [
  { id: 'team-a', workspaceId: 'ws-1', parentId: null, name: 'A', unitType: 'team' },
  { id: 'sub-a1', workspaceId: 'ws-1', parentId: 'team-a', name: 'A1', unitType: 'team' },
  { id: 'team-b', workspaceId: 'ws-1', parentId: null, name: 'B', unitType: 'team' },
  { id: 'sub-b1', workspaceId: 'ws-1', parentId: 'team-b', name: 'B1', unitType: 'team' },
  { id: 'other-ws', workspaceId: 'ws-2', parentId: null, name: 'X', unitType: 'team' },
]

describe('buildOrgUnitTree', () => {
  it('builds roots and deterministic sorted children within one workspace', () => {
    const workspaceUnits = units.filter((unit) => unit.workspaceId === 'ws-1')
    const tree = buildOrgUnitTree(workspaceUnits)
    expect(tree.map((node) => node.id)).toEqual(['team-a', 'team-b'])
    expect(tree[0]!.children.map((child) => child.id)).toEqual(['sub-a1'])
  })

  it('treats a record with a missing parent as a root without crashing', () => {
    const tree = buildOrgUnitTree([{ ...units[0]!, parentId: 'missing' }])
    expect(tree.map((node) => node.id)).toEqual(['team-a'])
  })
})

describe('collectOrgUnitDescendants', () => {
  it('collects descendants and self', () => {
    const ids = collectOrgUnitDescendants(units, 'team-a', true)
    expect(ids).toEqual(['sub-a1', 'team-a'])
  })

  it('returns an empty list for a leaf without self', () => {
    expect(collectOrgUnitDescendants(units, 'sub-a1')).toEqual([])
  })
})

describe('orgUnitContains', () => {
  it('detects ancestor/descendant membership', () => {
    expect(orgUnitContains(units, 'team-a', 'sub-a1')).toBe(true)
    expect(orgUnitContains(units, 'team-a', 'team-b')).toBe(false)
    expect(orgUnitContains(units, 'team-a', 'team-a')).toBe(true)
  })
})

describe('validateOrgUnitParentChange', () => {
  it('rejects cycles (new parent is a descendant)', () => {
    expect(validateOrgUnitParentChange(units, 'team-a', 'sub-a1')).toBe(
      'new_parent_descendant',
    )
  })

  it('rejects self-parenting', () => {
    expect(validateOrgUnitParentChange(units, 'team-a', 'team-a')).toBe('new_parent_self')
  })

  it('rejects cross-workspace parents', () => {
    expect(validateOrgUnitParentChange(units, 'team-a', 'other-ws')).toBe(
      'workspace_mismatch',
    )
  })

  it('accepts a null parent (move to root) and a valid sibling', () => {
    expect(validateOrgUnitParentChange(units, 'team-a', null)).toBeNull()
    expect(validateOrgUnitParentChange(units, 'sub-a1', 'team-b')).toBeNull()
  })
})
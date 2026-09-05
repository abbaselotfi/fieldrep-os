import { describe, expect, it } from 'vitest'

import type { WorkspaceDataStore } from './contracts'
import { WorkspaceCustomerReadRepository } from './customer-repository'

interface QueryCall {
  kind: 'first' | 'all'
  query: string
  values: readonly unknown[]
}

class FakeStore implements WorkspaceDataStore {
  readonly workspaceId = 'workspace-a'
  readonly schemaVersion = 2
  readonly calls: QueryCall[] = []

  constructor(
    private readonly resolver: (
      kind: QueryCall['kind'],
      query: string,
      values: readonly unknown[],
    ) => unknown,
  ) {}

  async health(): Promise<boolean> {
    return true
  }

  async queryFirst<T = Record<string, unknown>>(
    query: string,
    values: readonly unknown[] = [],
  ): Promise<T | null> {
    this.calls.push({ kind: 'first', query, values })
    return this.resolver('first', query, values) as T | null
  }

  async queryAll<T = Record<string, unknown>>(
    query: string,
    values: readonly unknown[] = [],
  ): Promise<T[]> {
    this.calls.push({ kind: 'all', query, values })
    return this.resolver('all', query, values) as T[]
  }
}

const doctorRow = {
  id: 'doctor-1',
  workspace_id: 'workspace-a',
  customer_type: 'doctor',
  display_name: 'دکتر نمونه',
  status: 'active',
  record_scope: 'workspace',
  source: 'company',
  owner_user_id: null,
  specialty: 'Internal Medicine',
  class_key: 'A',
  required_frequency: 6,
  primary_route_id: 'route-1',
  primary_route_code: 'R8',
  primary_route_name: 'منطقه ۸',
  location_count: 2,
}

describe('WorkspaceCustomerReadRepository', () => {
  it('lists active workspace routes', async () => {
    const store = new FakeStore((_kind, query) => {
      if (query.includes('FROM routes')) {
        return [
          { id: 'route-1', code: 'R8', name: 'منطقه ۸' },
          { id: 'route-2', code: null, name: 'بجنورد' },
        ]
      }
      throw new Error(`Unexpected query: ${query}`)
    })

    const repository = new WorkspaceCustomerReadRepository(store)

    await expect(repository.listRoutes()).resolves.toEqual([
      { id: 'route-1', code: 'R8', name: 'منطقه ۸' },
      { id: 'route-2', code: null, name: 'بجنورد' },
    ])
    expect(store.calls[0]?.values).toEqual(['workspace-a'])
  })

  it('returns customer progress fields and keeps user-private visibility in the query', async () => {
    const store = new FakeStore((_kind, query, values) => {
      if (!query.includes('FROM customers c')) throw new Error(`Unexpected query: ${query}`)
      expect(query).toContain("c.record_scope = 'workspace'")
      expect(query).toContain("c.record_scope = 'user' AND c.owner_user_id = ?")
      expect(values.slice(0, 2)).toEqual(['workspace-a', 'user-1'])
      return [doctorRow]
    })

    const repository = new WorkspaceCustomerReadRepository(store)
    const result = await repository.listCustomers('user-1')

    expect(result).toEqual([
      {
        id: 'doctor-1',
        workspaceId: 'workspace-a',
        type: 'doctor',
        displayName: 'دکتر نمونه',
        status: 'active',
        recordScope: 'workspace',
        source: 'company',
        ownerUserId: null,
        primaryRoute: { id: 'route-1', code: 'R8', name: 'منطقه ۸' },
        doctorProfile: {
          specialty: 'Internal Medicine',
          classKey: 'A',
          requiredFrequency: 6,
        },
        locationCount: 2,
      },
    ])
  })

  it('binds route, class, specialty and escaped search filters instead of interpolating values', async () => {
    const store = new FakeStore((_kind, query, values) => {
      expect(query).toContain('route_filter.route_id = ?')
      expect(query).toContain('dp.class_key = ?')
      expect(query).toContain('dp.specialty = ?')
      expect(query).toContain("c.display_name LIKE ? ESCAPE '!'")
      expect(query).not.toContain('Ali%_')
      expect(values).toEqual([
        'workspace-a',
        'user-1',
        '%Ali!%!_%',
        'route-1',
        'A',
        'Internal Medicine',
      ])
      return []
    })

    const repository = new WorkspaceCustomerReadRepository(store)
    await repository.listCustomers('user-1', {
      search: 'Ali%_',
      routeId: 'route-1',
      classKey: 'A',
      specialty: 'Internal Medicine',
    })
  })

  it('returns null when a customer is not visible to the viewer', async () => {
    const store = new FakeStore((kind, query, values) => {
      if (kind === 'first' && query.includes('FROM customers c')) {
        expect(values).toEqual(['workspace-a', 'private-doctor', 'user-1'])
        return null
      }
      throw new Error(`Unexpected query: ${query}`)
    })

    const repository = new WorkspaceCustomerReadRepository(store)
    await expect(repository.getCustomer('user-1', 'private-doctor')).resolves.toBeNull()
  })

  it('loads routes and multiple active locations for customer detail', async () => {
    const store = new FakeStore((kind, query) => {
      if (kind === 'first' && query.includes('FROM customers c')) return doctorRow
      if (kind === 'all' && query.includes('FROM customer_route_assignments')) {
        return [{ id: 'route-1', code: 'R8', name: 'منطقه ۸' }]
      }
      if (kind === 'all' && query.includes('FROM customer_locations')) {
        return [
          {
            id: 'loc-1',
            label: 'مطب',
            address: 'آدرس ۱',
            province: 'خراسان رضوی',
            city: 'مشهد',
            district: 'احمدآباد',
            latitude: 36.29,
            longitude: 59.59,
            is_primary: 1,
          },
          {
            id: 'loc-2',
            label: 'بیمارستان',
            address: 'آدرس ۲',
            province: 'خراسان رضوی',
            city: 'مشهد',
            district: null,
            latitude: null,
            longitude: null,
            is_primary: 0,
          },
        ]
      }
      throw new Error(`Unexpected query: ${query}`)
    })

    const repository = new WorkspaceCustomerReadRepository(store)
    const result = await repository.getCustomer('user-1', 'doctor-1')

    expect(result?.routes).toEqual([{ id: 'route-1', code: 'R8', name: 'منطقه ۸' }])
    expect(result?.locations).toHaveLength(2)
    expect(result?.locations[0]).toMatchObject({ id: 'loc-1', isPrimary: true })
  })
})

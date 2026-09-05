import type {
  CustomerDetail,
  CustomerId,
  CustomerListFilters,
  CustomerLocationSummary,
  CustomerRecordScope,
  CustomerSource,
  CustomerStatus,
  CustomerSummary,
  CustomerType,
  DoctorCustomerProfile,
  RouteSummary,
  UserId,
  WorkspaceId,
} from '@fieldrep/domain'

import type { WorkspaceDataStore } from './contracts'

interface CustomerListRow {
  id: string
  workspace_id: string
  customer_type: CustomerType
  display_name: string
  status: CustomerStatus
  record_scope: CustomerRecordScope
  source: CustomerSource
  owner_user_id: string | null
  specialty: string | null
  class_key: string | null
  required_frequency: number | null
  primary_route_id: string | null
  primary_route_code: string | null
  primary_route_name: string | null
  location_count: number
}

interface RouteRow {
  id: string
  code: string | null
  name: string
}

interface LocationRow {
  id: string
  label: string
  address: string | null
  province: string | null
  city: string | null
  district: string | null
  latitude: number | null
  longitude: number | null
  is_primary: number
}

export interface CustomerReadRepository {
  listRoutes(): Promise<RouteSummary[]>
  listCustomers(viewerUserId: UserId, filters?: CustomerListFilters): Promise<CustomerSummary[]>
  getCustomer(viewerUserId: UserId, customerId: CustomerId): Promise<CustomerDetail | null>
}

export class WorkspaceCustomerReadRepository implements CustomerReadRepository {
  constructor(private readonly store: WorkspaceDataStore) {}

  async listRoutes(): Promise<RouteSummary[]> {
    const rows = await this.store.queryAll<RouteRow>(
      `SELECT id, code, name
       FROM routes
       WHERE workspace_id = ? AND status = 'active'
       ORDER BY name, id`,
      [this.store.workspaceId],
    )

    return rows.map(mapRoute)
  }

  async listCustomers(
    viewerUserId: UserId,
    filters: CustomerListFilters = {},
  ): Promise<CustomerSummary[]> {
    const predicates = [
      `c.workspace_id = ?`,
      `c.status = 'active'`,
      `(c.record_scope = 'workspace' OR (c.record_scope = 'user' AND c.owner_user_id = ?))`,
    ]
    const values: unknown[] = [this.store.workspaceId, viewerUserId]

    const normalizedSearch = filters.search?.trim()
    if (normalizedSearch !== undefined && normalizedSearch !== '') {
      predicates.push(`c.display_name LIKE ? ESCAPE '!'`)
      values.push(`%${escapeLike(normalizedSearch)}%`)
    }

    if (filters.routeId !== undefined) {
      predicates.push(
        `EXISTS (
          SELECT 1
          FROM customer_route_assignments route_filter
          WHERE route_filter.customer_id = c.id
            AND route_filter.workspace_id = c.workspace_id
            AND route_filter.route_id = ?
        )`,
      )
      values.push(filters.routeId)
    }

    if (filters.classKey !== undefined) {
      predicates.push(`dp.class_key = ?`)
      values.push(filters.classKey)
    }

    if (filters.specialty !== undefined) {
      predicates.push(`dp.specialty = ?`)
      values.push(filters.specialty)
    }

    const rows = await this.store.queryAll<CustomerListRow>(
      `${CUSTOMER_BASE_SELECT}
       WHERE ${predicates.join('\n         AND ')}
       ORDER BY c.display_name, c.id`,
      values,
    )

    return rows.map(mapCustomerSummary)
  }

  async getCustomer(
    viewerUserId: UserId,
    customerId: CustomerId,
  ): Promise<CustomerDetail | null> {
    const row = await this.store.queryFirst<CustomerListRow>(
      `${CUSTOMER_BASE_SELECT}
       WHERE c.workspace_id = ?
         AND c.id = ?
         AND c.status = 'active'
         AND (c.record_scope = 'workspace' OR (c.record_scope = 'user' AND c.owner_user_id = ?))
       LIMIT 1`,
      [this.store.workspaceId, customerId, viewerUserId],
    )

    if (row === null) return null

    const [routeRows, locationRows] = await Promise.all([
      this.store.queryAll<RouteRow>(
        `SELECT r.id, r.code, r.name
         FROM customer_route_assignments cra
         JOIN routes r ON r.id = cra.route_id AND r.workspace_id = cra.workspace_id
         WHERE cra.workspace_id = ? AND cra.customer_id = ? AND r.status = 'active'
         ORDER BY cra.is_primary DESC, r.name, r.id`,
        [this.store.workspaceId, customerId],
      ),
      this.store.queryAll<LocationRow>(
        `SELECT id, label, address, province, city, district, latitude, longitude, is_primary
         FROM customer_locations
         WHERE workspace_id = ? AND customer_id = ? AND status = 'active'
         ORDER BY is_primary DESC, label, id`,
        [this.store.workspaceId, customerId],
      ),
    ])

    return {
      ...mapCustomerSummary(row),
      routes: routeRows.map(mapRoute),
      locations: locationRows.map(mapLocation),
    }
  }
}

const CUSTOMER_BASE_SELECT = `SELECT
  c.id,
  c.workspace_id,
  c.customer_type,
  c.display_name,
  c.status,
  c.record_scope,
  c.source,
  c.owner_user_id,
  dp.specialty,
  dp.class_key,
  dp.required_frequency,
  primary_route.id AS primary_route_id,
  primary_route.code AS primary_route_code,
  primary_route.name AS primary_route_name,
  (
    SELECT COUNT(*)
    FROM customer_locations location_count
    WHERE location_count.customer_id = c.id
      AND location_count.workspace_id = c.workspace_id
      AND location_count.status = 'active'
  ) AS location_count
FROM customers c
LEFT JOIN customer_doctor_profiles dp
  ON dp.customer_id = c.id AND dp.workspace_id = c.workspace_id
LEFT JOIN customer_route_assignments primary_assignment
  ON primary_assignment.customer_id = c.id
  AND primary_assignment.workspace_id = c.workspace_id
  AND primary_assignment.is_primary = 1
LEFT JOIN routes primary_route
  ON primary_route.id = primary_assignment.route_id
  AND primary_route.workspace_id = primary_assignment.workspace_id
  AND primary_route.status = 'active'`

function mapCustomerSummary(row: CustomerListRow): CustomerSummary {
  return {
    id: row.id,
    workspaceId: row.workspace_id as WorkspaceId,
    type: row.customer_type,
    displayName: row.display_name,
    status: row.status,
    recordScope: row.record_scope,
    source: row.source,
    ownerUserId: row.owner_user_id as UserId | null,
    primaryRoute: mapPrimaryRoute(row),
    doctorProfile: mapDoctorProfile(row),
    locationCount: Number(row.location_count),
  }
}

function mapPrimaryRoute(row: CustomerListRow): RouteSummary | null {
  if (row.primary_route_id === null || row.primary_route_name === null) return null
  return {
    id: row.primary_route_id,
    code: row.primary_route_code,
    name: row.primary_route_name,
  }
}

function mapDoctorProfile(row: CustomerListRow): DoctorCustomerProfile | null {
  if (row.customer_type !== 'doctor') return null
  return {
    specialty: row.specialty,
    classKey: row.class_key,
    requiredFrequency: Number(row.required_frequency ?? 0),
  }
}

function mapRoute(row: RouteRow): RouteSummary {
  return { id: row.id, code: row.code, name: row.name }
}

function mapLocation(row: LocationRow): CustomerLocationSummary {
  return {
    id: row.id,
    label: row.label,
    address: row.address,
    province: row.province,
    city: row.city,
    district: row.district,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    isPrimary: row.is_primary === 1,
  }
}

function escapeLike(value: string): string {
  return value.replaceAll('!', '!!').replaceAll('%', '!%').replaceAll('_', '!_')
}

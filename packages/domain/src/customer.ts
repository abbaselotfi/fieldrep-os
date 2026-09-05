import type {
  CustomerId,
  LocationId,
  RouteId,
  UserId,
  WorkspaceId,
} from './identity'

export type CustomerType = 'doctor' | 'pharmacy' | 'hospital' | 'clinic' | 'laboratory' | 'other'
export type CustomerStatus = 'active' | 'inactive' | 'archived'
export type CustomerRecordScope = 'workspace' | 'user'
export type CustomerSource = 'company' | 'user' | 'platform_dataset' | 'import'

export interface RouteSummary {
  id: RouteId
  code: string | null
  name: string
}

export interface DoctorCustomerProfile {
  specialty: string | null
  classKey: string | null
  requiredFrequency: number
}

export interface CustomerLocationSummary {
  id: LocationId
  label: string
  address: string | null
  province: string | null
  city: string | null
  district: string | null
  latitude: number | null
  longitude: number | null
  isPrimary: boolean
}

export interface CustomerSummary {
  id: CustomerId
  workspaceId: WorkspaceId
  type: CustomerType
  displayName: string
  status: CustomerStatus
  recordScope: CustomerRecordScope
  source: CustomerSource
  ownerUserId: UserId | null
  primaryRoute: RouteSummary | null
  doctorProfile: DoctorCustomerProfile | null
  locationCount: number
}

export interface CustomerDetail extends CustomerSummary {
  routes: RouteSummary[]
  locations: CustomerLocationSummary[]
}

export interface CustomerListFilters {
  search?: string
  routeId?: RouteId
  classKey?: string
  specialty?: string
}

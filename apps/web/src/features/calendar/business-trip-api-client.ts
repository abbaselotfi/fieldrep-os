export type BusinessTripApiStatus = 'draft' | 'requested' | 'approved' | 'rejected' | 'cancelled' | 'completed'
export type BusinessTripTransport = 'car' | 'train' | 'airplane' | 'bus' | 'taxi' | 'other'

export interface BusinessTripDestinationApiEntry {
  id: string
  sequence: number
  city: string
  province: string | null
  address: string | null
  startsAt: number | null
  endsAt: number | null
}

export interface BusinessTripApiEntry {
  id: string
  workspaceId: string
  userId: string
  originCity: string
  originProvince: string | null
  purpose: string
  transport: BusinessTripTransport
  startsAt: number
  endsAt: number
  localStartDate: string
  localEndDate: string
  allDay: boolean
  blocksPlanning: boolean
  status: BusinessTripApiStatus
  destinations: BusinessTripDestinationApiEntry[]
  decidedByUserId: string | null
  decidedAt: number | null
}

export interface CreateOwnBusinessTripRequest {
  id: string
  calendarEventId: string
  originCity: string
  originProvince?: string | null
  purpose: string
  transport: BusinessTripTransport
  startsAt: number
  endsAt: number
  localStartDate: string
  localEndDate: string
  allDay?: boolean
  blocksPlanning?: boolean
  destinations: BusinessTripDestinationApiEntry[]
}

export class BusinessTripApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(`${code} (${status})`)
    this.name = 'BusinessTripApiError'
  }
}

export class OwnBusinessTripHttpClient {
  constructor(
    private readonly workspaceId: string,
    private readonly apiBase = '/api/v1',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async list(from: string, to: string): Promise<BusinessTripApiEntry[]> {
    const query = new URLSearchParams({ from, to })
    const payload = await this.request<{ trips: BusinessTripApiEntry[] }>(`${this.tripsUrl()}?${query.toString()}`)
    return payload.trips
  }

  async get(tripId: string): Promise<BusinessTripApiEntry> {
    const payload = await this.request<{ trip: BusinessTripApiEntry }>(`${this.tripsUrl()}/${encodeURIComponent(tripId)}`)
    return payload.trip
  }

  async createDraft(input: CreateOwnBusinessTripRequest): Promise<BusinessTripApiEntry> {
    const payload = await this.request<{ trip: BusinessTripApiEntry }>(this.tripsUrl(), {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    })
    return payload.trip
  }

  async requestTrip(tripId: string): Promise<BusinessTripApiEntry> {
    const payload = await this.request<{ trip: BusinessTripApiEntry }>(
      `${this.tripsUrl()}/${encodeURIComponent(tripId)}/request`, { method: 'POST' },
    )
    return payload.trip
  }

  async complete(tripId: string): Promise<BusinessTripApiEntry> {
    const payload = await this.request<{ trip: BusinessTripApiEntry }>(
      `${this.tripsUrl()}/${encodeURIComponent(tripId)}/complete`, { method: 'POST' },
    )
    return payload.trip
  }

  async cancel(tripId: string): Promise<void> {
    await this.request<void>(`${this.tripsUrl()}/${encodeURIComponent(tripId)}`, { method: 'DELETE' })
  }

  private tripsUrl(): string {
    const base = this.apiBase.endsWith('/') ? this.apiBase.slice(0, -1) : this.apiBase
    return `${base}/workspaces/${encodeURIComponent(this.workspaceId)}/business-trips`
  }

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetchImpl(url, {
      ...init,
      credentials: 'include',
      headers: { accept: 'application/json', ...init.headers },
    })
    if (!response.ok) {
      let code = 'request_failed'
      try {
        const payload = (await response.json()) as { error?: unknown }
        if (typeof payload.error === 'string' && payload.error !== '') code = payload.error
      } catch {
        // Stable generic fallback.
      }
      throw new BusinessTripApiError(response.status, code)
    }
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }
}

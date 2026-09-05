export type VisitApiStatus = 'completed' | 'cancelled'
export type VisitApiSource = 'planned' | 'unplanned'

export interface VisitApiProductCall {
  productId: string
  callCount: number
}

export interface VisitApiProduct {
  id: string
  workspaceId: string
  code: string | null
  name: string
  status: 'active' | 'inactive' | 'archived'
  sortOrder: number
}

export interface VisitApiCustomerCounters {
  customerId: string
  completedVisitRecords: number
  totalProductCalls: number
  byProduct: VisitApiProductCall[]
}

export interface VisitApiActual {
  id: string
  workspaceId: string
  ownerUserId: string
  customerId: string
  planEntryId?: string
  visitDate: string
  occurredAt: number
  status: VisitApiStatus
  source: VisitApiSource
  notes?: string
  locationId?: string
  productCalls: VisitApiProductCall[]
}

export interface CreateOwnVisitRequest {
  id: string
  customerId: string
  planEntryId?: string
  visitDate: string
  occurredAt: number
  notes?: string
  locationId?: string
  productCalls: readonly VisitApiProductCall[]
}

export class VisitApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`${code} (${status})`)
    this.name = 'VisitApiError'
  }
}

export class OwnVisitHttpClient {
  constructor(
    private readonly workspaceId: string,
    private readonly apiBase = '/api/v1',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async products(): Promise<VisitApiProduct[]> {
    const payload = await this.request<{ products: VisitApiProduct[] }>(
      `${this.workspaceUrl()}/visit-products`,
    )
    return payload.products
  }

  async list(from: string, to: string): Promise<VisitApiActual[]> {
    const query = new URLSearchParams({ from, to })
    const payload = await this.request<{ visits: VisitApiActual[] }>(
      `${this.workspaceUrl()}/visits?${query.toString()}`,
    )
    return payload.visits
  }

  async counters(customerId: string, from: string, to: string): Promise<VisitApiCustomerCounters> {
    const query = new URLSearchParams({ from, to })
    const payload = await this.request<{ counters: VisitApiCustomerCounters }>(
      `${this.workspaceUrl()}/visit-counters/${encodeURIComponent(customerId)}?${query.toString()}`,
    )
    return payload.counters
  }

  async create(input: CreateOwnVisitRequest): Promise<VisitApiActual> {
    const payload = await this.request<{ visit: VisitApiActual }>(`${this.workspaceUrl()}/visits`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    return payload.visit
  }

  async cancel(visitId: string): Promise<void> {
    await this.request<void>(
      `${this.workspaceUrl()}/visits/${encodeURIComponent(visitId)}/cancel`,
      { method: 'POST' },
    )
  }

  private workspaceUrl(): string {
    const base = this.apiBase.endsWith('/') ? this.apiBase.slice(0, -1) : this.apiBase
    return `${base}/workspaces/${encodeURIComponent(this.workspaceId)}`
  }

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetchImpl(url, {
      ...init,
      credentials: 'include',
      headers: {
        accept: 'application/json',
        ...init.headers,
      },
    })

    if (!response.ok) {
      let code = 'request_failed'
      try {
        const payload = (await response.json()) as { error?: unknown }
        if (typeof payload.error === 'string' && payload.error !== '') code = payload.error
      } catch {
        // Keep a stable generic error when the response is not JSON.
      }
      throw new VisitApiError(response.status, code)
    }

    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }
}

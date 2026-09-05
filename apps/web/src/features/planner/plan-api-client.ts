export type PlanApiStatus = 'planned' | 'completed' | 'missed' | 'cancelled' | 'rescheduled'
export type PlanApiSource = 'manual' | 'suggested' | 'imported'

export interface PlanApiEntry {
  id: string
  workspaceId: string
  ownerUserId: string
  customerId: string
  planDate: string
  routeId?: string
  productIds?: string[]
  status: PlanApiStatus
  source: PlanApiSource
}

export interface CreateOwnPlanRequest {
  id: string
  planningCycleId: string
  customerId: string
  planDate: string
  routeId?: string
  source?: PlanApiSource
}

export interface UpdateOwnPlanRequest {
  planningCycleId?: string
  customerId?: string
  planDate?: string
  routeId?: string | null
}

export class PlanApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`${code} (${status})`)
    this.name = 'PlanApiError'
  }
}

export class OwnPlanHttpClient {
  constructor(
    private readonly workspaceId: string,
    private readonly apiBase = '/api/v1',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async list(from: string, to: string, cycleId?: string): Promise<PlanApiEntry[]> {
    const query = new URLSearchParams({ from, to })
    if (cycleId !== undefined) query.set('cycleId', cycleId)
    const payload = await this.request<{ entries: PlanApiEntry[] }>(
      `${this.plansUrl()}?${query.toString()}`,
    )
    return payload.entries
  }

  async create(input: CreateOwnPlanRequest): Promise<PlanApiEntry> {
    const payload = await this.request<{ entry: PlanApiEntry }>(this.plansUrl(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    return payload.entry
  }

  async update(planEntryId: string, patch: UpdateOwnPlanRequest): Promise<PlanApiEntry> {
    const payload = await this.request<{ entry: PlanApiEntry }>(
      `${this.plansUrl()}/${encodeURIComponent(planEntryId)}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      },
    )
    return payload.entry
  }

  async cancel(planEntryId: string): Promise<void> {
    await this.request<void>(`${this.plansUrl()}/${encodeURIComponent(planEntryId)}`, {
      method: 'DELETE',
    })
  }

  private plansUrl(): string {
    const base = this.apiBase.endsWith('/') ? this.apiBase.slice(0, -1) : this.apiBase
    return `${base}/workspaces/${encodeURIComponent(this.workspaceId)}/plans`
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
      throw new PlanApiError(response.status, code)
    }

    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }
}

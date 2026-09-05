export type OwnActivityType = 'internal_meeting' | 'custom_activity'
export type ActivityApiStatus = 'draft' | 'scheduled' | 'completed' | 'cancelled'

export interface ActivityApiEntry {
  id: string
  workspaceId: string
  createdByUserId: string
  ownerUserId: string | null
  type: 'internal_meeting' | 'company_program' | 'doctor_program' | 'custom_activity'
  title: string
  description: string | null
  startsAt: number
  endsAt: number
  localStartDate: string
  localEndDate: string
  allDay: boolean
  scope: { type: string; id: string | null }
  attendeeUserIds: string[]
  blocksPlanning: boolean
  countsAsWorkingActivity: boolean
  appearsInReport: boolean
  status: ActivityApiStatus
  locationText: string | null
}

export interface CreateOwnActivityRequest {
  id: string
  calendarEventId: string
  type: OwnActivityType
  title: string
  description?: string | null
  startsAt: number
  endsAt: number
  localStartDate: string
  localEndDate: string
  allDay?: boolean
  blocksPlanning?: boolean
  countsAsWorkingActivity?: boolean
  appearsInReport?: boolean
  locationText?: string | null
}

export interface UpdateOwnActivityRequest {
  title?: string
  description?: string | null
  startsAt?: number
  endsAt?: number
  localStartDate?: string
  localEndDate?: string
  allDay?: boolean
  blocksPlanning?: boolean
  countsAsWorkingActivity?: boolean
  appearsInReport?: boolean
  status?: Exclude<ActivityApiStatus, 'cancelled'>
  locationText?: string | null
}

export class ActivityApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`${code} (${status})`)
    this.name = 'ActivityApiError'
  }
}

export class OwnActivityHttpClient {
  constructor(
    private readonly workspaceId: string,
    private readonly apiBase = '/api/v1',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async list(from: string, to: string): Promise<ActivityApiEntry[]> {
    const query = new URLSearchParams({ from, to })
    const payload = await this.request<{ activities: ActivityApiEntry[] }>(
      `${this.activitiesUrl()}?${query.toString()}`,
    )
    return payload.activities
  }

  async get(activityId: string): Promise<ActivityApiEntry> {
    const payload = await this.request<{ activity: ActivityApiEntry }>(
      `${this.activitiesUrl()}/${encodeURIComponent(activityId)}`,
    )
    return payload.activity
  }

  async create(input: CreateOwnActivityRequest): Promise<ActivityApiEntry> {
    const payload = await this.request<{ activity: ActivityApiEntry }>(this.activitiesUrl(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    return payload.activity
  }

  async update(activityId: string, patch: UpdateOwnActivityRequest): Promise<ActivityApiEntry> {
    const payload = await this.request<{ activity: ActivityApiEntry }>(
      `${this.activitiesUrl()}/${encodeURIComponent(activityId)}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      },
    )
    return payload.activity
  }

  async cancel(activityId: string): Promise<void> {
    await this.request<void>(`${this.activitiesUrl()}/${encodeURIComponent(activityId)}`, {
      method: 'DELETE',
    })
  }

  private activitiesUrl(): string {
    const base = this.apiBase.endsWith('/') ? this.apiBase.slice(0, -1) : this.apiBase
    return `${base}/workspaces/${encodeURIComponent(this.workspaceId)}/activities`
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
        // Preserve a stable generic error for non-JSON failures.
      }
      throw new ActivityApiError(response.status, code)
    }

    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }
}

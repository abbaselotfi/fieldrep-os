export type LeaveApiType = 'annual' | 'sick' | 'hourly' | 'emergency' | 'other'
export type LeaveApiStatus = 'draft' | 'requested' | 'approved' | 'rejected' | 'cancelled'

export interface LeaveApiEntry {
  id: string
  workspaceId: string
  userId: string
  type: LeaveApiType
  startsAt: number
  endsAt: number
  localStartDate: string
  localEndDate: string
  allDay: boolean
  reason: string | null
  status: LeaveApiStatus
  decidedByUserId: string | null
  decidedAt: number | null
}

export interface CreateOwnLeaveRequest {
  id: string
  calendarEventId: string
  type: LeaveApiType
  startsAt: number
  endsAt: number
  localStartDate: string
  localEndDate: string
  allDay?: boolean
  reason?: string | null
}

export class LeaveApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`${code} (${status})`)
    this.name = 'LeaveApiError'
  }
}

export class OwnLeaveHttpClient {
  constructor(
    private readonly workspaceId: string,
    private readonly apiBase = '/api/v1',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async list(from: string, to: string): Promise<LeaveApiEntry[]> {
    const query = new URLSearchParams({ from, to })
    const payload = await this.request<{ leaves: LeaveApiEntry[] }>(
      `${this.leavesUrl()}?${query.toString()}`,
    )
    return payload.leaves
  }

  async get(leaveId: string): Promise<LeaveApiEntry> {
    const payload = await this.request<{ leave: LeaveApiEntry }>(
      `${this.leavesUrl()}/${encodeURIComponent(leaveId)}`,
    )
    return payload.leave
  }

  async createDraft(input: CreateOwnLeaveRequest): Promise<LeaveApiEntry> {
    const payload = await this.request<{ leave: LeaveApiEntry }>(this.leavesUrl(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    return payload.leave
  }

  async requestLeave(leaveId: string): Promise<LeaveApiEntry> {
    const payload = await this.request<{ leave: LeaveApiEntry }>(
      `${this.leavesUrl()}/${encodeURIComponent(leaveId)}/request`,
      { method: 'POST' },
    )
    return payload.leave
  }

  async cancel(leaveId: string): Promise<void> {
    await this.request<void>(`${this.leavesUrl()}/${encodeURIComponent(leaveId)}`, {
      method: 'DELETE',
    })
  }

  private leavesUrl(): string {
    const base = this.apiBase.endsWith('/') ? this.apiBase.slice(0, -1) : this.apiBase
    return `${base}/workspaces/${encodeURIComponent(this.workspaceId)}/leaves`
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
        // Preserve stable generic error for non-JSON failures.
      }
      throw new LeaveApiError(response.status, code)
    }

    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }
}

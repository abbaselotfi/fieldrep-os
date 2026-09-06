import type {
  BusinessTrip,
  BusinessTripStatus,
  CalendarActivity,
  CalendarActivityStatus,
  CalendarActivityType,
  CalendarClosure,
  CalendarScope,
  LeaveRequest,
  LeaveRequestStatus,
  LeaveRequestType,
  PlaceContext,
  WorkspaceId,
} from '@fieldrep/domain'

import type { WorkspaceWritableDataStore } from './contracts'

export interface WorkingCalendarConfig {
  workspaceId: WorkspaceId
  timezone: string
  workingWeekdays: number[]
  updatedAt: string
}

export interface CalendarActivityFilter {
  fromMs: number
  toMs: number
}

export interface CreateCalendarActivityInput {
  id: string
  activityType: CalendarActivityType
  title: string
  description?: string
  scope: Extract<CalendarScope, 'workspace' | 'organization_unit' | 'selected_users' | 'user'>
  organizationUnitId?: string
  ownerUserId?: string
  targetUserIds?: readonly string[]
  locationId?: string
  startsAt: string
  endsAt: string
  allDay?: boolean
  blocksPlanning?: boolean
  countsAsWorkingActivity?: boolean
  appearsInReport?: boolean
  status?: CalendarActivityStatus
  createdByUserId: string
}

export interface CreateLeaveRequestInput {
  id: string
  userId: string
  type: LeaveRequestType
  startsAt: string
  endsAt: string
  status?: LeaveRequestStatus
  reason?: string
}

export interface LeaveRequestStatusPatch {
  status: LeaveRequestStatus
  decidedByUserId?: string
  decidedAt?: string
}

export interface CreateBusinessTripInput {
  id: string
  userId: string
  origin?: PlaceContext
  destination: PlaceContext
  startsAt: string
  endsAt: string
  purpose?: string
  transport?: string
  status?: BusinessTripStatus
}

export interface CalendarRepository {
  getWorkingCalendar(): Promise<WorkingCalendarConfig>
  updateWorkingCalendar(patch: {
    workingWeekdays?: readonly number[]
    timezone?: string
    updatedByUserId?: string
  }): Promise<WorkingCalendarConfig>
  listActivities(filter: CalendarActivityFilter): Promise<CalendarActivity[]>
  getActivity(activityId: string): Promise<CalendarActivity | null>
  createActivity(input: CreateCalendarActivityInput): Promise<CalendarActivity>
  cancelActivity(activityId: string): Promise<boolean>
  listLeaveRequests(filter: {
    userId?: string
    fromMs?: number
    toMs?: number
  }): Promise<LeaveRequest[]>
  createLeaveRequest(input: CreateLeaveRequestInput): Promise<LeaveRequest>
  updateLeaveRequestStatus(
    leaveRequestId: string,
    patch: LeaveRequestStatusPatch,
  ): Promise<LeaveRequest | null>
  listBusinessTrips(filter: { userId?: string; fromMs?: number; toMs?: number }): Promise<BusinessTrip[]>
  createBusinessTrip(input: CreateBusinessTripInput): Promise<BusinessTrip>
  updateBusinessTripStatus(
    tripId: string,
    status: BusinessTripStatus,
  ): Promise<BusinessTrip | null>
  listClosures(fromDate: string, toDate: string): Promise<CalendarClosure[]>
}

interface WorkingCalendarRow {
  workspace_id: string
  timezone: string
  working_weekdays_json: string
  updated_at: number
}

interface CalendarActivityRow {
  id: string
  workspace_id: string
  activity_type: CalendarActivityType
  title: string
  description: string | null
  scope_type: string
  organization_unit_id: string | null
  owner_user_id: string | null
  location_id: string | null
  starts_at: number
  ends_at: number
  all_day: number
  blocks_planning: number
  counts_as_working_activity: number
  appears_in_report: number
  status: CalendarActivityStatus
  created_by_user_id: string
  created_at: number
  updated_at: number
}

interface LeaveRequestRow {
  id: string
  workspace_id: string
  user_id: string
  leave_type: LeaveRequestType
  starts_at: number
  ends_at: number
  status: LeaveRequestStatus
  reason: string | null
  decided_by_user_id: string | null
  decided_at: number | null
  created_at: number
  updated_at: number
}

interface BusinessTripRow {
  id: string
  workspace_id: string
  user_id: string
  origin_json: string | null
  destination_json: string
  starts_at: number
  ends_at: number
  purpose: string | null
  transport: string | null
  status: BusinessTripStatus
  created_at: number
  updated_at: number
}

interface CalendarClosureRow {
  id: string
  workspace_id: string
  closure_level: 'company' | 'workspace'
  canonical_date: string
  label: string
  created_at: number
}

function isoOf(ms: number): string {
  return new Date(ms).toISOString()
}

function msOf(iso: string): number {
  return Date.parse(iso)
}

function parsePlace(json: string | null, fallback: () => PlaceContext): PlaceContext {
  if (json === null) return fallback()
  const parsed = JSON.parse(json) as PlaceContext
  return parsed
}

const WORKING_CALENDAR_SELECT = `SELECT
  workspace_id,
  timezone,
  working_weekdays_json,
  updated_at
FROM workspace_working_calendar`

const ACTIVITY_SELECT = `SELECT
  id,
  workspace_id,
  activity_type,
  title,
  description,
  scope_type,
  organization_unit_id,
  owner_user_id,
  location_id,
  starts_at,
  ends_at,
  all_day,
  blocks_planning,
  counts_as_working_activity,
  appears_in_report,
  status,
  created_by_user_id,
  created_at,
  updated_at
FROM calendar_activities`

const LEAVE_SELECT = `SELECT
  id,
  workspace_id,
  user_id,
  leave_type,
  starts_at,
  ends_at,
  status,
  reason,
  decided_by_user_id,
  decided_at,
  created_at,
  updated_at
FROM leave_requests`

const TRIP_SELECT = `SELECT
  id,
  workspace_id,
  user_id,
  origin_json,
  destination_json,
  starts_at,
  ends_at,
  purpose,
  transport,
  status,
  created_at,
  updated_at
FROM business_trips`

const CLOSURE_SELECT = `SELECT
  id,
  workspace_id,
  closure_level,
  canonical_date,
  label,
  created_at
FROM calendar_closures`

function mapWorkingCalendar(row: WorkingCalendarRow): WorkingCalendarConfig {
  return {
    workspaceId: row.workspace_id as WorkspaceId,
    timezone: row.timezone,
    workingWeekdays: JSON.parse(row.working_weekdays_json) as number[],
    updatedAt: isoOf(row.updated_at),
  }
}

function mapActivity(row: CalendarActivityRow, targetUserIds: readonly string[]): CalendarActivity {
  return {
    id: row.id,
    workspaceId: row.workspace_id as WorkspaceId,
    activityType: row.activity_type,
    title: row.title,
    ...(row.description === null ? {} : { description: row.description }),
    scope: row.scope_type as CalendarActivity['scope'],
    ...(row.organization_unit_id === null ? {} : { organizationUnitId: row.organization_unit_id }),
    ...(row.owner_user_id === null ? {} : { ownerUserId: row.owner_user_id }),
    targetUserIds: [...targetUserIds],
    ...(row.location_id === null ? {} : { locationId: row.location_id }),
    startsAt: isoOf(row.starts_at),
    endsAt: isoOf(row.ends_at),
    allDay: row.all_day === 1,
    blocksPlanning: row.blocks_planning === 1,
    countsAsWorkingActivity: row.counts_as_working_activity === 1,
    appearsInReport: row.appears_in_report === 1,
    status: row.status,
    createdByUserId: row.created_by_user_id,
    createdAt: isoOf(row.created_at),
    updatedAt: isoOf(row.updated_at),
  }
}

function mapLeaveRequest(row: LeaveRequestRow): LeaveRequest {
  return {
    id: row.id,
    workspaceId: row.workspace_id as WorkspaceId,
    userId: row.user_id,
    type: row.leave_type,
    startsAt: isoOf(row.starts_at),
    endsAt: isoOf(row.ends_at),
    status: row.status,
    ...(row.reason === null ? {} : { reason: row.reason }),
    ...(row.decided_by_user_id === null ? {} : { decidedByUserId: row.decided_by_user_id }),
    ...(row.decided_at === null ? {} : { decidedAt: isoOf(row.decided_at) }),
    createdAt: isoOf(row.created_at),
    updatedAt: isoOf(row.updated_at),
  }
}

function mapBusinessTrip(row: BusinessTripRow): BusinessTrip {
  return {
    id: row.id,
    workspaceId: row.workspace_id as WorkspaceId,
    userId: row.user_id,
    ...(row.origin_json === null
      ? {}
      : { origin: parsePlace(row.origin_json, () => ({ label: '' })) }),
    destination: parsePlace(row.destination_json, () => ({ label: '' })),
    startsAt: isoOf(row.starts_at),
    endsAt: isoOf(row.ends_at),
    ...(row.purpose === null ? {} : { purpose: row.purpose }),
    ...(row.transport === null ? {} : { transport: row.transport }),
    status: row.status,
    createdAt: isoOf(row.created_at),
    updatedAt: isoOf(row.updated_at),
  }
}

function mapClosure(row: CalendarClosureRow): CalendarClosure {
  return {
    id: row.id,
    workspaceId: row.workspace_id as WorkspaceId,
    level: row.closure_level,
    canonicalDate: row.canonical_date,
    label: row.label,
    createdAt: isoOf(row.created_at),
  }
}

const DEFAULT_WORKING_CALENDAR_ROW: WorkingCalendarRow = {
  workspace_id: '',
  timezone: 'Asia/Tehran',
  working_weekdays_json: '[0,1,2,3,4,5]',
  updated_at: 0,
}

export class WorkspaceCalendarRepository implements CalendarRepository {
  constructor(
    private readonly store: WorkspaceWritableDataStore,
    private readonly now: () => number = Date.now,
  ) {}

  async getWorkingCalendar(): Promise<WorkingCalendarConfig> {
    const row = await this.store.queryFirst<WorkingCalendarRow>(
      `${WORKING_CALENDAR_SELECT}
       WHERE workspace_id = ?
       LIMIT 1`,
      [this.store.workspaceId],
    )
    if (row === null) {
      return mapWorkingCalendar({ ...DEFAULT_WORKING_CALENDAR_ROW, workspace_id: this.store.workspaceId })
    }
    return mapWorkingCalendar(row)
  }

  async updateWorkingCalendar(patch: {
    workingWeekdays?: readonly number[]
    timezone?: string
    updatedByUserId?: string
  }): Promise<WorkingCalendarConfig> {
    const current = await this.getWorkingCalendar()
    const timezone = patch.timezone ?? current.timezone
    const weekdays = patch.workingWeekdays ?? current.workingWeekdays
    const now = this.now()
    await this.store.execute(
      `INSERT INTO workspace_working_calendar
         (workspace_id, timezone, working_weekdays_json, updated_by_user_id, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(workspace_id) DO UPDATE SET
         timezone = excluded.timezone,
         working_weekdays_json = excluded.working_weekdays_json,
         updated_by_user_id = excluded.updated_by_user_id,
         updated_at = excluded.updated_at`,
      [
        this.store.workspaceId,
        timezone,
        JSON.stringify(weekdays),
        patch.updatedByUserId ?? null,
        now,
      ],
    )
    return this.getWorkingCalendar()
  }

  async listActivities(filter: CalendarActivityFilter): Promise<CalendarActivity[]> {
    const rows = await this.store.queryAll<CalendarActivityRow>(
      `${ACTIVITY_SELECT}
       WHERE workspace_id = ?
         AND status <> 'cancelled'
         AND ends_at >= ?
         AND starts_at <= ?
       ORDER BY starts_at, id`,
      [this.store.workspaceId, filter.fromMs, filter.toMs],
    )
    return Promise.all(rows.map((row) => this.loadActivity(row)))
  }

  async getActivity(activityId: string): Promise<CalendarActivity | null> {
    const row = await this.store.queryFirst<CalendarActivityRow>(
      `${ACTIVITY_SELECT}
       WHERE workspace_id = ?
         AND id = ?
       LIMIT 1`,
      [this.store.workspaceId, activityId],
    )
    if (row === null) return null
    return this.loadActivity(row)
  }

  private async loadActivity(row: CalendarActivityRow): Promise<CalendarActivity> {
    const targetRows = await this.store.queryAll<{ user_id: string }>(
      `SELECT user_id FROM calendar_activity_targets
       WHERE workspace_id = ? AND activity_id = ?
       ORDER BY user_id`,
      [this.store.workspaceId, row.id],
    )
    return mapActivity(row, targetRows.map((target) => target.user_id))
  }

  async createActivity(input: CreateCalendarActivityInput): Promise<CalendarActivity> {
    const now = this.now()
    const targets = [...(input.targetUserIds ?? [])]
    if (input.scope === 'user' && input.ownerUserId !== undefined && !targets.includes(input.ownerUserId)) {
      targets.push(input.ownerUserId)
    }

    await this.store.execute(
      `INSERT INTO calendar_activities (
         id, workspace_id, activity_type, title, description, scope_type,
         organization_unit_id, owner_user_id, location_id, starts_at, ends_at,
         all_day, blocks_planning, counts_as_working_activity, appears_in_report,
         status, created_by_user_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.id,
        this.store.workspaceId,
        input.activityType,
        input.title,
        input.description ?? null,
        input.scope,
        input.organizationUnitId ?? null,
        input.ownerUserId ?? null,
        input.locationId ?? null,
        msOf(input.startsAt),
        msOf(input.endsAt),
        (input.allDay ?? false) ? 1 : 0,
        (input.blocksPlanning ?? false) ? 1 : 0,
        (input.countsAsWorkingActivity ?? true) ? 1 : 0,
        (input.appearsInReport ?? true) ? 1 : 0,
        input.status ?? 'confirmed',
        input.createdByUserId,
        now,
        now,
      ],
    )

    for (const targetUserId of targets) {
      await this.store.execute(
        `INSERT INTO calendar_activity_targets (activity_id, workspace_id, user_id)
         VALUES (?, ?, ?)`,
        [input.id, this.store.workspaceId, targetUserId],
      )
    }

    const created = await this.getActivity(input.id)
    if (created === null) throw new Error('calendar_activity_create_readback_failed')
    return created
  }

  async cancelActivity(activityId: string): Promise<boolean> {
    const result = await this.store.execute(
      `UPDATE calendar_activities
       SET status = 'cancelled', updated_at = ?
       WHERE workspace_id = ?
         AND id = ?
         AND status <> 'cancelled'`,
      [this.now(), this.store.workspaceId, activityId],
    )
    return result.success && result.changes > 0
  }

  async listLeaveRequests(filter: {
    userId?: string
    fromMs?: number
    toMs?: number
  }): Promise<LeaveRequest[]> {
    const predicates = ['workspace_id = ?']
    const values: unknown[] = [this.store.workspaceId]
    if (filter.userId !== undefined) {
      predicates.push('user_id = ?')
      values.push(filter.userId)
    }
    if (filter.fromMs !== undefined) {
      predicates.push('ends_at >= ?')
      values.push(filter.fromMs)
    }
    if (filter.toMs !== undefined) {
      predicates.push('starts_at <= ?')
      values.push(filter.toMs)
    }

    const rows = await this.store.queryAll<LeaveRequestRow>(
      `${LEAVE_SELECT}
       WHERE ${predicates.join('\n         AND ')}
       ORDER BY starts_at, id`,
      values,
    )
    return rows.map(mapLeaveRequest)
  }

  async createLeaveRequest(input: CreateLeaveRequestInput): Promise<LeaveRequest> {
    const now = this.now()
    await this.store.execute(
      `INSERT INTO leave_requests (
         id, workspace_id, user_id, leave_type, starts_at, ends_at, status,
         reason, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.id,
        this.store.workspaceId,
        input.userId,
        input.type,
        msOf(input.startsAt),
        msOf(input.endsAt),
        input.status ?? 'requested',
        input.reason ?? null,
        now,
        now,
      ],
    )

    const row = await this.store.queryFirst<LeaveRequestRow>(
      `${LEAVE_SELECT}
       WHERE workspace_id = ?
         AND id = ?
       LIMIT 1`,
      [this.store.workspaceId, input.id],
    )
    if (row === null) throw new Error('leave_request_create_readback_failed')
    return mapLeaveRequest(row)
  }

  async updateLeaveRequestStatus(
    leaveRequestId: string,
    patch: LeaveRequestStatusPatch,
  ): Promise<LeaveRequest | null> {
    const result = await this.store.execute(
      `UPDATE leave_requests
       SET status = ?, decided_by_user_id = ?, decided_at = ?, updated_at = ?
       WHERE workspace_id = ?
         AND id = ?`,
      [
        patch.status,
        patch.decidedByUserId ?? null,
        patch.decidedAt === undefined ? null : msOf(patch.decidedAt),
        this.now(),
        this.store.workspaceId,
        leaveRequestId,
      ],
    )
    if (!result.success || result.changes === 0) return null

    const row = await this.store.queryFirst<LeaveRequestRow>(
      `${LEAVE_SELECT}
       WHERE workspace_id = ?
         AND id = ?
       LIMIT 1`,
      [this.store.workspaceId, leaveRequestId],
    )
    return row === null ? null : mapLeaveRequest(row)
  }

  async listBusinessTrips(filter: {
    userId?: string
    fromMs?: number
    toMs?: number
  }): Promise<BusinessTrip[]> {
    const predicates = ['workspace_id = ?']
    const values: unknown[] = [this.store.workspaceId]
    if (filter.userId !== undefined) {
      predicates.push('user_id = ?')
      values.push(filter.userId)
    }
    if (filter.fromMs !== undefined) {
      predicates.push('ends_at >= ?')
      values.push(filter.fromMs)
    }
    if (filter.toMs !== undefined) {
      predicates.push('starts_at <= ?')
      values.push(filter.toMs)
    }

    const rows = await this.store.queryAll<BusinessTripRow>(
      `${TRIP_SELECT}
       WHERE ${predicates.join('\n         AND ')}
       ORDER BY starts_at, id`,
      values,
    )
    return rows.map(mapBusinessTrip)
  }

  async createBusinessTrip(input: CreateBusinessTripInput): Promise<BusinessTrip> {
    const now = this.now()
    await this.store.execute(
      `INSERT INTO business_trips (
         id, workspace_id, user_id, origin_json, destination_json, starts_at,
         ends_at, purpose, transport, status, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.id,
        this.store.workspaceId,
        input.userId,
        input.origin === undefined ? null : JSON.stringify(input.origin),
        JSON.stringify(input.destination),
        msOf(input.startsAt),
        msOf(input.endsAt),
        input.purpose ?? null,
        input.transport ?? null,
        input.status ?? 'planned',
        now,
        now,
      ],
    )

    const row = await this.store.queryFirst<BusinessTripRow>(
      `${TRIP_SELECT}
       WHERE workspace_id = ?
         AND id = ?
       LIMIT 1`,
      [this.store.workspaceId, input.id],
    )
    if (row === null) throw new Error('business_trip_create_readback_failed')
    return mapBusinessTrip(row)
  }

  async updateBusinessTripStatus(
    tripId: string,
    status: BusinessTripStatus,
  ): Promise<BusinessTrip | null> {
    const result = await this.store.execute(
      `UPDATE business_trips
       SET status = ?, updated_at = ?
       WHERE workspace_id = ?
         AND id = ?`,
      [status, this.now(), this.store.workspaceId, tripId],
    )
    if (!result.success || result.changes === 0) return null

    const row = await this.store.queryFirst<BusinessTripRow>(
      `${TRIP_SELECT}
       WHERE workspace_id = ?
         AND id = ?
       LIMIT 1`,
      [this.store.workspaceId, tripId],
    )
    return row === null ? null : mapBusinessTrip(row)
  }

  async listClosures(fromDate: string, toDate: string): Promise<CalendarClosure[]> {
    const rows = await this.store.queryAll<CalendarClosureRow>(
      `${CLOSURE_SELECT}
       WHERE workspace_id = ?
         AND canonical_date BETWEEN ? AND ?
       ORDER BY canonical_date, id`,
      [this.store.workspaceId, fromDate, toDate],
    )
    return rows.map(mapClosure)
  }
}

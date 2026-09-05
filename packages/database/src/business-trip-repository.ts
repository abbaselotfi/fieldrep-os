import {
  businessTripToCalendarItem,
  cancelOwnBusinessTrip,
  completeBusinessTrip,
  decideBusinessTrip,
  requestBusinessTrip,
  validateBusinessTrip,
  type BusinessTrip,
  type BusinessTripDestination,
  type BusinessTripDestinationId,
  type BusinessTripId,
  type BusinessTripTransport,
  type CalendarEventId,
  type UserId,
  type WorkspaceId,
} from '@fieldrep/domain'

import type { WorkspaceAtomicDataStore, WorkspaceWriteCommand } from './contracts'

export interface CreateBusinessTripInput {
  id: BusinessTripId
  calendarEventId: CalendarEventId
  userId: UserId
  originCity: string
  originProvince?: string | null
  purpose: string
  transport: BusinessTripTransport
  startsAt: number
  endsAt: number
  localStartDate: string
  localEndDate: string
  allDay: boolean
  blocksPlanning: boolean
  destinations: readonly BusinessTripDestination[]
}

export interface BusinessTripRepository {
  listOwn(userId: UserId, fromDate: string, toDate: string): Promise<BusinessTrip[]>
  getOwn(userId: UserId, tripId: BusinessTripId): Promise<BusinessTrip | null>
  createDraft(input: CreateBusinessTripInput): Promise<BusinessTrip>
  submitOwn(userId: UserId, tripId: BusinessTripId): Promise<BusinessTrip | null>
  cancelOwn(userId: UserId, tripId: BusinessTripId): Promise<boolean>
  completeOwn(userId: UserId, tripId: BusinessTripId): Promise<BusinessTrip | null>
  decide(
    tripId: BusinessTripId,
    decision: 'approved' | 'rejected',
    decidedByUserId: UserId,
  ): Promise<BusinessTrip | null>
}

interface TripRow {
  id: string
  workspace_id: string
  user_id: string
  origin_city: string
  origin_province: string | null
  purpose: string
  transport: BusinessTrip['transport']
  starts_at: number
  ends_at: number
  local_start_date: string
  local_end_date: string
  all_day: number
  blocks_planning: number
  status: BusinessTrip['status']
  decided_by_user_id: string | null
  decided_at: number | null
  calendar_event_id: string
}

interface DestinationRow {
  id: string
  business_trip_id: string
  sequence: number
  city: string
  province: string | null
  address: string | null
  starts_at: number | null
  ends_at: number | null
}

export class WorkspaceBusinessTripRepository implements BusinessTripRepository {
  constructor(
    private readonly store: WorkspaceAtomicDataStore,
    private readonly now: () => number = Date.now,
  ) {}

  async listOwn(userId: UserId, fromDate: string, toDate: string): Promise<BusinessTrip[]> {
    const rows = await this.store.queryAll<TripRow>(
      `${TRIP_SELECT}
       WHERE t.workspace_id = ? AND t.user_id = ?
         AND t.local_start_date <= ? AND t.local_end_date >= ?
       ORDER BY t.starts_at, t.id`,
      [this.store.workspaceId, userId, toDate, fromDate],
    )
    const result: BusinessTrip[] = []
    for (const row of rows) result.push(await this.hydrate(row))
    return result
  }

  async getOwn(userId: UserId, tripId: BusinessTripId): Promise<BusinessTrip | null> {
    const row = await this.store.queryFirst<TripRow>(
      `${TRIP_SELECT}
       WHERE t.workspace_id = ? AND t.user_id = ? AND t.id = ?
       LIMIT 1`,
      [this.store.workspaceId, userId, tripId],
    )
    return row === null ? null : this.hydrate(row)
  }

  async createDraft(input: CreateBusinessTripInput): Promise<BusinessTrip> {
    const trip: BusinessTrip = {
      id: input.id,
      workspaceId: this.store.workspaceId,
      userId: input.userId,
      originCity: input.originCity.trim(),
      originProvince: input.originProvince?.trim() || null,
      purpose: input.purpose.trim(),
      transport: input.transport,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      localStartDate: input.localStartDate,
      localEndDate: input.localEndDate,
      allDay: input.allDay,
      blocksPlanning: input.blocksPlanning,
      status: 'draft',
      destinations: input.destinations.map((destination) => ({
        ...destination,
        city: destination.city.trim(),
        province: destination.province?.trim() || null,
        address: destination.address?.trim() || null,
      })),
      decidedByUserId: null,
      decidedAt: null,
    }
    validateBusinessTrip(trip)
    const item = businessTripToCalendarItem(trip, input.calendarEventId)
    const now = this.now()
    const commands: WorkspaceWriteCommand[] = [
      {
        query: `INSERT INTO business_trips (
          id, workspace_id, user_id, origin_city, origin_province, purpose, transport,
          starts_at, ends_at, local_start_date, local_end_date, all_day, blocks_planning,
          status, decided_by_user_id, decided_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', NULL, NULL, ?, ?)`,
        values: [
          trip.id, trip.workspaceId, trip.userId, trip.originCity, trip.originProvince,
          trip.purpose, trip.transport, trip.startsAt, trip.endsAt, trip.localStartDate,
          trip.localEndDate, trip.allDay ? 1 : 0, trip.blocksPlanning ? 1 : 0, now, now,
        ],
      },
    ]

    for (const destination of trip.destinations) {
      commands.push({
        query: `INSERT INTO business_trip_destinations (
          id, workspace_id, business_trip_id, sequence, city, province, address,
          starts_at, ends_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values: [
          destination.id, trip.workspaceId, trip.id, destination.sequence, destination.city,
          destination.province, destination.address, destination.startsAt, destination.endsAt, now, now,
        ],
      })
    }

    commands.push(
      {
        query: `INSERT INTO calendar_events (
          id, workspace_id, event_type, source_entity_type, source_entity_id,
          title, starts_at, ends_at, local_start_date, local_end_date, all_day,
          scope_type, scope_id, blocks_planning, counts_as_working_activity,
          counts_as_visit, appears_in_report, status, location_text, created_at, updated_at
        ) VALUES (?, ?, 'business_trip', 'business_trip', ?, ?, ?, ?, ?, ?, ?, 'user', ?, 0, 0, 0, 1, 'draft', ?, ?, ?)`,
        values: [
          item.id, item.workspaceId, item.sourceId, item.title, item.startsAt, item.endsAt,
          item.localStartDate, item.localEndDate, item.allDay ? 1 : 0, trip.userId,
          item.locationText, now, now,
        ],
      },
      {
        query: `INSERT INTO calendar_event_attendees (
          event_id, workspace_id, user_id, attendance_role, response_status, created_at, updated_at
        ) VALUES (?, ?, ?, 'owner', 'accepted', ?, ?)`,
        values: [item.id, item.workspaceId, trip.userId, now, now],
      },
    )

    const results = await this.store.executeBatch(commands)
    if (results.some((result) => !result.success)) throw new Error('business_trip_create_batch_failed')
    return trip
  }

  async submitOwn(userId: UserId, tripId: BusinessTripId): Promise<BusinessTrip | null> {
    const current = await this.getOwn(userId, tripId)
    if (current === null) return null
    const requested = requestBusinessTrip(current)
    const now = this.now()
    const results = await this.store.executeBatch([
      {
        query: `UPDATE business_trips SET status = 'requested', updated_at = ?
          WHERE workspace_id = ? AND user_id = ? AND id = ? AND status = 'draft'`,
        values: [now, this.store.workspaceId, userId, tripId],
      },
      {
        query: `UPDATE calendar_events
          SET status = 'scheduled', blocks_planning = 0, counts_as_working_activity = 0,
              counts_as_visit = 0, updated_at = ?
          WHERE workspace_id = ? AND source_entity_type = 'business_trip' AND source_entity_id = ?`,
        values: [now, this.store.workspaceId, tripId],
      },
    ])
    if (results.some((result) => !result.success)) throw new Error('business_trip_submit_batch_failed')
    if (results.some((result) => result.changes === 0)) return null
    return requested
  }

  async cancelOwn(userId: UserId, tripId: BusinessTripId): Promise<boolean> {
    const current = await this.getOwn(userId, tripId)
    if (current === null) return false
    cancelOwnBusinessTrip(current)
    const now = this.now()
    const results = await this.store.executeBatch([
      {
        query: `UPDATE business_trips SET status = 'cancelled', updated_at = ?
          WHERE workspace_id = ? AND user_id = ? AND id = ? AND status IN ('draft', 'requested')`,
        values: [now, this.store.workspaceId, userId, tripId],
      },
      {
        query: `UPDATE calendar_events
          SET status = 'cancelled', blocks_planning = 0, counts_as_working_activity = 0,
              counts_as_visit = 0, updated_at = ?
          WHERE workspace_id = ? AND source_entity_type = 'business_trip' AND source_entity_id = ?`,
        values: [now, this.store.workspaceId, tripId],
      },
    ])
    if (results.some((result) => !result.success)) throw new Error('business_trip_cancel_batch_failed')
    return results.every((result) => result.changes > 0)
  }

  async completeOwn(userId: UserId, tripId: BusinessTripId): Promise<BusinessTrip | null> {
    const current = await this.getOwn(userId, tripId)
    if (current === null) return null
    const completed = completeBusinessTrip(current)
    const now = this.now()
    const results = await this.store.executeBatch([
      {
        query: `UPDATE business_trips SET status = 'completed', updated_at = ?
          WHERE workspace_id = ? AND user_id = ? AND id = ? AND status = 'approved'`,
        values: [now, this.store.workspaceId, userId, tripId],
      },
      {
        query: `UPDATE calendar_events
          SET status = 'completed', blocks_planning = 0, counts_as_working_activity = 1,
              counts_as_visit = 0, appears_in_report = 1, updated_at = ?
          WHERE workspace_id = ? AND source_entity_type = 'business_trip' AND source_entity_id = ?`,
        values: [now, this.store.workspaceId, tripId],
      },
    ])
    if (results.some((result) => !result.success)) throw new Error('business_trip_complete_batch_failed')
    if (results.some((result) => result.changes === 0)) return null
    return completed
  }

  async decide(
    tripId: BusinessTripId,
    decision: 'approved' | 'rejected',
    decidedByUserId: UserId,
  ): Promise<BusinessTrip | null> {
    const row = await this.store.queryFirst<TripRow>(
      `${TRIP_SELECT} WHERE t.workspace_id = ? AND t.id = ? LIMIT 1`,
      [this.store.workspaceId, tripId],
    )
    if (row === null) return null
    const current = await this.hydrate(row)
    const decidedAt = this.now()
    const decided = decideBusinessTrip(current, decision, decidedByUserId, decidedAt)
    const approved = decision === 'approved'
    const results = await this.store.executeBatch([
      {
        query: `UPDATE business_trips
          SET status = ?, decided_by_user_id = ?, decided_at = ?, updated_at = ?
          WHERE workspace_id = ? AND id = ? AND status = 'requested'`,
        values: [decision, decidedByUserId, decidedAt, decidedAt, this.store.workspaceId, tripId],
      },
      {
        query: `UPDATE calendar_events
          SET status = ?, blocks_planning = ?, counts_as_working_activity = ?,
              counts_as_visit = 0, appears_in_report = ?, updated_at = ?
          WHERE workspace_id = ? AND source_entity_type = 'business_trip' AND source_entity_id = ?`,
        values: [
          approved ? 'active' : 'cancelled',
          approved && current.blocksPlanning ? 1 : 0,
          approved ? 1 : 0,
          approved ? 1 : 0,
          decidedAt,
          this.store.workspaceId,
          tripId,
        ],
      },
    ])
    if (results.some((result) => !result.success)) throw new Error('business_trip_decision_batch_failed')
    if (results.some((result) => result.changes === 0)) return null
    return decided
  }

  private async hydrate(row: TripRow): Promise<BusinessTrip> {
    const destinationRows = await this.store.queryAll<DestinationRow>(
      `SELECT id, business_trip_id, sequence, city, province, address, starts_at, ends_at
       FROM business_trip_destinations
       WHERE workspace_id = ? AND business_trip_id = ?
       ORDER BY sequence, id`,
      [this.store.workspaceId, row.id],
    )
    return mapTrip(row, destinationRows)
  }
}

const TRIP_SELECT = `SELECT
  t.id, t.workspace_id, t.user_id, t.origin_city, t.origin_province, t.purpose,
  t.transport, t.starts_at, t.ends_at, t.local_start_date, t.local_end_date,
  t.all_day, t.blocks_planning, t.status, t.decided_by_user_id, t.decided_at,
  ce.id AS calendar_event_id
FROM business_trips t
JOIN calendar_events ce
  ON ce.workspace_id = t.workspace_id
 AND ce.source_entity_type = 'business_trip'
 AND ce.source_entity_id = t.id`

function mapTrip(row: TripRow, destinations: readonly DestinationRow[]): BusinessTrip {
  return {
    id: row.id as BusinessTripId,
    workspaceId: row.workspace_id as WorkspaceId,
    userId: row.user_id as UserId,
    originCity: row.origin_city,
    originProvince: row.origin_province,
    purpose: row.purpose,
    transport: row.transport,
    startsAt: Number(row.starts_at),
    endsAt: Number(row.ends_at),
    localStartDate: row.local_start_date,
    localEndDate: row.local_end_date,
    allDay: Number(row.all_day) === 1,
    blocksPlanning: Number(row.blocks_planning) === 1,
    status: row.status,
    destinations: destinations.map((destination) => ({
      id: destination.id as BusinessTripDestinationId,
      sequence: Number(destination.sequence),
      city: destination.city,
      province: destination.province,
      address: destination.address,
      startsAt: destination.starts_at === null ? null : Number(destination.starts_at),
      endsAt: destination.ends_at === null ? null : Number(destination.ends_at),
    })),
    decidedByUserId: row.decided_by_user_id as UserId | null,
    decidedAt: row.decided_at === null ? null : Number(row.decided_at),
  }
}

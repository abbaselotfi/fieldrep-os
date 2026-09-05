import {
  activityToCalendarItem,
  validateActivity,
  type Activity,
  type ActivityId,
  type CalendarEventId,
  type CalendarScope,
  type UserId,
  type WorkspaceId,
} from '@fieldrep/domain'

import type { WorkspaceAtomicDataStore } from './contracts'

export interface CreateActivityInput extends Omit<Activity, 'workspaceId'> {
  calendarEventId: CalendarEventId
}

export interface UpdateActivityInput {
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
  status?: Activity['status']
  locationText?: string | null
}

export interface CalendarActivityRepository {
  listOwnActivities(ownerUserId: UserId, fromDate: string, toDate: string): Promise<Activity[]>
  getOwnActivity(ownerUserId: UserId, activityId: ActivityId): Promise<Activity | null>
  createActivity(input: CreateActivityInput): Promise<Activity>
  updateOwnActivity(
    ownerUserId: UserId,
    activityId: ActivityId,
    patch: UpdateActivityInput,
  ): Promise<Activity | null>
  cancelOwnActivity(ownerUserId: UserId, activityId: ActivityId): Promise<boolean>
}

interface ActivityRow {
  id: string
  workspace_id: string
  created_by_user_id: string
  owner_user_id: string | null
  activity_type: Activity['type']
  title: string
  description: string | null
  starts_at: number
  ends_at: number
  local_start_date: string
  local_end_date: string
  all_day: number
  scope_type: CalendarScope['type']
  scope_id: string | null
  blocks_planning: number
  counts_as_working_activity: number
  appears_in_report: number
  status: Activity['status']
  location_text: string | null
  calendar_event_id: string
}

interface AttendeeRow {
  user_id: string
}

/**
 * Persists authoritative generic Activities and their Calendar projections.
 * Calendar rows are projections only: every Activity write keeps
 * counts_as_visit=0 and never participates in Visit/Frequency/Achievement truth.
 */
export class WorkspaceCalendarActivityRepository implements CalendarActivityRepository {
  constructor(
    private readonly store: WorkspaceAtomicDataStore,
    private readonly now: () => number = Date.now,
  ) {}

  async listOwnActivities(
    ownerUserId: UserId,
    fromDate: string,
    toDate: string,
  ): Promise<Activity[]> {
    const rows = await this.store.queryAll<ActivityRow>(
      `${ACTIVITY_SELECT}
       WHERE a.workspace_id = ?
         AND a.owner_user_id = ?
         AND a.local_start_date <= ?
         AND a.local_end_date >= ?
         AND a.status <> 'cancelled'
       ORDER BY a.starts_at, a.id`,
      [this.store.workspaceId, ownerUserId, toDate, fromDate],
    )

    return Promise.all(rows.map((row) => this.hydrateActivity(row)))
  }

  async getOwnActivity(ownerUserId: UserId, activityId: ActivityId): Promise<Activity | null> {
    const row = await this.store.queryFirst<ActivityRow>(
      `${ACTIVITY_SELECT}
       WHERE a.workspace_id = ?
         AND a.owner_user_id = ?
         AND a.id = ?
       LIMIT 1`,
      [this.store.workspaceId, ownerUserId, activityId],
    )

    return row === null ? null : this.hydrateActivity(row)
  }

  async createActivity(input: CreateActivityInput): Promise<Activity> {
    const activity: Activity = {
      id: input.id,
      workspaceId: this.store.workspaceId,
      createdByUserId: input.createdByUserId,
      ownerUserId: input.ownerUserId,
      type: input.type,
      title: input.title,
      description: input.description,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      localStartDate: input.localStartDate,
      localEndDate: input.localEndDate,
      allDay: input.allDay,
      scope: input.scope,
      attendeeUserIds: [...input.attendeeUserIds],
      blocksPlanning: input.blocksPlanning,
      countsAsWorkingActivity: input.countsAsWorkingActivity,
      appearsInReport: input.appearsInReport,
      status: input.status,
      locationText: input.locationText,
    }

    validateActivity(activity)
    const calendarItem = activityToCalendarItem(activity, input.calendarEventId)
    const now = this.now()

    const commands = [
      {
        query: `INSERT INTO activities (
          id, workspace_id, created_by_user_id, owner_user_id, activity_type,
          title, description, starts_at, ends_at, local_start_date, local_end_date,
          all_day, scope_type, scope_id, blocks_planning, counts_as_working_activity,
          appears_in_report, status, location_text, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values: [
          activity.id,
          activity.workspaceId,
          activity.createdByUserId,
          activity.ownerUserId,
          activity.type,
          activity.title.trim(),
          activity.description,
          activity.startsAt,
          activity.endsAt,
          activity.localStartDate,
          activity.localEndDate,
          activity.allDay ? 1 : 0,
          activity.scope.type,
          activity.scope.id,
          activity.blocksPlanning ? 1 : 0,
          activity.countsAsWorkingActivity ? 1 : 0,
          activity.appearsInReport ? 1 : 0,
          activity.status,
          activity.locationText,
          now,
          now,
        ],
      },
      {
        query: `INSERT INTO calendar_events (
          id, workspace_id, event_type, source_entity_type, source_entity_id,
          title, starts_at, ends_at, local_start_date, local_end_date, all_day,
          scope_type, scope_id, blocks_planning, counts_as_working_activity,
          counts_as_visit, appears_in_report, status, location_text, created_at, updated_at
        ) VALUES (?, ?, ?, 'activity', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
        values: [
          calendarItem.id,
          calendarItem.workspaceId,
          calendarItem.type,
          calendarItem.sourceId,
          calendarItem.title.trim(),
          calendarItem.startsAt,
          calendarItem.endsAt,
          calendarItem.localStartDate,
          calendarItem.localEndDate,
          calendarItem.allDay ? 1 : 0,
          calendarItem.scope.type,
          calendarItem.scope.id,
          calendarItem.behavior.blocksPlanning ? 1 : 0,
          calendarItem.behavior.countsAsWorkingActivity ? 1 : 0,
          calendarItem.behavior.appearsInReport ? 1 : 0,
          calendarItem.status,
          calendarItem.locationText,
          now,
          now,
        ],
      },
      ...calendarItem.attendeeUserIds.map((attendeeUserId) => ({
        query: `INSERT INTO calendar_event_attendees (
          event_id, workspace_id, user_id, attendance_role, response_status,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'none', ?, ?)`,
        values: [
          calendarItem.id,
          calendarItem.workspaceId,
          attendeeUserId,
          activity.ownerUserId === attendeeUserId ? 'owner' : 'attendee',
          now,
          now,
        ],
      })),
    ]

    const results = await this.store.executeBatch(commands)
    if (results.some((result) => !result.success)) {
      throw new Error('calendar_activity_create_batch_failed')
    }

    return activity
  }

  async updateOwnActivity(
    ownerUserId: UserId,
    activityId: ActivityId,
    patch: UpdateActivityInput,
  ): Promise<Activity | null> {
    const current = await this.getOwnActivity(ownerUserId, activityId)
    if (current === null || current.status === 'cancelled') return null

    const updated: Activity = {
      ...current,
      ...(patch.title === undefined ? {} : { title: patch.title }),
      ...(patch.description === undefined ? {} : { description: patch.description }),
      ...(patch.startsAt === undefined ? {} : { startsAt: patch.startsAt }),
      ...(patch.endsAt === undefined ? {} : { endsAt: patch.endsAt }),
      ...(patch.localStartDate === undefined ? {} : { localStartDate: patch.localStartDate }),
      ...(patch.localEndDate === undefined ? {} : { localEndDate: patch.localEndDate }),
      ...(patch.allDay === undefined ? {} : { allDay: patch.allDay }),
      ...(patch.blocksPlanning === undefined ? {} : { blocksPlanning: patch.blocksPlanning }),
      ...(patch.countsAsWorkingActivity === undefined
        ? {}
        : { countsAsWorkingActivity: patch.countsAsWorkingActivity }),
      ...(patch.appearsInReport === undefined ? {} : { appearsInReport: patch.appearsInReport }),
      ...(patch.status === undefined ? {} : { status: patch.status }),
      ...(patch.locationText === undefined ? {} : { locationText: patch.locationText }),
    }

    validateActivity(updated)
    const now = this.now()
    const results = await this.store.executeBatch([
      {
        query: `UPDATE activities SET
          title = ?, description = ?, starts_at = ?, ends_at = ?,
          local_start_date = ?, local_end_date = ?, all_day = ?,
          blocks_planning = ?, counts_as_working_activity = ?, appears_in_report = ?,
          status = ?, location_text = ?, updated_at = ?
        WHERE workspace_id = ? AND owner_user_id = ? AND id = ? AND status <> 'cancelled'`,
        values: [
          updated.title.trim(),
          updated.description,
          updated.startsAt,
          updated.endsAt,
          updated.localStartDate,
          updated.localEndDate,
          updated.allDay ? 1 : 0,
          updated.blocksPlanning ? 1 : 0,
          updated.countsAsWorkingActivity ? 1 : 0,
          updated.appearsInReport ? 1 : 0,
          updated.status,
          updated.locationText,
          now,
          this.store.workspaceId,
          ownerUserId,
          activityId,
        ],
      },
      {
        query: `UPDATE calendar_events SET
          title = ?, starts_at = ?, ends_at = ?, local_start_date = ?, local_end_date = ?,
          all_day = ?, blocks_planning = ?, counts_as_working_activity = ?,
          counts_as_visit = 0, appears_in_report = ?, status = ?, location_text = ?, updated_at = ?
        WHERE workspace_id = ? AND source_entity_type = 'activity' AND source_entity_id = ?`,
        values: [
          updated.title.trim(),
          updated.startsAt,
          updated.endsAt,
          updated.localStartDate,
          updated.localEndDate,
          updated.allDay ? 1 : 0,
          updated.blocksPlanning ? 1 : 0,
          updated.countsAsWorkingActivity ? 1 : 0,
          updated.appearsInReport ? 1 : 0,
          updated.status,
          updated.locationText,
          now,
          this.store.workspaceId,
          activityId,
        ],
      },
    ])

    if (results.some((result) => !result.success)) {
      throw new Error('calendar_activity_update_batch_failed')
    }
    if (results[0]?.changes === 0 || results[1]?.changes === 0) return null
    return updated
  }

  async cancelOwnActivity(ownerUserId: UserId, activityId: ActivityId): Promise<boolean> {
    const now = this.now()
    const results = await this.store.executeBatch([
      {
        query: `UPDATE activities
         SET status = 'cancelled', updated_at = ?
         WHERE workspace_id = ? AND owner_user_id = ? AND id = ? AND status <> 'cancelled'`,
        values: [now, this.store.workspaceId, ownerUserId, activityId],
      },
      {
        query: `UPDATE calendar_events
         SET status = 'cancelled', counts_as_visit = 0, updated_at = ?
         WHERE workspace_id = ? AND source_entity_type = 'activity' AND source_entity_id = ?
           AND status <> 'cancelled'`,
        values: [now, this.store.workspaceId, activityId],
      },
    ])

    if (results.some((result) => !result.success)) {
      throw new Error('calendar_activity_cancel_batch_failed')
    }
    return (results[0]?.changes ?? 0) > 0 && (results[1]?.changes ?? 0) > 0
  }

  private async hydrateActivity(row: ActivityRow): Promise<Activity> {
    const attendees = await this.store.queryAll<AttendeeRow>(
      `SELECT user_id
       FROM calendar_event_attendees
       WHERE workspace_id = ? AND event_id = ?
       ORDER BY user_id`,
      [this.store.workspaceId, row.calendar_event_id],
    )

    return {
      id: row.id as ActivityId,
      workspaceId: row.workspace_id as WorkspaceId,
      createdByUserId: row.created_by_user_id as UserId,
      ownerUserId: row.owner_user_id as UserId | null,
      type: row.activity_type,
      title: row.title,
      description: row.description,
      startsAt: Number(row.starts_at),
      endsAt: Number(row.ends_at),
      localStartDate: row.local_start_date,
      localEndDate: row.local_end_date,
      allDay: Number(row.all_day) === 1,
      scope: mapScope(row.scope_type, row.scope_id),
      attendeeUserIds: attendees.map((attendee) => attendee.user_id as UserId),
      blocksPlanning: Number(row.blocks_planning) === 1,
      countsAsWorkingActivity: Number(row.counts_as_working_activity) === 1,
      appearsInReport: Number(row.appears_in_report) === 1,
      status: row.status,
      locationText: row.location_text,
    }
  }
}

const ACTIVITY_SELECT = `SELECT
  a.id,
  a.workspace_id,
  a.created_by_user_id,
  a.owner_user_id,
  a.activity_type,
  a.title,
  a.description,
  a.starts_at,
  a.ends_at,
  a.local_start_date,
  a.local_end_date,
  a.all_day,
  a.scope_type,
  a.scope_id,
  a.blocks_planning,
  a.counts_as_working_activity,
  a.appears_in_report,
  a.status,
  a.location_text,
  ce.id AS calendar_event_id
FROM activities a
JOIN calendar_events ce
  ON ce.workspace_id = a.workspace_id
 AND ce.source_entity_type = 'activity'
 AND ce.source_entity_id = a.id`

function mapScope(type: CalendarScope['type'], id: string | null): CalendarScope {
  switch (type) {
    case 'platform':
      return { type, id: null }
    case 'selected_users':
      return { type, id: null }
    case 'company':
      if (id === null) throw new Error('calendar_scope_id_missing')
      return { type, id }
    case 'workspace':
      if (id === null) throw new Error('calendar_scope_id_missing')
      return { type, id: id as WorkspaceId }
    case 'organization_unit':
      if (id === null) throw new Error('calendar_scope_id_missing')
      return { type, id }
    case 'user':
      if (id === null) throw new Error('calendar_scope_id_missing')
      return { type, id: id as UserId }
  }
}

import {
  activityToCalendarItem,
  validateActivity,
  type Activity,
  type CalendarEventId,
} from '@fieldrep/domain'

import type { WorkspaceAtomicDataStore } from './contracts'

export interface CreateActivityInput extends Omit<Activity, 'workspaceId'> {
  calendarEventId: CalendarEventId
}

export interface CalendarActivityRepository {
  createActivity(input: CreateActivityInput): Promise<Activity>
}

/**
 * Persists the authoritative generic Activity and its Calendar projection in one
 * workspace-local atomic batch. Calendar rows are projections only: this
 * repository always writes counts_as_visit=0.
 */
export class WorkspaceCalendarActivityRepository implements CalendarActivityRepository {
  constructor(
    private readonly store: WorkspaceAtomicDataStore,
    private readonly now: () => number = Date.now,
  ) {}

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
}

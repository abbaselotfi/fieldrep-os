import {
  cancelOwnLeaveRequest,
  decideLeaveRequest,
  leaveToCalendarItem,
  submitLeaveRequest,
  validateLeaveRequest,
  type CalendarEventId,
  type LeaveRequest,
  type LeaveRequestId,
  type LeaveType,
  type UserId,
  type WorkspaceId,
} from '@fieldrep/domain'

import type { WorkspaceAtomicDataStore } from './contracts'

export interface CreateLeaveRequestInput {
  id: LeaveRequestId
  calendarEventId: CalendarEventId
  userId: UserId
  type: LeaveType
  startsAt: number
  endsAt: number
  localStartDate: string
  localEndDate: string
  allDay: boolean
  reason?: string | null
}

export interface LeaveRequestRepository {
  listOwn(userId: UserId, fromDate: string, toDate: string): Promise<LeaveRequest[]>
  getOwn(userId: UserId, leaveId: LeaveRequestId): Promise<LeaveRequest | null>
  createDraft(input: CreateLeaveRequestInput): Promise<LeaveRequest>
  submitOwn(userId: UserId, leaveId: LeaveRequestId): Promise<LeaveRequest | null>
  cancelOwn(userId: UserId, leaveId: LeaveRequestId): Promise<boolean>
  decide(
    leaveId: LeaveRequestId,
    decision: 'approved' | 'rejected',
    decidedByUserId: UserId,
  ): Promise<LeaveRequest | null>
}

interface LeaveRow {
  id: string
  workspace_id: string
  user_id: string
  leave_type: LeaveRequest['type']
  starts_at: number
  ends_at: number
  local_start_date: string
  local_end_date: string
  all_day: number
  reason: string | null
  status: LeaveRequest['status']
  decided_by_user_id: string | null
  decided_at: number | null
  calendar_event_id: string
}

export class WorkspaceLeaveRequestRepository implements LeaveRequestRepository {
  constructor(
    private readonly store: WorkspaceAtomicDataStore,
    private readonly now: () => number = Date.now,
  ) {}

  async listOwn(userId: UserId, fromDate: string, toDate: string): Promise<LeaveRequest[]> {
    const rows = await this.store.queryAll<LeaveRow>(
      `${LEAVE_SELECT}
       WHERE l.workspace_id = ? AND l.user_id = ?
         AND l.local_start_date <= ? AND l.local_end_date >= ?
       ORDER BY l.starts_at, l.id`,
      [this.store.workspaceId, userId, toDate, fromDate],
    )
    return rows.map(mapLeave)
  }

  async getOwn(userId: UserId, leaveId: LeaveRequestId): Promise<LeaveRequest | null> {
    const row = await this.store.queryFirst<LeaveRow>(
      `${LEAVE_SELECT}
       WHERE l.workspace_id = ? AND l.user_id = ? AND l.id = ?
       LIMIT 1`,
      [this.store.workspaceId, userId, leaveId],
    )
    return row === null ? null : mapLeave(row)
  }

  async createDraft(input: CreateLeaveRequestInput): Promise<LeaveRequest> {
    const leave: LeaveRequest = {
      id: input.id,
      workspaceId: this.store.workspaceId,
      userId: input.userId,
      type: input.type,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      localStartDate: input.localStartDate,
      localEndDate: input.localEndDate,
      allDay: input.allDay,
      reason: input.reason ?? null,
      status: 'draft',
      decidedByUserId: null,
      decidedAt: null,
    }
    validateLeaveRequest(leave)
    const item = leaveToCalendarItem(leave, input.calendarEventId)
    const now = this.now()

    const results = await this.store.executeBatch([
      {
        query: `INSERT INTO leave_requests (
          id, workspace_id, user_id, leave_type, starts_at, ends_at,
          local_start_date, local_end_date, all_day, reason, status,
          decided_by_user_id, decided_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', NULL, NULL, ?, ?)`,
        values: [
          leave.id,
          leave.workspaceId,
          leave.userId,
          leave.type,
          leave.startsAt,
          leave.endsAt,
          leave.localStartDate,
          leave.localEndDate,
          leave.allDay ? 1 : 0,
          leave.reason,
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
        ) VALUES (?, ?, 'leave', 'leave_request', ?, ?, ?, ?, ?, ?, ?, 'user', ?, 0, 0, 0, 1, 'draft', NULL, ?, ?)`,
        values: [
          item.id,
          item.workspaceId,
          item.sourceId,
          item.title,
          item.startsAt,
          item.endsAt,
          item.localStartDate,
          item.localEndDate,
          item.allDay ? 1 : 0,
          leave.userId,
          now,
          now,
        ],
      },
      {
        query: `INSERT INTO calendar_event_attendees (
          event_id, workspace_id, user_id, attendance_role, response_status, created_at, updated_at
        ) VALUES (?, ?, ?, 'owner', 'accepted', ?, ?)`,
        values: [item.id, item.workspaceId, leave.userId, now, now],
      },
    ])

    if (results.some((result) => !result.success)) throw new Error('leave_create_batch_failed')
    return leave
  }

  async submitOwn(userId: UserId, leaveId: LeaveRequestId): Promise<LeaveRequest | null> {
    const current = await this.getOwn(userId, leaveId)
    if (current === null) return null
    const submitted = submitLeaveRequest(current)
    const now = this.now()

    const results = await this.store.executeBatch([
      {
        query: `UPDATE leave_requests
          SET status = 'requested', updated_at = ?
          WHERE workspace_id = ? AND user_id = ? AND id = ? AND status = 'draft'`,
        values: [now, this.store.workspaceId, userId, leaveId],
      },
      {
        query: `UPDATE calendar_events
          SET status = 'scheduled', blocks_planning = 0, counts_as_visit = 0, updated_at = ?
          WHERE workspace_id = ? AND source_entity_type = 'leave_request' AND source_entity_id = ?`,
        values: [now, this.store.workspaceId, leaveId],
      },
    ])

    if (results.some((result) => !result.success)) throw new Error('leave_submit_batch_failed')
    if (results[0]?.changes === 0 || results[1]?.changes === 0) return null
    return submitted
  }

  async cancelOwn(userId: UserId, leaveId: LeaveRequestId): Promise<boolean> {
    const current = await this.getOwn(userId, leaveId)
    if (current === null) return false
    cancelOwnLeaveRequest(current)
    const now = this.now()

    const results = await this.store.executeBatch([
      {
        query: `UPDATE leave_requests
          SET status = 'cancelled', updated_at = ?
          WHERE workspace_id = ? AND user_id = ? AND id = ? AND status IN ('draft', 'requested')`,
        values: [now, this.store.workspaceId, userId, leaveId],
      },
      {
        query: `UPDATE calendar_events
          SET status = 'cancelled', blocks_planning = 0, counts_as_visit = 0, updated_at = ?
          WHERE workspace_id = ? AND source_entity_type = 'leave_request' AND source_entity_id = ?`,
        values: [now, this.store.workspaceId, leaveId],
      },
    ])

    if (results.some((result) => !result.success)) throw new Error('leave_cancel_batch_failed')
    return (results[0]?.changes ?? 0) > 0 && (results[1]?.changes ?? 0) > 0
  }

  async decide(
    leaveId: LeaveRequestId,
    decision: 'approved' | 'rejected',
    decidedByUserId: UserId,
  ): Promise<LeaveRequest | null> {
    const row = await this.store.queryFirst<LeaveRow>(
      `${LEAVE_SELECT}
       WHERE l.workspace_id = ? AND l.id = ?
       LIMIT 1`,
      [this.store.workspaceId, leaveId],
    )
    if (row === null) return null

    const current = mapLeave(row)
    const decidedAt = this.now()
    const decided = decideLeaveRequest(current, decision, decidedByUserId, decidedAt)
    const approved = decision === 'approved'

    const results = await this.store.executeBatch([
      {
        query: `UPDATE leave_requests
          SET status = ?, decided_by_user_id = ?, decided_at = ?, updated_at = ?
          WHERE workspace_id = ? AND id = ? AND status = 'requested'`,
        values: [
          decision,
          decidedByUserId,
          decidedAt,
          decidedAt,
          this.store.workspaceId,
          leaveId,
        ],
      },
      {
        query: `UPDATE calendar_events
          SET status = ?, blocks_planning = ?, counts_as_working_activity = 0,
              counts_as_visit = 0, appears_in_report = 1, updated_at = ?
          WHERE workspace_id = ? AND source_entity_type = 'leave_request' AND source_entity_id = ?`,
        values: [
          approved ? 'active' : 'cancelled',
          approved ? 1 : 0,
          decidedAt,
          this.store.workspaceId,
          leaveId,
        ],
      },
    ])

    if (results.some((result) => !result.success)) throw new Error('leave_decision_batch_failed')
    if (results[0]?.changes === 0 || results[1]?.changes === 0) return null
    return decided
  }
}

const LEAVE_SELECT = `SELECT
  l.id,
  l.workspace_id,
  l.user_id,
  l.leave_type,
  l.starts_at,
  l.ends_at,
  l.local_start_date,
  l.local_end_date,
  l.all_day,
  l.reason,
  l.status,
  l.decided_by_user_id,
  l.decided_at,
  ce.id AS calendar_event_id
FROM leave_requests l
JOIN calendar_events ce
  ON ce.workspace_id = l.workspace_id
 AND ce.source_entity_type = 'leave_request'
 AND ce.source_entity_id = l.id`

function mapLeave(row: LeaveRow): LeaveRequest {
  return {
    id: row.id as LeaveRequestId,
    workspaceId: row.workspace_id as WorkspaceId,
    userId: row.user_id as UserId,
    type: row.leave_type,
    startsAt: Number(row.starts_at),
    endsAt: Number(row.ends_at),
    localStartDate: row.local_start_date,
    localEndDate: row.local_end_date,
    allDay: Number(row.all_day) === 1,
    reason: row.reason,
    status: row.status,
    decidedByUserId: row.decided_by_user_id as UserId | null,
    decidedAt: row.decided_at === null ? null : Number(row.decided_at),
  }
}

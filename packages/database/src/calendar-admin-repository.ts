import type { CalendarClosure, CreateCalendarClosureInput, TargetsPolicy } from '@fieldrep/domain'
import { DEFAULT_TARGETS_POLICY, normalizeTargetsPolicy } from '@fieldrep/domain'

import type { WorkingCalendarConfig } from './calendar-repository'
import type { WorkspaceWritableDataStore } from './contracts'

/**
 * Calendar admin repository (P9-A4).
 *
 * Workspace-admin operations over migration-0007 tables + the generic
 * `workspace_settings` store (migration-0001): closures (holidays/events)
 * write side and targets policy (a JSON document under `planning:targets`).
 */

export const TARGETS_POLICY_SETTING_KEY = 'planning:targets'

export interface CalendarAdminRepository {
  getWorkingCalendar(): Promise<WorkingCalendarConfig>
  updateWorkingCalendar(patch: {
    workingWeekdays?: readonly number[]
    timezone?: string
    updatedByUserId?: string
  }): Promise<WorkingCalendarConfig>
  createClosure(input: CreateCalendarClosureInput): Promise<CalendarClosure>
  deleteClosure(closureId: string): Promise<boolean>
  getTargetsPolicy(): Promise<TargetsPolicy>
  updateTargetsPolicy(patch: Partial<TargetsPolicy>, updatedByUserId: string): Promise<TargetsPolicy>
}

interface SettingsRow {
  value_json: string
}

export class WorkspaceCalendarAdminRepository implements CalendarAdminRepository {
  constructor(
    private readonly store: WorkspaceWritableDataStore,
    private readonly now: () => number = Date.now,
  ) {}

  async getWorkingCalendar(): Promise<WorkingCalendarConfig> {
    const row = await this.store.queryFirst<{
      workspace_id: string
      timezone: string
      working_weekdays_json: string
      updated_at: number
    }>(
      `SELECT workspace_id, timezone, working_weekdays_json, updated_at
       FROM workspace_working_calendar
       WHERE workspace_id = ?
       LIMIT 1`,
      [this.store.workspaceId],
    )
    return {
      workspaceId: this.store.workspaceId,
      timezone: row?.timezone ?? 'Asia/Tehran',
      workingWeekdays: row ? (JSON.parse(row.working_weekdays_json) as number[]) : [0, 1, 2, 3, 4, 5],
      updatedAt: new Date((row?.updated_at ?? 0) * 1000).toISOString(),
    }
  }

  async updateWorkingCalendar(patch: {
    workingWeekdays?: readonly number[]
    timezone?: string
    updatedByUserId?: string
  }): Promise<WorkingCalendarConfig> {
    const current = await this.getWorkingCalendar()
    const weekdays = (patch.workingWeekdays ?? current.workingWeekdays).filter(
      (day) => Number.isInteger(day) && day >= 0 && day <= 6,
    )
    const timezone = patch.timezone ?? current.timezone
    await this.store.execute(
      `INSERT INTO workspace_working_calendar
         (workspace_id, timezone, working_weekdays_json, updated_by_user_id, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(workspace_id) DO UPDATE SET
         timezone = excluded.timezone,
         working_weekdays_json = excluded.working_weekdays_json,
         updated_by_user_id = excluded.updated_by_user_id,
         updated_at = excluded.updated_at`,
      [this.store.workspaceId, timezone, JSON.stringify(weekdays), patch.updatedByUserId ?? null, this.now()],
    )
    return this.getWorkingCalendar()
  }

  async createClosure(input: CreateCalendarClosureInput): Promise<CalendarClosure> {
    const now = this.now()
    await this.store.execute(
      `INSERT INTO calendar_closures
         (id, workspace_id, closure_level, canonical_date, label, created_by_user_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(workspace_id, closure_level, canonical_date) DO UPDATE SET
         label = excluded.label,
         created_by_user_id = excluded.created_by_user_id`,
      [input.id, this.store.workspaceId, input.level, input.canonicalDate, input.label, input.createdByUserId, now],
    )
    return {
      id: input.id,
      workspaceId: this.store.workspaceId,
      level: input.level,
      canonicalDate: input.canonicalDate,
      label: input.label,
      createdAt: new Date(now * 1000).toISOString(),
    }
  }

  async deleteClosure(closureId: string): Promise<boolean> {
    const result = await this.store.execute(
      `DELETE FROM calendar_closures WHERE workspace_id = ? AND id = ?`,
      [this.store.workspaceId, closureId],
    )
    return result.success && result.changes > 0
  }

  async getTargetsPolicy(): Promise<TargetsPolicy> {
    const row = await this.store.queryFirst<SettingsRow>(
      `SELECT value_json FROM workspace_settings
       WHERE workspace_id = ? AND setting_key = ?
       LIMIT 1`,
      [this.store.workspaceId, TARGETS_POLICY_SETTING_KEY],
    )
    if (row === null) return { ...DEFAULT_TARGETS_POLICY }
    return normalizeTargetsPolicy(row.value_json)
  }

  async updateTargetsPolicy(patch: Partial<TargetsPolicy>, updatedByUserId: string): Promise<TargetsPolicy> {
    const current = await this.getTargetsPolicy()
    const merged = normalizeTargetsPolicy(JSON.stringify({ ...current, ...patch }))
    await this.store.execute(
      `INSERT INTO workspace_settings (workspace_id, setting_key, value_json, updated_by_user_id, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(workspace_id, setting_key) DO UPDATE SET
         value_json = excluded.value_json,
         updated_by_user_id = excluded.updated_by_user_id,
         updated_at = excluded.updated_at`,
      [this.store.workspaceId, TARGETS_POLICY_SETTING_KEY, JSON.stringify(merged), updatedByUserId, this.now()],
    )
    return merged
  }
}
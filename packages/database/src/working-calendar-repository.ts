import {
  canonicalDateToPersian,
  canonicalWeekdayIndex,
  resolveWorkingDay,
  validateOfficialCalendarDataset,
  validateWorkingCalendarOverride,
  type OfficialCalendarDataset,
  type OfficialCalendarEvent,
  type OfficialCalendarSource,
  type PersianWeekdayIndex,
  type WorkingCalendarOverride,
  type WorkingDayContext,
} from '@fieldrep/domain'

import type { WorkspaceAtomicDataStore } from './contracts'

export interface CreateWorkingCalendarRuleInput {
  id: string
  sourceScope: 'company' | 'workspace'
  sourceScopeId: string
  weekdayIndex: PersianWeekdayIndex
  isWorkingDay: boolean
  validFrom: string
  validUntil?: string | null
}

export interface CreateCalendarOverrideInput extends WorkingCalendarOverride {
  createdByUserId?: string | null
}

export interface WorkingCalendarRepository {
  publishOfficialCalendar(versionId: string, dataset: OfficialCalendarDataset): Promise<void>
  createWorkingRule(input: CreateWorkingCalendarRuleInput): Promise<void>
  createOverride(input: CreateCalendarOverrideInput): Promise<void>
  resolveDay(companyId: string, canonicalDate: string): Promise<WorkingDayContext>
}

interface VersionRow {
  id: string
  country_code: 'IR'
  jalali_year: number
  version_label: string
  sources_json: string
}

interface OfficialEventRow {
  id: string
  jalali_month: number
  jalali_day: number
  canonical_date: string
  label: string
  event_kind: OfficialCalendarEvent['kind']
  is_holiday: number
  source_json: string
}

interface WorkingRuleRow {
  is_working_day: number
}

interface OverrideRow {
  id: string
  source_scope: WorkingCalendarOverride['scope']
  source_scope_id: string
  starts_on: string
  ends_on: string
  override_mode: WorkingCalendarOverride['mode']
  title: string
  reason: string | null
}

export class WorkspaceWorkingCalendarRepository implements WorkingCalendarRepository {
  constructor(
    private readonly store: WorkspaceAtomicDataStore,
    private readonly now: () => number = Date.now,
  ) {}

  async publishOfficialCalendar(versionId: string, dataset: OfficialCalendarDataset): Promise<void> {
    if (versionId.trim() === '') throw new Error('official calendar version id is required')
    const validation = validateOfficialCalendarDataset(dataset)
    if (!validation.valid) {
      throw new Error(`official_calendar_invalid:${validation.errors.join('|')}`)
    }

    const now = this.now()
    const commands = [
      {
        query: `UPDATE official_calendar_versions
          SET status = 'superseded', updated_at = ?
          WHERE workspace_id = ? AND country_code = ? AND jalali_year = ? AND status = 'verified'`,
        values: [now, this.store.workspaceId, dataset.countryCode, dataset.jalaliYear],
      },
      {
        query: `INSERT INTO official_calendar_versions (
          id, workspace_id, country_code, jalali_year, version_label, status,
          sources_json, published_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values: [
          versionId,
          this.store.workspaceId,
          dataset.countryCode,
          dataset.jalaliYear,
          dataset.version,
          dataset.status,
          JSON.stringify(dataset.sources),
          dataset.status === 'verified' ? now : null,
          now,
          now,
        ],
      },
      ...dataset.events.map((event) => ({
        query: `INSERT INTO official_calendar_events (
          id, workspace_id, version_id, jalali_year, jalali_month, jalali_day,
          canonical_date, label, event_kind, is_holiday, source_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values: [
          physicalEventId(versionId, event.id),
          this.store.workspaceId,
          versionId,
          event.persianDate.year,
          event.persianDate.month,
          event.persianDate.day,
          event.canonicalDate,
          event.label,
          event.kind,
          event.isHoliday ? 1 : 0,
          JSON.stringify(event.source),
          now,
          now,
        ],
      })),
    ]

    const results = await this.store.executeBatch(commands)
    if (results.some((result) => !result.success)) {
      throw new Error('official_calendar_publish_batch_failed')
    }
  }

  async createWorkingRule(input: CreateWorkingCalendarRuleInput): Promise<void> {
    canonicalDateToPersian(input.validFrom)
    if (input.validUntil !== undefined && input.validUntil !== null) {
      canonicalDateToPersian(input.validUntil)
      if (input.validUntil < input.validFrom) throw new Error('working calendar rule range invalid')
    }
    if (input.id.trim() === '' || input.sourceScopeId.trim() === '') {
      throw new Error('working calendar rule identity is required')
    }

    const now = this.now()
    const result = await this.store.execute(
      `INSERT INTO working_calendar_rules (
        id, workspace_id, source_scope, source_scope_id, weekday_index,
        is_working_day, valid_from, valid_until, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      [
        input.id,
        this.store.workspaceId,
        input.sourceScope,
        input.sourceScopeId,
        input.weekdayIndex,
        input.isWorkingDay ? 1 : 0,
        input.validFrom,
        input.validUntil ?? null,
        now,
        now,
      ],
    )
    if (!result.success) throw new Error('working_calendar_rule_create_failed')
  }

  async createOverride(input: CreateCalendarOverrideInput): Promise<void> {
    validateWorkingCalendarOverride(input)
    const now = this.now()
    const result = await this.store.execute(
      `INSERT INTO calendar_overrides (
        id, workspace_id, source_scope, source_scope_id, starts_on, ends_on,
        override_mode, title, reason, status, created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
      [
        input.id,
        this.store.workspaceId,
        input.scope,
        input.scopeId,
        input.startsOn,
        input.endsOn,
        input.mode,
        input.title.trim(),
        input.reason ?? null,
        input.createdByUserId ?? null,
        now,
        now,
      ],
    )
    if (!result.success) throw new Error('calendar_override_create_failed')
  }

  async resolveDay(companyId: string, canonicalDate: string): Promise<WorkingDayContext> {
    if (companyId.trim() === '') throw new Error('company id is required')
    const persian = canonicalDateToPersian(canonicalDate)
    const weekdayIndex = canonicalWeekdayIndex(canonicalDate)

    const version = await this.store.queryFirst<VersionRow>(
      `SELECT id, country_code, jalali_year, version_label, sources_json
       FROM official_calendar_versions
       WHERE workspace_id = ? AND country_code = 'IR' AND jalali_year = ? AND status = 'verified'
       LIMIT 1`,
      [this.store.workspaceId, persian.year],
    )
    if (version === null) throw new Error('official_calendar_dataset_missing')

    const eventRows = await this.store.queryAll<OfficialEventRow>(
      `SELECT id, jalali_month, jalali_day, canonical_date, label, event_kind, is_holiday, source_json
       FROM official_calendar_events
       WHERE workspace_id = ? AND version_id = ? AND canonical_date = ?
       ORDER BY id`,
      [this.store.workspaceId, version.id, canonicalDate],
    )

    const rule = await this.store.queryFirst<WorkingRuleRow>(
      `SELECT is_working_day
       FROM working_calendar_rules
       WHERE workspace_id = ?
         AND status = 'active'
         AND weekday_index = ?
         AND valid_from <= ?
         AND (valid_until IS NULL OR valid_until >= ?)
         AND (
           (source_scope = 'workspace' AND source_scope_id = ?)
           OR (source_scope = 'company' AND source_scope_id = ?)
         )
       ORDER BY CASE source_scope WHEN 'workspace' THEN 0 ELSE 1 END,
                valid_from DESC,
                id DESC
       LIMIT 1`,
      [
        this.store.workspaceId,
        weekdayIndex,
        canonicalDate,
        canonicalDate,
        this.store.workspaceId,
        companyId,
      ],
    )
    if (rule === null) throw new Error('working_calendar_policy_missing')

    const overrideRows = await this.store.queryAll<OverrideRow>(
      `SELECT id, source_scope, source_scope_id, starts_on, ends_on,
              override_mode, title, reason
       FROM calendar_overrides
       WHERE workspace_id = ?
         AND status = 'active'
         AND starts_on <= ?
         AND ends_on >= ?
         AND (
           (source_scope = 'workspace' AND source_scope_id = ?)
           OR (source_scope = 'company' AND source_scope_id = ?)
         )
       ORDER BY source_scope, id`,
      [this.store.workspaceId, canonicalDate, canonicalDate, this.store.workspaceId, companyId],
    )

    const sources = parseSources(version.sources_json)
    const officialCalendar: OfficialCalendarDataset = {
      countryCode: version.country_code,
      jalaliYear: version.jalali_year,
      version: version.version_label,
      status: 'verified',
      sources,
      events: eventRows.map((row): OfficialCalendarEvent => ({
        id: row.id,
        persianDate: {
          year: version.jalali_year,
          month: Number(row.jalali_month),
          day: Number(row.jalali_day),
        },
        canonicalDate: row.canonical_date,
        label: row.label,
        kind: row.event_kind,
        isHoliday: Number(row.is_holiday) === 1,
        source: parseSource(row.source_json),
      })),
    }

    const overrides = overrideRows.map((row): WorkingCalendarOverride => ({
      id: row.id,
      scope: row.source_scope,
      scopeId: row.source_scope_id,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      mode: row.override_mode,
      title: row.title,
      reason: row.reason,
    }))

    return resolveWorkingDay({
      canonicalDate,
      workingWeekdays: Number(rule.is_working_day) === 1 ? [weekdayIndex] : [],
      officialCalendar,
      companyOverrides: overrides.filter((override) => override.scope === 'company'),
      workspaceOverrides: overrides.filter((override) => override.scope === 'workspace'),
    })
  }
}

function physicalEventId(versionId: string, eventId: string): string {
  return `${versionId}:${eventId}`
}

function parseSources(value: string): OfficialCalendarSource[] {
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed)) throw new Error('official_calendar_sources_invalid')
  return parsed as OfficialCalendarSource[]
}

function parseSource(value: string): OfficialCalendarSource {
  return JSON.parse(value) as OfficialCalendarSource
}

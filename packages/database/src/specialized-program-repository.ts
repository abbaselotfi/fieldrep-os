import {
  companyProgramToCalendarItem,
  doctorProgramToCalendarItem,
  validateCompanyProgram,
  validateDoctorProgram,
  type CalendarEventId,
  type CompanyProgram,
  type CompanyProgramId,
  type DoctorProgram,
  type DoctorProgramId,
  type ProgramStatus,
} from '@fieldrep/domain'

import type { WorkspaceAtomicDataStore, WorkspaceWriteCommand } from './contracts'

export interface SpecializedProgramRepository {
  createCompanyProgram(program: CompanyProgram, calendarEventId: CalendarEventId): Promise<void>
  createDoctorProgram(program: DoctorProgram, calendarEventId: CalendarEventId): Promise<void>
  setCompanyProgramStatus(programId: CompanyProgramId, status: ProgramStatus): Promise<boolean>
  setDoctorProgramStatus(programId: DoctorProgramId, status: ProgramStatus): Promise<boolean>
}

export class WorkspaceSpecializedProgramRepository implements SpecializedProgramRepository {
  constructor(
    private readonly store: WorkspaceAtomicDataStore,
    private readonly now: () => number = Date.now,
  ) {}

  async createCompanyProgram(program: CompanyProgram, calendarEventId: CalendarEventId): Promise<void> {
    this.assertWorkspace(program.workspaceId)
    validateCompanyProgram(program)
    const item = companyProgramToCalendarItem(program, calendarEventId)
    const now = this.now()
    const commands: WorkspaceWriteCommand[] = [
      {
        query: `INSERT INTO company_programs (
          id, workspace_id, created_by_user_id, program_type, title, description,
          starts_at, ends_at, local_start_date, local_end_date, all_day,
          scope_type, scope_id, location_text, counts_as_working_activity,
          blocks_planning, appears_in_report, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values: [
          program.id, program.workspaceId, program.createdByUserId, program.type,
          program.title.trim(), program.description?.trim() || null, program.startsAt,
          program.endsAt, program.localStartDate, program.localEndDate,
          program.allDay ? 1 : 0, program.scope.type, program.scope.id,
          program.locationText?.trim() || null, program.countsAsWorkingActivity ? 1 : 0,
          program.blocksPlanning ? 1 : 0, program.appearsInReport ? 1 : 0,
          program.status, now, now,
        ],
      },
    ]

    for (const userId of program.attendeeUserIds) {
      commands.push({
        query: `INSERT INTO company_program_users (
          workspace_id, company_program_id, user_id, participant_role, created_at, updated_at
        ) VALUES (?, ?, ?, 'attendee', ?, ?)`,
        values: [program.workspaceId, program.id, userId, now, now],
      })
    }

    commands.push(this.calendarInsert(item, now))
    for (const userId of program.attendeeUserIds) commands.push(this.attendeeInsert(item.id, userId, now))

    await this.executeAll(commands, 'company_program_create_batch_failed')
  }

  async createDoctorProgram(program: DoctorProgram, calendarEventId: CalendarEventId): Promise<void> {
    this.assertWorkspace(program.workspaceId)
    validateDoctorProgram(program)
    const item = doctorProgramToCalendarItem(program, calendarEventId)
    const now = this.now()
    const commands: WorkspaceWriteCommand[] = [
      {
        query: `INSERT INTO doctor_programs (
          id, workspace_id, created_by_user_id, program_type, title, description,
          starts_at, ends_at, local_start_date, local_end_date, all_day, location_text,
          cost_amount_minor, currency_code, report_text, counts_as_working_activity,
          blocks_planning, appears_in_report, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values: [
          program.id, program.workspaceId, program.createdByUserId, program.type,
          program.title.trim(), program.description?.trim() || null, program.startsAt,
          program.endsAt, program.localStartDate, program.localEndDate,
          program.allDay ? 1 : 0, program.locationText?.trim() || null,
          program.costAmountMinor, program.currencyCode, program.reportText?.trim() || null,
          program.countsAsWorkingActivity ? 1 : 0, program.blocksPlanning ? 1 : 0,
          program.appearsInReport ? 1 : 0, program.status, now, now,
        ],
      },
    ]

    for (const doctor of program.doctors) {
      commands.push({
        query: `INSERT INTO doctor_program_doctors (
          workspace_id, doctor_program_id, customer_id, attendance_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        values: [program.workspaceId, program.id, doctor.customerId, doctor.attendance, now, now],
      })
    }
    for (const productId of program.productIds) {
      commands.push({
        query: `INSERT INTO doctor_program_products (
          workspace_id, doctor_program_id, product_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?)`,
        values: [program.workspaceId, program.id, productId, now, now],
      })
    }
    for (const userId of program.attendeeUserIds) {
      commands.push({
        query: `INSERT INTO doctor_program_users (
          workspace_id, doctor_program_id, user_id, participant_role, created_at, updated_at
        ) VALUES (?, ?, ?, 'attendee', ?, ?)`,
        values: [program.workspaceId, program.id, userId, now, now],
      })
    }

    commands.push(this.calendarInsert(item, now))
    for (const userId of program.attendeeUserIds) commands.push(this.attendeeInsert(item.id, userId, now))

    await this.executeAll(commands, 'doctor_program_create_batch_failed')
  }

  async setCompanyProgramStatus(programId: CompanyProgramId, status: ProgramStatus): Promise<boolean> {
    return this.setStatus('company_programs', 'company_program', programId, status)
  }

  async setDoctorProgramStatus(programId: DoctorProgramId, status: ProgramStatus): Promise<boolean> {
    return this.setStatus('doctor_programs', 'doctor_program', programId, status)
  }

  private async setStatus(
    table: 'company_programs' | 'doctor_programs',
    sourceType: 'company_program' | 'doctor_program',
    id: string,
    status: ProgramStatus,
  ): Promise<boolean> {
    const now = this.now()
    const calendarStatus = status === 'scheduled' ? 'scheduled' : status
    const active = status !== 'cancelled'
    const results = await this.store.executeBatch([
      {
        query: `UPDATE ${table} SET status = ?, updated_at = ? WHERE workspace_id = ? AND id = ?`,
        values: [status, now, this.store.workspaceId, id],
      },
      {
        query: `UPDATE calendar_events
          SET status = ?,
              blocks_planning = CASE WHEN ? = 'scheduled' THEN blocks_planning ELSE 0 END,
              counts_as_visit = 0,
              appears_in_report = CASE WHEN ? THEN appears_in_report ELSE 0 END,
              updated_at = ?
          WHERE workspace_id = ? AND source_entity_type = ? AND source_entity_id = ?`,
        values: [calendarStatus, status, active ? 1 : 0, now, this.store.workspaceId, sourceType, id],
      },
    ])
    if (results.some((result) => !result.success)) throw new Error('program_status_batch_failed')
    return results.every((result) => result.changes > 0)
  }

  private calendarInsert(item: ReturnType<typeof companyProgramToCalendarItem>, now: number): WorkspaceWriteCommand {
    return {
      query: `INSERT INTO calendar_events (
        id, workspace_id, event_type, source_entity_type, source_entity_id, title,
        starts_at, ends_at, local_start_date, local_end_date, all_day,
        scope_type, scope_id, blocks_planning, counts_as_working_activity,
        counts_as_visit, appears_in_report, status, location_text, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
      values: [
        item.id, item.workspaceId, item.type, item.sourceType, item.sourceId, item.title,
        item.startsAt, item.endsAt, item.localStartDate, item.localEndDate, item.allDay ? 1 : 0,
        item.scope.type, item.scope.id, item.behavior.blocksPlanning ? 1 : 0,
        item.behavior.countsAsWorkingActivity ? 1 : 0, item.behavior.appearsInReport ? 1 : 0,
        item.status, item.locationText, now, now,
      ],
    }
  }

  private attendeeInsert(eventId: CalendarEventId, userId: string, now: number): WorkspaceWriteCommand {
    return {
      query: `INSERT INTO calendar_event_attendees (
        event_id, workspace_id, user_id, attendance_role, response_status, created_at, updated_at
      ) VALUES (?, ?, ?, 'attendee', 'none', ?, ?)`,
      values: [eventId, this.store.workspaceId, userId, now, now],
    }
  }

  private assertWorkspace(workspaceId: string): void {
    if (workspaceId !== this.store.workspaceId) throw new Error('program_workspace_mismatch')
  }

  private async executeAll(commands: WorkspaceWriteCommand[], code: string): Promise<void> {
    const results = await this.store.executeBatch(commands)
    if (results.some((result) => !result.success)) throw new Error(code)
  }
}

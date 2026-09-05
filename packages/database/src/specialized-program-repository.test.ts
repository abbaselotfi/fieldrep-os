import { describe, expect, it } from 'vitest'

import type {
  CompanyProgram,
  DoctorProgram,
} from '@fieldrep/domain'
import type {
  WorkspaceAtomicDataStore,
  WorkspaceWriteCommand,
  WorkspaceWriteResult,
} from './contracts'
import { WorkspaceSpecializedProgramRepository } from './specialized-program-repository'

class FakeStore implements WorkspaceAtomicDataStore {
  readonly workspaceId = 'workspace-a'
  readonly schemaVersion = 11
  readonly batches: WorkspaceWriteCommand[][] = []
  async health(): Promise<boolean> { return true }
  async queryFirst<T>(): Promise<T | null> { return null }
  async queryAll<T>(): Promise<T[]> { return [] }
  async execute(): Promise<WorkspaceWriteResult> { return { success: true, changes: 1 } }
  async executeBatch(commands: readonly WorkspaceWriteCommand[]): Promise<WorkspaceWriteResult[]> {
    this.batches.push([...commands])
    return commands.map(() => ({ success: true, changes: 1 }))
  }
}

const company: CompanyProgram = {
  id: 'company-program-1', workspaceId: 'workspace-a', createdByUserId: 'admin-1',
  type: 'cycle_meeting', title: 'Cycle Meeting', description: null,
  startsAt: Date.UTC(2026, 8, 15, 5), endsAt: Date.UTC(2026, 8, 15, 8),
  localStartDate: '2026-09-15', localEndDate: '2026-09-15', allDay: false,
  scope: { type: 'workspace', id: 'workspace-a' }, attendeeUserIds: ['user-1', 'user-2'],
  locationText: 'دفتر', countsAsWorkingActivity: true, blocksPlanning: true,
  appearsInReport: true, status: 'draft',
}

const doctor: DoctorProgram = {
  id: 'doctor-program-1', workspaceId: 'workspace-a', createdByUserId: 'admin-1',
  type: 'speaker_program', title: 'Speaker Program', description: null,
  startsAt: Date.UTC(2026, 8, 20, 14), endsAt: Date.UTC(2026, 8, 20, 17),
  localStartDate: '2026-09-20', localEndDate: '2026-09-20', allDay: false,
  attendeeUserIds: ['user-1'], doctors: [{ customerId: 'doctor-1', attendance: 'confirmed' }],
  productIds: ['product-1'], locationText: 'هتل', costAmountMinor: 10_000,
  currencyCode: 'IRR', reportText: null, countsAsWorkingActivity: true,
  blocksPlanning: true, appearsInReport: true, status: 'scheduled',
}

describe('WorkspaceSpecializedProgramRepository', () => {
  it('atomically creates company program, participants and non-KPI Calendar projection', async () => {
    const store = new FakeStore()
    const repository = new WorkspaceSpecializedProgramRepository(store, () => 1_780_000_000_000)

    await repository.createCompanyProgram(company, 'calendar-company-1')

    const commands = store.batches[0]!
    expect(commands).toHaveLength(6)
    expect(commands[0]?.query).toContain('INSERT INTO company_programs')
    expect(commands[1]?.query).toContain('INSERT INTO company_program_users')
    const calendar = commands[3]!
    expect(calendar.query).toContain('INSERT INTO calendar_events')
    expect(calendar.query).toContain('counts_as_visit')
    expect(calendar.values).toContain('company_program')
    expect(calendar.values).toContain('draft')
  })

  it('atomically persists doctor, product, user and Calendar dimensions', async () => {
    const store = new FakeStore()
    const repository = new WorkspaceSpecializedProgramRepository(store)

    await repository.createDoctorProgram(doctor, 'calendar-doctor-1')

    const commands = store.batches[0]!
    expect(commands.some((command) => command.query.includes('INSERT INTO doctor_program_doctors'))).toBe(true)
    expect(commands.some((command) => command.query.includes('INSERT INTO doctor_program_products'))).toBe(true)
    expect(commands.some((command) => command.query.includes('INSERT INTO doctor_program_users'))).toBe(true)
    const calendar = commands.find((command) => command.query.includes('INSERT INTO calendar_events'))!
    expect(calendar.values).toContain('doctor_program')
    expect(calendar.values).toContain('scheduled')
  })

  it('rejects cross-workspace program persistence before any write', async () => {
    const store = new FakeStore()
    const repository = new WorkspaceSpecializedProgramRepository(store)

    await expect(repository.createCompanyProgram(
      { ...company, workspaceId: 'workspace-b' },
      'calendar-company-1',
    )).rejects.toThrow('program_workspace_mismatch')
    expect(store.batches).toHaveLength(0)
  })

  it('status transition restores configured scheduling flags but never Visit KPI', async () => {
    const store = new FakeStore()
    const repository = new WorkspaceSpecializedProgramRepository(store, () => 1_780_000_000_001)

    await expect(repository.setCompanyProgramStatus('company-program-1', 'scheduled')).resolves.toBe(true)

    const projection = store.batches[0]?.[1]
    expect(projection?.query).toContain("CASE WHEN ? = 'scheduled'")
    expect(projection?.query).toContain('counts_as_visit = 0')
    expect(projection?.values).toContain('company_program')
  })
})

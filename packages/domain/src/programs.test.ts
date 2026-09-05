import { describe, expect, it } from 'vitest'

import {
  companyProgramToCalendarItem,
  doctorProgramToCalendarItem,
  validateCompanyProgram,
  validateDoctorProgram,
  type CompanyProgram,
  type DoctorProgram,
} from './programs'

const companyProgram: CompanyProgram = {
  id: 'company-program-1', workspaceId: 'workspace-a', createdByUserId: 'admin-1',
  type: 'cycle_meeting', title: 'Cycle Meeting', description: null,
  startsAt: Date.UTC(2026, 8, 15, 5), endsAt: Date.UTC(2026, 8, 15, 8),
  localStartDate: '2026-09-15', localEndDate: '2026-09-15', allDay: false,
  scope: { type: 'workspace', id: 'workspace-a' }, attendeeUserIds: ['user-1', 'user-2'],
  locationText: 'دفتر مشهد', countsAsWorkingActivity: true, blocksPlanning: true,
  appearsInReport: true, status: 'scheduled',
}

const doctorProgram: DoctorProgram = {
  id: 'doctor-program-1', workspaceId: 'workspace-a', createdByUserId: 'admin-1',
  type: 'speaker_program', title: 'Speaker Program', description: null,
  startsAt: Date.UTC(2026, 8, 20, 14), endsAt: Date.UTC(2026, 8, 20, 17),
  localStartDate: '2026-09-20', localEndDate: '2026-09-20', allDay: false,
  attendeeUserIds: ['user-1'],
  doctors: [{ customerId: 'doctor-1', attendance: 'confirmed' }],
  productIds: ['product-1'], locationText: 'هتل', costAmountMinor: 10_000_000,
  currencyCode: 'IRR', reportText: null, countsAsWorkingActivity: true,
  blocksPlanning: true, appearsInReport: true, status: 'scheduled',
}

describe('specialized program domain', () => {
  it('validates company program scope and user attendees', () => {
    expect(() => validateCompanyProgram(companyProgram)).not.toThrow()
    expect(() => validateCompanyProgram({
      ...companyProgram,
      scope: { type: 'workspace', id: 'workspace-b' },
    })).toThrow('program workspace scope mismatch')
  })

  it('validates doctor/product uniqueness and cost currency pairing', () => {
    expect(() => validateDoctorProgram(doctorProgram)).not.toThrow()
    expect(() => validateDoctorProgram({
      ...doctorProgram,
      doctors: [...doctorProgram.doctors, doctorProgram.doctors[0]!],
    })).toThrow('doctor program contains duplicate doctors')
    expect(() => validateDoctorProgram({ ...doctorProgram, currencyCode: null })).toThrow(
      'doctor program cost amount and currency must be provided together',
    )
  })

  it('projects company programs without creating Visit KPI', () => {
    expect(companyProgramToCalendarItem(companyProgram, 'calendar-company-1')).toMatchObject({
      type: 'company_program', sourceType: 'company_program', status: 'scheduled',
      behavior: {
        blocksPlanning: true,
        countsAsWorkingActivity: true,
        countsAsVisit: false,
        appearsInReport: true,
      },
    })
  })

  it('projects doctor programs for selected users without creating Visit KPI', () => {
    expect(doctorProgramToCalendarItem(doctorProgram, 'calendar-doctor-1')).toMatchObject({
      type: 'doctor_program', sourceType: 'doctor_program',
      scope: { type: 'selected_users', id: null },
      attendeeUserIds: ['user-1'],
      behavior: { countsAsVisit: false, blocksPlanning: true },
    })
  })

  it('cancelled programs stop blocking and reporting', () => {
    const item = doctorProgramToCalendarItem(
      { ...doctorProgram, status: 'cancelled' },
      'calendar-doctor-1',
    )
    expect(item.status).toBe('cancelled')
    expect(item.behavior).toMatchObject({
      blocksPlanning: false,
      countsAsWorkingActivity: false,
      countsAsVisit: false,
      appearsInReport: false,
    })
  })
})

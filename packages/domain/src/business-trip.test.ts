import { describe, expect, it } from 'vitest'

import {
  businessTripBlocksPlanning,
  businessTripToCalendarItem,
  cancelOwnBusinessTrip,
  completeBusinessTrip,
  decideBusinessTrip,
  requestBusinessTrip,
  validateBusinessTrip,
  type BusinessTrip,
} from './business-trip'

function trip(overrides: Partial<BusinessTrip> = {}): BusinessTrip {
  return {
    id: 'trip-1',
    workspaceId: 'workspace-a',
    userId: 'user-1',
    originCity: 'مشهد',
    originProvince: 'خراسان رضوی',
    purpose: 'ویزیت منطقه‌ای',
    transport: 'car',
    startsAt: Date.UTC(2026, 8, 10, 4),
    endsAt: Date.UTC(2026, 8, 12, 18),
    localStartDate: '2026-09-10',
    localEndDate: '2026-09-12',
    allDay: false,
    blocksPlanning: false,
    status: 'draft',
    destinations: [
      {
        id: 'destination-1',
        sequence: 1,
        city: 'بجنورد',
        province: 'خراسان شمالی',
        address: null,
        startsAt: Date.UTC(2026, 8, 10, 8),
        endsAt: Date.UTC(2026, 8, 12, 16),
      },
    ],
    decidedByUserId: null,
    decidedAt: null,
    ...overrides,
  }
}

describe('business trip domain', () => {
  it('validates required destination and destination intervals', () => {
    expect(() => validateBusinessTrip(trip())).not.toThrow()
    expect(() => validateBusinessTrip(trip({ destinations: [] }))).toThrow(
      'business trip requires a destination',
    )
    expect(() => validateBusinessTrip(trip({
      destinations: [{
        id: 'destination-1', sequence: 1, city: 'بجنورد', province: null, address: null,
        startsAt: Date.UTC(2026, 8, 9), endsAt: Date.UTC(2026, 8, 10),
      }],
    }))).toThrow('business trip destination interval must be inside trip range')
  })

  it('uses an explicit request and decision lifecycle', () => {
    const requested = requestBusinessTrip(trip())
    expect(requested.status).toBe('requested')

    const approved = decideBusinessTrip(requested, 'approved', 'supervisor-1', 1_780_000_000_000)
    expect(approved).toMatchObject({
      status: 'approved',
      decidedByUserId: 'supervisor-1',
      decidedAt: 1_780_000_000_000,
    })
    expect(() => decideBusinessTrip(approved, 'approved', 'supervisor-1', 1)).toThrow(
      'only requested business trip can be decided',
    )
  })

  it('preserves approval audit when an approved mission is completed', () => {
    const approved = decideBusinessTrip(
      requestBusinessTrip(trip()),
      'approved',
      'supervisor-1',
      1_780_000_000_000,
    )
    const completed = completeBusinessTrip(approved)
    expect(completed.status).toBe('completed')
    expect(completed.decidedByUserId).toBe('supervisor-1')
    expect(completed.decidedAt).toBe(1_780_000_000_000)
  })

  it('allows owner cancellation only before decision', () => {
    expect(cancelOwnBusinessTrip(trip()).status).toBe('cancelled')
    const approved = decideBusinessTrip(
      requestBusinessTrip(trip()),
      'approved',
      'supervisor-1',
      1_780_000_000_000,
    )
    expect(() => cancelOwnBusinessTrip(approved)).toThrow(
      'only draft or requested business trip can be cancelled by owner',
    )
  })

  it('never creates Visit KPI and only blocks planning when approved plus explicitly blocking', () => {
    const requested = requestBusinessTrip(trip({ blocksPlanning: true }))
    expect(businessTripBlocksPlanning(requested)).toBe(false)

    const approved = decideBusinessTrip(requested, 'approved', 'supervisor-1', 1_780_000_000_000)
    expect(businessTripBlocksPlanning(approved)).toBe(true)

    const item = businessTripToCalendarItem(approved, 'calendar-trip-1')
    expect(item).toMatchObject({
      type: 'business_trip',
      sourceType: 'business_trip',
      status: 'active',
      locationText: 'بجنورد',
      behavior: {
        blocksPlanning: true,
        countsAsWorkingActivity: true,
        countsAsVisit: false,
        appearsInReport: true,
      },
    })
  })
})

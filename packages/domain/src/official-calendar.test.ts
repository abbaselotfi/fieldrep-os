import { describe, expect, it } from 'vitest'

import {
  isOfficialHoliday,
  officialCalendarEventsOn,
  validateOfficialCalendarDataset,
  type OfficialCalendarDataset,
} from './official-calendar'

const universitySource = {
  authority: 'Calendar Center, Institute of Geophysics, University of Tehran',
  reference: 'Calendar-1405 official annual publication',
  retrievedAt: '2026-09-05T00:00:00Z',
} as const

const timeIrSource = {
  authority: 'Time.ir',
  reference: 'Annual events calendar 1405',
  retrievedAt: '2026-09-05T00:00:00Z',
} as const

function sampleDataset(): OfficialCalendarDataset {
  return {
    countryCode: 'IR',
    jalaliYear: 1405,
    version: '1405.verified-sample-v1',
    status: 'verified',
    sources: [universitySource, timeIrSource],
    events: [
      {
        id: 'ir-1405-nowruz-01',
        persianDate: { year: 1405, month: 1, day: 1 },
        canonicalDate: '2026-03-21',
        label: 'نوروز',
        kind: 'public_holiday',
        isHoliday: true,
        source: universitySource,
      },
      {
        id: 'ir-1405-eid-fitr-01',
        persianDate: { year: 1405, month: 1, day: 1 },
        canonicalDate: '2026-03-21',
        label: 'عید سعید فطر',
        kind: 'religious',
        isHoliday: true,
        source: timeIrSource,
      },
      {
        id: 'ir-1405-doctors-day',
        persianDate: { year: 1405, month: 6, day: 1 },
        canonicalDate: '2026-08-23',
        label: 'روز پزشک',
        kind: 'national',
        isHoliday: false,
        source: timeIrSource,
      },
    ],
  }
}

describe('official Iran calendar dataset contract', () => {
  it('validates sourced events only when Jalali and canonical dates reconcile', () => {
    expect(validateOfficialCalendarDataset(sampleDataset())).toEqual({ valid: true, errors: [] })
  })

  it('allows multiple official/religious events on one civil day', () => {
    const events = officialCalendarEventsOn(sampleDataset(), '2026-03-21')
    expect(events).toHaveLength(2)
    expect(events.map((event) => event.kind).sort()).toEqual(['public_holiday', 'religious'])
    expect(isOfficialHoliday(sampleDataset(), '2026-03-21')).toBe(true)
    expect(isOfficialHoliday(sampleDataset(), '2026-08-23')).toBe(false)
  })

  it('fails closed on an annual-data date mismatch instead of shifting the event silently', () => {
    const dataset = sampleDataset()
    const broken: OfficialCalendarDataset = {
      ...dataset,
      events: [
        {
          ...dataset.events[0]!,
          canonicalDate: '2026-03-22',
        },
      ],
    }

    const validation = validateOfficialCalendarDataset(broken)
    expect(validation.valid).toBe(false)
    expect(validation.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('canonical mismatch'),
        expect.stringContaining('round-trip mismatch'),
      ]),
    )
  })
})

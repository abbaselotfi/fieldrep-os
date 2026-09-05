import {
  canonicalDateToPersian,
  persianDateToCanonical,
  type PersianDateParts,
} from './persian-calendar'

export type OfficialCalendarEventKind =
  | 'public_holiday'
  | 'religious'
  | 'national'
  | 'observance'

export interface OfficialCalendarSource {
  authority: string
  reference: string
  retrievedAt: string
}

export interface OfficialCalendarEvent {
  id: string
  persianDate: PersianDateParts
  canonicalDate: string
  label: string
  kind: OfficialCalendarEventKind
  isHoliday: boolean
  source: OfficialCalendarSource
}

export interface OfficialCalendarDataset {
  countryCode: 'IR'
  jalaliYear: number
  version: string
  status: 'draft' | 'verified' | 'superseded'
  sources: readonly OfficialCalendarSource[]
  events: readonly OfficialCalendarEvent[]
}

export interface OfficialCalendarValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * Validates annual official-calendar data independently from calendar math.
 *
 * Religious/public-holiday dates are versioned source data because official
 * observance dates can change with annual calendar publication/announcement.
 * The deterministic Solar Hijri engine is only used to verify that the stored
 * Jalali and canonical dates describe the same civil day.
 */
export function validateOfficialCalendarDataset(
  dataset: OfficialCalendarDataset,
): OfficialCalendarValidationResult {
  const errors: string[] = []
  const eventIds = new Set<string>()

  if (dataset.countryCode !== 'IR') errors.push('countryCode must be IR')
  if (!Number.isInteger(dataset.jalaliYear)) errors.push('jalaliYear must be an integer')
  if (dataset.version.trim() === '') errors.push('version is required')
  if (dataset.sources.length === 0) errors.push('at least one dataset source is required')

  for (const source of dataset.sources) validateSource(source, errors, 'dataset')

  for (const event of dataset.events) {
    if (event.id.trim() === '') errors.push('event id is required')
    if (eventIds.has(event.id)) errors.push(`duplicate event id: ${event.id}`)
    eventIds.add(event.id)

    if (event.label.trim() === '') errors.push(`event ${event.id}: label is required`)
    if (event.persianDate.year !== dataset.jalaliYear) {
      errors.push(
        `event ${event.id}: Persian year ${event.persianDate.year} does not match dataset ${dataset.jalaliYear}`,
      )
    }

    try {
      const expectedCanonical = persianDateToCanonical(event.persianDate)
      if (expectedCanonical !== event.canonicalDate) {
        errors.push(
          `event ${event.id}: canonical mismatch; expected ${expectedCanonical}, received ${event.canonicalDate}`,
        )
      }
      const roundTrip = canonicalDateToPersian(event.canonicalDate)
      if (
        roundTrip.year !== event.persianDate.year ||
        roundTrip.month !== event.persianDate.month ||
        roundTrip.day !== event.persianDate.day
      ) {
        errors.push(`event ${event.id}: canonical/Jalali round-trip mismatch`)
      }
    } catch (error) {
      errors.push(
        `event ${event.id}: invalid date (${error instanceof Error ? error.message : String(error)})`,
      )
    }

    validateSource(event.source, errors, `event ${event.id}`)
  }

  return { valid: errors.length === 0, errors }
}

export function officialCalendarEventsOn(
  dataset: OfficialCalendarDataset,
  canonicalDate: string,
): OfficialCalendarEvent[] {
  return dataset.events.filter((event) => event.canonicalDate === canonicalDate)
}

export function isOfficialHoliday(
  dataset: OfficialCalendarDataset,
  canonicalDate: string,
): boolean {
  return officialCalendarEventsOn(dataset, canonicalDate).some((event) => event.isHoliday)
}

function validateSource(
  source: OfficialCalendarSource,
  errors: string[],
  scope: string,
): void {
  if (source.authority.trim() === '') errors.push(`${scope}: source authority is required`)
  if (source.reference.trim() === '') errors.push(`${scope}: source reference is required`)
  if (Number.isNaN(Date.parse(source.retrievedAt))) {
    errors.push(`${scope}: source retrievedAt must be an ISO-compatible timestamp`)
  }
}

export const DEFAULT_FIELD_TIME_ZONE = 'Asia/Tehran'
export const PERSIAN_CALENDAR_LOCALE = 'fa-IR-u-ca-persian'

export interface JalaliDateParts {
  year: number
  month: number
  day: number
}

export interface JalaliFormatOptions {
  timeZone?: string
}

export function getJalaliDateParts(
  value: Date,
  options: JalaliFormatOptions = {},
): JalaliDateParts {
  assertValidDate(value)

  const formatter = new Intl.DateTimeFormat('en-US-u-ca-persian', {
    timeZone: options.timeZone ?? DEFAULT_FIELD_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  })

  const parts = formatter.formatToParts(value)

  return {
    year: getNumericPart(parts, 'year'),
    month: getNumericPart(parts, 'month'),
    day: getNumericPart(parts, 'day'),
  }
}

export function formatJalaliLongDate(
  value: Date,
  options: JalaliFormatOptions = {},
): string {
  assertValidDate(value)

  return new Intl.DateTimeFormat(PERSIAN_CALENDAR_LOCALE, {
    timeZone: options.timeZone ?? DEFAULT_FIELD_TIME_ZONE,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(value)
}

export function formatJalaliMonthTitle(
  value: Date,
  options: JalaliFormatOptions = {},
): string {
  assertValidDate(value)

  return new Intl.DateTimeFormat(PERSIAN_CALENDAR_LOCALE, {
    timeZone: options.timeZone ?? DEFAULT_FIELD_TIME_ZONE,
    year: 'numeric',
    month: 'long',
  }).format(value)
}

export function formatPersianWeekday(
  value: Date,
  options: JalaliFormatOptions = {},
): string {
  assertValidDate(value)

  return new Intl.DateTimeFormat('fa-IR', {
    timeZone: options.timeZone ?? DEFAULT_FIELD_TIME_ZONE,
    weekday: 'long',
  }).format(value)
}

function getNumericPart(
  parts: readonly Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): number {
  const value = parts.find((part) => part.type === type)?.value
  const parsed = value === undefined ? Number.NaN : Number.parseInt(value, 10)

  if (!Number.isInteger(parsed)) {
    throw new Error(`Unable to resolve Jalali ${type}`)
  }

  return parsed
}

function assertValidDate(value: Date): void {
  if (Number.isNaN(value.getTime())) {
    throw new RangeError('Invalid date')
  }
}

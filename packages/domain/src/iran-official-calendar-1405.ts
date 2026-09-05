import type {
  OfficialCalendarDataset,
  OfficialCalendarEvent,
  OfficialCalendarEventKind,
  OfficialCalendarSource,
} from './official-calendar'

const CALENDAR_CENTER_SOURCE: OfficialCalendarSource = {
  authority: 'Calendar Center, Institute of Geophysics, University of Tehran',
  reference: 'https://calendar.ut.ac.ir/documents/2139738/7092644/Calendar-1405.pdf',
  retrievedAt: '2026-09-05T00:00:00.000Z',
}

const TIME_IR_SOURCE: OfficialCalendarSource = {
  authority: 'Time.ir',
  reference: 'https://www.time.ir/event-year',
  retrievedAt: '2026-09-05T00:00:00.000Z',
}

interface HolidaySeed {
  month: number
  day: number
  canonicalDate: string
  label: string
  kind: OfficialCalendarEventKind
}

/**
 * Verified public-holiday dates for Iranian Solar Hijri year 1405.
 *
 * The University of Tehran Calendar Center publication is the primary annual
 * authority. Time.ir is retained as an independent cross-check source. Runtime
 * code never scrapes either site; this versioned dataset is reviewed/published
 * as data and validated against FieldRep's deterministic Persian calendar core.
 */
export const IRAN_OFFICIAL_CALENDAR_1405: OfficialCalendarDataset = {
  countryCode: 'IR',
  jalaliYear: 1405,
  version: 'ir-1405.1',
  status: 'verified',
  sources: [CALENDAR_CENTER_SOURCE, TIME_IR_SOURCE],
  events: holidaySeeds().map((seed, index): OfficialCalendarEvent => ({
    id: `ir-1405-holiday-${String(index + 1).padStart(2, '0')}`,
    persianDate: { year: 1405, month: seed.month, day: seed.day },
    canonicalDate: seed.canonicalDate,
    label: seed.label,
    kind: seed.kind,
    isHoliday: true,
    source: CALENDAR_CENTER_SOURCE,
  })),
}

function holidaySeeds(): HolidaySeed[] {
  return [
    { month: 1, day: 1, canonicalDate: '2026-03-21', label: 'آغاز نوروز و عید سعید فطر', kind: 'public_holiday' },
    { month: 1, day: 2, canonicalDate: '2026-03-22', label: 'عید نوروز و تعطیل عید سعید فطر', kind: 'public_holiday' },
    { month: 1, day: 3, canonicalDate: '2026-03-23', label: 'عید نوروز', kind: 'public_holiday' },
    { month: 1, day: 4, canonicalDate: '2026-03-24', label: 'عید نوروز', kind: 'public_holiday' },
    { month: 1, day: 12, canonicalDate: '2026-04-01', label: 'روز جمهوری اسلامی ایران', kind: 'national' },
    { month: 1, day: 13, canonicalDate: '2026-04-02', label: 'روز طبیعت', kind: 'national' },
    { month: 1, day: 25, canonicalDate: '2026-04-14', label: 'شهادت امام جعفر صادق (ع)', kind: 'religious' },
    { month: 3, day: 6, canonicalDate: '2026-05-27', label: 'عید سعید قربان', kind: 'religious' },
    { month: 3, day: 14, canonicalDate: '2026-06-04', label: 'عید سعید غدیر خم و رحلت امام خمینی', kind: 'public_holiday' },
    { month: 3, day: 15, canonicalDate: '2026-06-05', label: 'قیام ۱۵ خرداد', kind: 'national' },
    { month: 4, day: 3, canonicalDate: '2026-06-24', label: 'تاسوعای حسینی', kind: 'religious' },
    { month: 4, day: 4, canonicalDate: '2026-06-25', label: 'عاشورای حسینی', kind: 'religious' },
    { month: 5, day: 13, canonicalDate: '2026-08-04', label: 'اربعین حسینی', kind: 'religious' },
    { month: 5, day: 21, canonicalDate: '2026-08-12', label: 'رحلت پیامبر اکرم (ص) و شهادت امام حسن مجتبی (ع)', kind: 'religious' },
    { month: 5, day: 22, canonicalDate: '2026-08-13', label: 'شهادت امام رضا (ع)', kind: 'religious' },
    { month: 5, day: 30, canonicalDate: '2026-08-21', label: 'شهادت امام حسن عسکری (ع) و آغاز امامت حضرت ولیعصر (عج)', kind: 'religious' },
    { month: 6, day: 8, canonicalDate: '2026-08-30', label: 'ولادت پیامبر اکرم (ص) و امام جعفر صادق (ع)', kind: 'religious' },
    { month: 8, day: 22, canonicalDate: '2026-11-13', label: 'شهادت حضرت فاطمه زهرا (س)', kind: 'religious' },
    { month: 10, day: 2, canonicalDate: '2026-12-23', label: 'ولادت امام علی (ع) و روز پدر', kind: 'religious' },
    { month: 10, day: 16, canonicalDate: '2027-01-06', label: 'مبعث پیامبر اکرم (ص)', kind: 'religious' },
    { month: 11, day: 4, canonicalDate: '2027-01-24', label: 'ولادت حضرت قائم (عج)', kind: 'religious' },
    { month: 11, day: 22, canonicalDate: '2027-02-11', label: 'پیروزی انقلاب اسلامی ایران', kind: 'national' },
    { month: 12, day: 9, canonicalDate: '2027-02-28', label: 'شهادت امام علی (ع)', kind: 'religious' },
    { month: 12, day: 19, canonicalDate: '2027-03-10', label: 'عید سعید فطر', kind: 'religious' },
    { month: 12, day: 20, canonicalDate: '2027-03-11', label: 'تعطیل به مناسبت عید سعید فطر', kind: 'religious' },
    { month: 12, day: 29, canonicalDate: '2027-03-20', label: 'روز ملی شدن صنعت نفت ایران', kind: 'national' },
  ]
}

import { useMemo, useState } from 'react'
import {
  buildPersianMonthGrid,
  canonicalDateToPersian,
  canonicalWeekdayIndex,
  FIELDREP_MAX_PERSIAN_YEAR,
  FIELDREP_MIN_PERSIAN_YEAR,
  PERSIAN_WEEKDAY_NAMES,
  persianDateToCanonical,
  type PersianDateParts,
} from '@fieldrep/domain'

import { PageHeader } from '../components/PageHeader'
import { demoCalendarEvents } from '../data/demo-field-workspace'

const PERSIAN_MONTH_NAMES = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
] as const

const WEEKDAY_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'] as const
const DEMO_EVENT_MONTH = { year: 1405, month: 6 } as const
const IRAN_TIME_ZONE = 'Asia/Tehran'

const eventTypeLabel = {
  visit: 'ویزیت',
  meeting: 'میتینگ',
  leave: 'مرخصی',
  trip: 'ماموریت',
  company_closure: 'تعطیلی شرکت',
} as const

function canonicalTodayInIran(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: IRAN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = new Map(parts.map((part) => [part.type, part.value]))
  const year = values.get('year')
  const month = values.get('month')
  const day = values.get('day')
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error('Unable to resolve current Iran calendar date')
  }
  return `${year}-${month}-${day}`
}

function shiftPersianMonth(current: Pick<PersianDateParts, 'year' | 'month'>, delta: number) {
  const absoluteMonth = current.year * 12 + current.month - 1 + delta
  const year = Math.floor(absoluteMonth / 12)
  const month = (absoluteMonth % 12) + 1
  if (year < FIELDREP_MIN_PERSIAN_YEAR || year > FIELDREP_MAX_PERSIAN_YEAR) return current
  return { year, month }
}

function formatNumber(value: number): string {
  return value.toLocaleString('fa-IR', { useGrouping: false })
}

function isDemoEventMonth(parts: Pick<PersianDateParts, 'year' | 'month'>): boolean {
  return parts.year === DEMO_EVENT_MONTH.year && parts.month === DEMO_EVENT_MONTH.month
}

export function CalendarPage() {
  const todayCanonical = useMemo(canonicalTodayInIran, [])
  const todayPersian = useMemo(() => canonicalDateToPersian(todayCanonical), [todayCanonical])
  const [visibleMonth, setVisibleMonth] = useState(() => ({
    year: todayPersian.year,
    month: todayPersian.month,
  }))
  const [selectedDate, setSelectedDate] = useState(todayCanonical)

  const grid = useMemo(
    () => buildPersianMonthGrid(visibleMonth.year, visibleMonth.month),
    [visibleMonth],
  )
  const selectedPersian = useMemo(() => canonicalDateToPersian(selectedDate), [selectedDate])
  const selectedWeekday = useMemo(() => canonicalWeekdayIndex(selectedDate), [selectedDate])
  const selectedEvents = useMemo(
    () =>
      isDemoEventMonth(selectedPersian)
        ? demoCalendarEvents.filter((event) => event.day === selectedPersian.day)
        : [],
    [selectedPersian],
  )

  function moveMonth(delta: number) {
    const next = shiftPersianMonth(visibleMonth, delta)
    setVisibleMonth(next)
    setSelectedDate(persianDateToCanonical({ year: next.year, month: next.month, day: 1 }))
  }

  function goToToday() {
    setVisibleMonth({ year: todayPersian.year, month: todayPersian.month })
    setSelectedDate(todayCanonical)
  }

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="CALENDAR"
        title="تقویم"
        description="تقویم شمسی عملیاتی برای ویزیت‌ها، جلسات، ماموریت‌ها، مرخصی و تعطیلات؛ با هفته‌ی شنبه تا جمعه."
        actions={
          <button type="button" className="min-h-11 rounded-2xl bg-[var(--accent)] px-4 text-sm font-bold text-white shadow-[0_8px_24px_rgba(36,87,214,.18)] transition hover:brightness-95">
            افزودن فعالیت
          </button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <article className="overflow-hidden rounded-[28px] border border-[var(--border-subtle)] bg-white shadow-[0_12px_40px_rgba(15,23,42,.04)]">
          <div className="border-b border-[var(--border-subtle)] bg-[linear-gradient(180deg,var(--accent-soft),white)] px-4 py-4 sm:px-6 sm:py-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="ماه بعد"
                  onClick={() => moveMonth(1)}
                  className="grid h-11 w-11 place-items-center rounded-2xl border border-[var(--border-subtle)] bg-white text-lg font-black text-[var(--text-secondary)] shadow-sm transition hover:border-[var(--accent-border)] hover:text-[var(--accent-strong)]"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={goToToday}
                  className="hidden min-h-11 rounded-2xl border border-[var(--border-subtle)] bg-white px-3 text-xs font-black text-[var(--text-secondary)] transition hover:border-[var(--accent-border)] hover:text-[var(--accent-strong)] sm:inline-flex sm:items-center"
                >
                  امروز
                </button>
              </div>

              <div className="min-w-0 text-center">
                <div className="flex items-center justify-center gap-2">
                  <h2 className="truncate text-lg font-black sm:text-xl">
                    {PERSIAN_MONTH_NAMES[visibleMonth.month - 1]} {formatNumber(visibleMonth.year)}
                  </h2>
                  {visibleMonth.year === todayPersian.year && visibleMonth.month === todayPersian.month ? (
                    <span className="hidden rounded-full border border-[var(--accent-border)] bg-white px-2 py-1 text-[9px] font-black text-[var(--accent-strong)] sm:inline-flex">
                      ماه جاری
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-[10px] font-medium text-[var(--text-tertiary)] sm:text-[11px]">
                  تقویم شمسی · هفته از شنبه · منطقه زمانی ایران
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={goToToday}
                  aria-label="رفتن به امروز"
                  className="grid h-11 w-11 place-items-center rounded-2xl border border-[var(--border-subtle)] bg-white text-[10px] font-black text-[var(--accent-strong)] shadow-sm sm:hidden"
                >
                  امروز
                </button>
                <button
                  type="button"
                  aria-label="ماه قبل"
                  onClick={() => moveMonth(-1)}
                  className="grid h-11 w-11 place-items-center rounded-2xl border border-[var(--border-subtle)] bg-white text-lg font-black text-[var(--text-secondary)] shadow-sm transition hover:border-[var(--accent-border)] hover:text-[var(--accent-strong)]"
                >
                  ›
                </button>
              </div>
            </div>
          </div>

          <div className="p-3 sm:p-6">
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {PERSIAN_WEEKDAY_NAMES.map((day, index) => (
                <div
                  key={day}
                  className={[
                    'pb-2 text-center text-[10px] font-black sm:text-xs',
                    index === 6 ? 'text-[var(--danger)]' : 'text-[var(--text-tertiary)]',
                  ].join(' ')}
                >
                  <span className="sm:hidden">{WEEKDAY_SHORT[index]}</span>
                  <span className="hidden sm:inline">{day}</span>
                </div>
              ))}

              {grid.cells.map((cell) => {
                const friday = cell.weekdayIndex === 6
                const selected = cell.canonicalDate === selectedDate
                const today = cell.canonicalDate === todayCanonical
                const cellEvents = isDemoEventMonth(cell.persian)
                  ? demoCalendarEvents.filter((event) => event.day === cell.persian.day)
                  : []
                const companyClosure = cellEvents.some((event) => event.type === 'company_closure')
                const hasActivity = cellEvents.some((event) => event.type !== 'company_closure')

                return (
                  <button
                    key={cell.canonicalDate}
                    type="button"
                    aria-label={`${formatNumber(cell.persian.day)} ${PERSIAN_MONTH_NAMES[cell.persian.month - 1]} ${formatNumber(cell.persian.year)}`}
                    aria-current={today ? 'date' : undefined}
                    onClick={() => {
                      setSelectedDate(cell.canonicalDate)
                      if (!cell.inCurrentMonth) {
                        setVisibleMonth({ year: cell.persian.year, month: cell.persian.month })
                      }
                    }}
                    className={[
                      'group relative flex min-h-[52px] flex-col items-center justify-center rounded-2xl border text-sm font-black transition sm:min-h-[70px] sm:rounded-[20px]',
                      selected
                        ? 'border-[var(--accent)] bg-[var(--accent)] text-white shadow-[0_10px_26px_rgba(36,87,214,.22)]'
                        : companyClosure
                          ? 'border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning-strong)]'
                          : today
                            ? 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-strong)]'
                            : 'border-transparent hover:border-[var(--border-subtle)] hover:bg-[var(--surface-soft)]',
                      !cell.inCurrentMonth && !selected ? 'opacity-35' : '',
                      friday && !selected && !companyClosure && !today ? 'text-[var(--danger)]' : '',
                    ].join(' ')}
                  >
                    <span>{formatNumber(cell.persian.day)}</span>
                    <span className="mt-1 flex h-2 items-center justify-center gap-1">
                      {hasActivity ? (
                        <span className={['h-1.5 w-1.5 rounded-full', selected ? 'bg-white' : 'bg-[var(--accent)]'].join(' ')} />
                      ) : null}
                      {companyClosure ? (
                        <span className={['h-1.5 w-1.5 rounded-full', selected ? 'bg-white' : 'bg-[var(--warning)]'].join(' ')} />
                      ) : null}
                    </span>
                    {today && !selected ? (
                      <span className="absolute right-1.5 top-1.5 text-[8px] font-black text-[var(--accent-strong)] sm:right-2 sm:top-2">امروز</span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </div>
        </article>

        <aside className="space-y-3">
          <article className="rounded-[28px] border border-[var(--accent-border)] bg-[var(--accent-soft)] p-5 shadow-[0_10px_30px_rgba(36,87,214,.05)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black text-[var(--accent-strong)]">
                  {PERSIAN_WEEKDAY_NAMES[selectedWeekday]}
                </p>
                <h2 className="mt-1 text-xl font-black">
                  {formatNumber(selectedPersian.day)} {PERSIAN_MONTH_NAMES[selectedPersian.month - 1]}
                </h2>
                <p className="mt-1 text-[11px] font-medium text-[var(--text-secondary)]">
                  {formatNumber(selectedPersian.year)} · برنامه روز
                </p>
              </div>
              <span className="rounded-full bg-white/90 px-2.5 py-1.5 text-[10px] font-black text-[var(--accent-strong)]">
                {formatNumber(selectedEvents.length)} فعالیت
              </span>
            </div>

            <div className="mt-5 space-y-2">
              {selectedEvents.length > 0 ? selectedEvents.map((event) => (
                <div key={`${event.time}-${event.title}`} className="rounded-2xl border border-white/80 bg-white/90 px-3.5 py-3 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-black">{event.title}</p>
                    <span className="shrink-0 rounded-full bg-[var(--surface-soft)] px-2 py-1 text-[9px] font-black text-[var(--text-secondary)]">
                      {eventTypeLabel[event.type]}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-5 text-[var(--text-secondary)]">
                    <span dir="ltr" className="font-bold">{event.time}</span> · {event.detail}
                  </p>
                </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-[var(--accent-border)] bg-white/60 px-4 py-6 text-center">
                  <p className="text-sm font-black text-[var(--text-secondary)]">فعالیتی برای این روز ثبت نشده</p>
                  <p className="mt-1 text-[11px] leading-5 text-[var(--text-tertiary)]">ویزیت، جلسه، ماموریت یا مرخصی از همین روز قابل اضافه‌شدن است.</p>
                </div>
              )}
            </div>
          </article>

          <article className="rounded-[22px] border border-[var(--border-subtle)] bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-black">راهنمای تقویم</p>
              <span className="rounded-full bg-[var(--surface-soft)] px-2 py-1 text-[9px] font-bold text-[var(--text-tertiary)]">FieldRep Calendar</span>
            </div>
            <div className="mt-3 space-y-2.5 text-xs text-[var(--text-secondary)]">
              <p className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[var(--accent)]" /> ویزیت یا فعالیت کاری</p>
              <p className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[var(--warning)]" /> تعطیلی یا برنامه شرکت</p>
              <p className="flex items-center gap-2"><span className="text-sm font-black text-[var(--danger)]">جمعه</span> پایان هفته / روز غیرکاری پایه</p>
            </div>
            <p className="mt-3 border-t border-[var(--border-subtle)] pt-3 text-[10px] leading-5 text-[var(--text-tertiary)]">
              تعطیلات رسمی و مذهبی از dataset سالانه‌ی نسخه‌دار و اعتبارسنجی‌شده به این لایه اضافه می‌شوند؛ منطق تبدیل تاریخ مستقل باقی می‌ماند.
            </p>
          </article>
        </aside>
      </div>
    </section>
  )
}

import { useMemo, useState } from 'react'
import {
  addCanonicalCalendarDays,
  buildPersianMonthGrid,
  canonicalDateToPersian,
  canonicalWeekdayIndex,
  FIELDREP_MAX_PERSIAN_YEAR,
  FIELDREP_MIN_PERSIAN_YEAR,
  PERSIAN_WEEKDAY_NAMES,
  persianDateToCanonical,
  type CalendarItem,
  type PersianDateParts,
} from '@fieldrep/domain'

import { PageHeader } from '../components/PageHeader'
import {
  buildCalendarAgendaModel,
  buildCalendarDayDetail,
  buildCalendarMonthModel,
  buildCalendarWeekModel,
  demoCalendarRecords,
  type CalendarDayModel,
} from '../features/calendar/preview-calendar'

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
const IRAN_TIME_ZONE = 'Asia/Tehran'
const AGENDA_DAYS = 7

type CalendarViewKey = 'month' | 'week' | 'day' | 'agenda'

const VIEW_LABELS: Record<CalendarViewKey, string> = {
  month: 'ماه',
  week: 'هفته',
  day: 'روز',
  agenda: 'دستور روز',
}

const ITEM_TYPE_LABELS: Record<CalendarItem['type'], string> = {
  visit: 'ویزیت',
  pharmacy_visit: 'ویزیت داروخانه',
  leave: 'مرخصی',
  business_trip: 'ماموریت',
  internal_meeting: 'جلسه داخلی',
  company_program: 'برنامه شرکت',
  doctor_program: 'برنامه پزشکان',
  public_holiday: 'تعطیل رسمی',
  company_closure: 'تعطیلی شرکت',
  workspace_closure: 'تعطیلی تیم',
  custom_activity: 'فعالیت سفارشی',
}

const REASON_LABELS: Record<string, string> = {
  non_working_weekday: 'روز هفته کاری نیست',
  public_holiday: 'تعطیل رسمی',
  company_closure: 'تعطیلی شرکت',
  workspace_closure: 'تعطیلی تیم',
  approved_leave: 'مرخصی تأییدشده',
  blocking_meeting: 'جلسه مسدودکننده برنامه',
  program_overlap: 'هم‌پوشانی با برنامه',
  business_trip_active: 'ماموریت فعال',
}

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

function monthOfCanonical(canonicalDate: string) {
  const parts = canonicalDateToPersian(canonicalDate)
  return { year: parts.year, month: parts.month }
}

function persianDayLabel(canonicalDate: string): string {
  const parts = canonicalDateToPersian(canonicalDate)
  return `${formatNumber(parts.day)} ${PERSIAN_MONTH_NAMES[parts.month - 1]}`
}

function itemTitle(item: CalendarItem): string {
  return item.title === '' ? ITEM_TYPE_LABELS[item.type] : item.title
}

function itemTime(item: CalendarItem): string {
  if (item.allDay) return 'تمام‌روز'
  return `${item.startsAt.slice(11, 16)} تا ${item.endsAt.slice(11, 16)}`
}

function itemDotClass(item: CalendarItem): string {
  switch (item.type) {
    case 'visit':
    case 'pharmacy_visit':
      return 'bg-[var(--accent)]'
    case 'public_holiday':
    case 'company_closure':
    case 'workspace_closure':
      return 'bg-[var(--danger)]'
    case 'leave':
    case 'business_trip':
      return 'bg-[var(--warning)]'
    default:
      return 'bg-[var(--warning)]'
  }
}

function itemBadgeClass(item: CalendarItem): string {
  switch (item.type) {
    case 'visit':
    case 'pharmacy_visit':
      return 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-strong)]'
    case 'public_holiday':
    case 'company_closure':
    case 'workspace_closure':
      return 'border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]'
    default:
      return 'border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning-strong)]'
  }
}

function MonthGrid({
  days,
  selectedDate,
  todayCanonical,
  onSelect,
}: {
  days: readonly CalendarDayModel[]
  selectedDate: string
  todayCanonical: string
  onSelect(canonicalDate: string, persian: PersianDateParts): void
}) {
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {PERSIAN_WEEKDAY_NAMES.map((name, index) => (
          <div
            key={name}
            className={[
              'grid h-9 place-items-center rounded-xl text-[10px] font-black sm:text-xs',
              index === 6 ? 'text-[var(--danger)]' : 'text-[var(--text-tertiary)]',
            ].join(' ')}
          >
            <span className="sm:hidden">{WEEKDAY_SHORT[index]}</span>
            <span className="hidden sm:inline">{name}</span>
          </div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1 sm:mt-2 sm:gap-2">
        {days.map((day) => {
          const persian = canonicalDateToPersian(day.canonicalDate)
          const selected = day.canonicalDate === selectedDate
          const today = day.canonicalDate === todayCanonical
          const friday = day.weekdayIndex === 6
          const blocked = !day.planningAllowed
          const holidayBlocked = day.reasons.some(
            (reason) =>
              reason === 'public_holiday' ||
              reason === 'company_closure' ||
              reason === 'workspace_closure',
          )
          const visibleItems = day.items.slice(0, 3)

          return (
            <button
              key={day.canonicalDate}
              type="button"
              aria-label={`${persianDayLabel(day.canonicalDate)} ${formatNumber(persian.year)}`}
              aria-current={today ? 'date' : undefined}
              onClick={() => onSelect(day.canonicalDate, persian)}
              className={[
                'group relative flex min-h-[52px] flex-col items-center justify-center rounded-2xl border text-sm font-black transition sm:min-h-[70px] sm:rounded-[20px]',
                selected
                  ? 'border-[var(--accent)] bg-[var(--accent)] text-white shadow-[0_10px_26px_rgba(36,87,214,.22)]'
                  : holidayBlocked
                    ? 'border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]'
                    : blocked
                      ? 'border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning-strong)]'
                      : today
                        ? 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-strong)]'
                        : 'border-transparent hover:border-[var(--border-subtle)] hover:bg-[var(--surface-soft)]',
                !day.inMonth && !selected ? 'opacity-35' : '',
                friday && !selected && !blocked && !today ? 'text-[var(--danger)]' : '',
              ].join(' ')}
            >
              <span>{formatNumber(persian.day)}</span>
              <span className="mt-1 flex h-2 items-center justify-center gap-1">
                {visibleItems.map((item) => (
                  <span
                    key={item.id}
                    className={[
                      'h-1.5 w-1.5 rounded-full',
                      selected ? 'bg-white' : itemDotClass(item),
                    ].join(' ')}
                  />
                ))}
              </span>
              {today && !selected ? (
                <span className="absolute right-1.5 top-1.5 text-[8px] font-black text-[var(--accent-strong)] sm:right-2 sm:top-2">
                  امروز
                </span>
              ) : null}
              {day.items.length > visibleItems.length ? (
                <span className="absolute left-1.5 top-1.5 text-[8px] font-black text-[var(--text-tertiary)] sm:left-2 sm:top-2">
                  +
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ItemRow({ item }: { item: CalendarItem }) {
  return (
    <div className="rounded-2xl border border-white/80 bg-white/90 px-3.5 py-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-black">{itemTitle(item)}</p>
        <span
          className={[
            'shrink-0 rounded-full border px-2 py-1 text-[9px] font-black',
            itemBadgeClass(item),
          ].join(' ')}
        >
          {ITEM_TYPE_LABELS[item.type]}
        </span>
      </div>
      <p className="mt-1.5 text-[11px] leading-5 text-[var(--text-secondary)]">
        <span dir="ltr" className="font-bold">
          {itemTime(item)}
        </span>
        {item.countsAsVisit ? ' · شمارش ویزیت' : ' · بدون شمارش ویزیت'}
      </p>
    </div>
  )
}

function WeekBoard({
  days,
  todayCanonical,
  selectedDate,
  onSelect,
}: {
  days: readonly CalendarDayModel[]
  todayCanonical: string
  selectedDate: string
  onSelect(canonicalDate: string): void
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      {days.map((day) => {
        const persian = canonicalDateToPersian(day.canonicalDate)
        const isToday = day.canonicalDate === todayCanonical
        const isSelected = day.canonicalDate === selectedDate
        return (
          <button
            key={day.canonicalDate}
            type="button"
            onClick={() => onSelect(day.canonicalDate)}
            className={[
              'rounded-[20px] border p-3 text-right transition',
              isSelected
                ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                : 'border-[var(--border-subtle)] bg-white hover:border-[var(--accent-border)]',
            ].join(' ')}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-black text-[var(--text-secondary)]">
                {PERSIAN_WEEKDAY_NAMES[day.weekdayIndex]}
              </span>
              <span className={['text-sm font-black', isToday ? 'text-[var(--accent-strong)]' : ''].join(' ')}>
                {formatNumber(persian.day)}
              </span>
            </div>
            <p className="mt-1 text-[9px] font-bold text-[var(--text-tertiary)]">
              {day.planningAllowed
                ? 'روز کاری'
                : REASON_LABELS[day.reasons[0] ?? ''] ?? 'غیرقابل برنامه‌ریزی'}
            </p>
            <div className="mt-2 space-y-1.5">
              {day.items.slice(0, 3).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-1 rounded-xl bg-[var(--surface-soft)] px-2 py-1.5"
                >
                  <span className="truncate text-[10px] font-black">{itemTitle(item)}</span>
                  <span
                    className={['h-1.5 w-1.5 shrink-0 rounded-full', itemDotClass(item)].join(' ')}
                  />
                </div>
              ))}
              {day.items.length > 3 ? (
                <p className="text-[9px] font-bold text-[var(--text-tertiary)]">
                  +{formatNumber(day.items.length - 3)} مورد دیگر
                </p>
              ) : null}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function AgendaBoard({ days }: { days: readonly CalendarDayModel[] }) {
  return (
    <div className="space-y-2">
      {days.map((day) => {
        const visitCount = day.items.filter((item) => item.countsAsVisit).length
        const activityCount = day.items.filter(
          (item) => item.countsAsWorkingActivity && !item.countsAsVisit,
        ).length
        return (
          <div
            key={day.canonicalDate}
            className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--border-subtle)] bg-white px-3.5 py-3"
          >
            <div className="min-w-0">
              <p className="text-xs font-black">
                {PERSIAN_WEEKDAY_NAMES[day.weekdayIndex]} · {persianDayLabel(day.canonicalDate)}
              </p>
              <p className="mt-0.5 text-[10px] font-medium text-[var(--text-tertiary)]">
                {visitCount > 0 || activityCount > 0
                  ? `${formatNumber(visitCount)} ویزیت · ${formatNumber(activityCount)} فعالیت غیرویزیت`
                  : 'برنامه‌ای ثبت نشده'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {day.reasons.map((reason) => (
                <span
                  key={reason}
                  className={[
                    'rounded-full border px-2 py-1 text-[9px] font-black',
                    day.planningAllowed
                      ? 'border-[var(--border-subtle)] bg-[var(--surface-soft)] text-[var(--text-secondary)]'
                      : 'border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]',
                  ].join(' ')}
                >
                  {REASON_LABELS[reason] ?? reason}
                </span>
              ))}
              {day.planningAllowed && day.reasons.length === 0 ? (
                <span className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-2 py-1 text-[9px] font-black text-[var(--accent-strong)]">
                  آماده برنامه‌ریزی
                </span>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function CalendarPage() {
  const todayCanonical = useMemo(canonicalTodayInIran, [])
  const todayPersian = useMemo(() => canonicalDateToPersian(todayCanonical), [todayCanonical])
  const [view, setView] = useState<CalendarViewKey>('month')
  const [visibleMonth, setVisibleMonth] = useState(() => ({
    year: todayPersian.year,
    month: todayPersian.month,
  }))
  const [selectedDate, setSelectedDate] = useState(todayCanonical)

  const grid = useMemo(
    () => buildPersianMonthGrid(visibleMonth.year, visibleMonth.month),
    [visibleMonth],
  )
  const monthModel = useMemo(() => buildCalendarMonthModel(demoCalendarRecords, grid), [grid])
  const weekModel = useMemo(
    () => buildCalendarWeekModel(demoCalendarRecords, selectedDate),
    [selectedDate],
  )
  const agendaModel = useMemo(
    () => buildCalendarAgendaModel(demoCalendarRecords, todayCanonical, AGENDA_DAYS),
    [todayCanonical],
  )
  const dayDetail = useMemo(
    () => buildCalendarDayDetail(demoCalendarRecords, selectedDate),
    [selectedDate],
  )
  const selectedPersian = useMemo(() => canonicalDateToPersian(selectedDate), [selectedDate])
  const selectedWeekday = useMemo(() => canonicalWeekdayIndex(selectedDate), [selectedDate])

  function selectDate(canonicalDate: string) {
    setSelectedDate(canonicalDate)
    const parts = canonicalDateToPersian(canonicalDate)
    if (parts.year !== visibleMonth.year || parts.month !== visibleMonth.month) {
      setVisibleMonth({ year: parts.year, month: parts.month })
    }
  }

  function moveMonth(delta: number) {
    const next = shiftPersianMonth(visibleMonth, delta)
    setVisibleMonth(next)
    setSelectedDate(persianDateToCanonical({ year: next.year, month: next.month, day: 1 }))
  }

  function shiftSelectedDate(delta: number) {
    selectDate(addCanonicalCalendarDays(selectedDate, delta))
  }

  function goToToday() {
    setVisibleMonth({ year: todayPersian.year, month: todayPersian.month })
    setSelectedDate(todayCanonical)
  }

  const headerTitle =
    view === 'month'
      ? `${PERSIAN_MONTH_NAMES[visibleMonth.month - 1]} ${formatNumber(visibleMonth.year)}`
      : view === 'week'
        ? `هفته ${persianDayLabel(weekModel[0]?.canonicalDate ?? selectedDate)} تا ${persianDayLabel(
            weekModel[6]?.canonicalDate ?? selectedDate,
          )}`
        : `${PERSIAN_WEEKDAY_NAMES[selectedWeekday]} ${persianDayLabel(selectedDate)}`

  const showRangeNav = view !== 'agenda'
  const onRangeBack = () => {
    if (view === 'month') moveMonth(1)
    else shiftSelectedDate(-1)
  }
  const onRangeForward = () => {
    if (view === 'month') moveMonth(-1)
    else shiftSelectedDate(1)
  }


  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="CALENDAR"
        title="تقویم عملیاتی"
        description="تقویم شمسی کامل کار: ویزیت‌ها، جلسات، برنامه‌ها، ماموریت‌ها، مرخصی و تعطیلات؛ با موتور تعارض و هفته شنبه تا جمعه."
        actions={
          <button type="button" className="min-h-11 rounded-2xl bg-[var(--accent)] px-4 text-sm font-bold text-white shadow-[0_8px_24px_rgba(36,87,214,.18)] transition hover:brightness-95">
            افزودن فعالیت
          </button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <article className="overflow-hidden rounded-[28px] border border-[var(--border-subtle)] bg-white shadow-[0_12px_40px_rgba(15,23,42,.04)]">
          <div className="border-b border-[var(--border-subtle)] bg-[linear-gradient(180deg,var(--accent-soft),white)] px-4 py-4 sm:px-6 sm:py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {showRangeNav ? (
                  <button
                    type="button"
                    aria-label={view === 'month' ? 'ماه بعد' : 'بعدی'}
                    onClick={onRangeBack}
                    className="grid h-11 w-11 place-items-center rounded-2xl border border-[var(--border-subtle)] bg-white text-lg font-black text-[var(--text-secondary)] shadow-sm transition hover:border-[var(--accent-border)] hover:text-[var(--accent-strong)]"
                  >
                    ‹
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={goToToday}
                  className="hidden min-h-11 rounded-2xl border border-[var(--border-subtle)] bg-white px-3 text-xs font-black text-[var(--text-secondary)] transition hover:border-[var(--accent-border)] hover:text-[var(--accent-strong)] sm:inline-flex sm:items-center"
                >
                  امروز
                </button>
              </div>

              <div className="min-w-0 text-center">
                <h2 className="truncate text-lg font-black sm:text-xl">{headerTitle}</h2>
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
                {showRangeNav ? (
                  <button
                    type="button"
                    aria-label={view === 'month' ? 'ماه قبل' : 'قبلی'}
                    onClick={onRangeForward}
                    className="grid h-11 w-11 place-items-center rounded-2xl border border-[var(--border-subtle)] bg-white text-lg font-black text-[var(--text-secondary)] shadow-sm transition hover:border-[var(--accent-border)] hover:text-[var(--accent-strong)]"
                  >
                    ›
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {(Object.keys(VIEW_LABELS) as CalendarViewKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setView(key)}
                  aria-pressed={view === key}
                  className={[
                    'min-h-9 rounded-xl px-3 text-[11px] font-black transition',
                    view === key
                      ? 'bg-[var(--accent)] text-white shadow-[0_6px_18px_rgba(36,87,214,.20)]'
                      : 'border border-[var(--border-subtle)] bg-white text-[var(--text-secondary)] hover:border-[var(--accent-border)] hover:text-[var(--accent-strong)]',
                  ].join(' ')}
                >
                  {VIEW_LABELS[key]}
                </button>
              ))}
              {view === 'month' ? (
                <span className="mr-auto hidden rounded-full border border-[var(--border-subtle)] bg-white px-2.5 py-1 text-[9px] font-black text-[var(--text-secondary)] sm:inline-flex">
                  {formatNumber(monthModel.workingDays)} روز کاری · {formatNumber(monthModel.blockedDays)} روز مسدود
                </span>
              ) : null}
            </div>
          </div>


          <div className="p-3 sm:p-5">
            {view === 'month' ? (
              <MonthGrid
                days={monthModel.days}
                selectedDate={selectedDate}
                todayCanonical={todayCanonical}
                onSelect={(canonicalDate, persian) => {
                  setSelectedDate(canonicalDate)
                  if (persian.year !== visibleMonth.year || persian.month !== visibleMonth.month) {
                    setVisibleMonth({ year: persian.year, month: persian.month })
                  }
                }}
              />
            ) : null}
            {view === 'week' ? (
              <WeekBoard
                days={weekModel}
                todayCanonical={todayCanonical}
                selectedDate={selectedDate}
                onSelect={selectDate}
              />
            ) : null}
            {view === 'day' ? (
              <div className="space-y-2">
                {dayDetail.items.length > 0 ? (
                  dayDetail.items.map((item) => <ItemRow key={item.id} item={item} />)
                ) : (
                  <div className="rounded-2xl border border-dashed border-[var(--accent-border)] bg-white/60 px-4 py-6 text-center">
                    <p className="text-sm font-black text-[var(--text-secondary)]">فعالیتی برای این روز ثبت نشده</p>
                    <p className="mt-1 text-[11px] leading-5 text-[var(--text-tertiary)]">
                      ویزیت، جلسه، ماموریت یا مرخصی از همین روز قابل اضافه‌شدن است.
                    </p>
                  </div>
                )}
              </div>
            ) : null}
            {view === 'agenda' ? <AgendaBoard days={agendaModel} /> : null}
          </div>
        </article>

        <aside className="space-y-3">
          <article className="rounded-[28px] border border-[var(--accent-border)] bg-[var(--accent-soft)] p-5 shadow-[0_10px_30px_rgba(36,87,214,.05)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black text-[var(--accent-strong)]">
                  {PERSIAN_WEEKDAY_NAMES[selectedWeekday]}
                </p>
                <h2 className="mt-1 text-xl font-black">{persianDayLabel(selectedDate)}</h2>
                <p className="mt-1 text-[11px] font-medium text-[var(--text-secondary)]">
                  {formatNumber(selectedPersian.year)} · وضعیت روز
                </p>
              </div>
              <span
                className={[
                  'rounded-full px-2.5 py-1.5 text-[10px] font-black',
                  dayDetail.day.planningAllowed
                    ? 'bg-white/90 text-[var(--accent-strong)]'
                    : 'bg-[var(--danger)] text-white',
                ].join(' ')}
              >
                {dayDetail.day.planningAllowed ? 'آماده برنامه‌ریزی' : 'غیرقابل برنامه‌ریزی'}
              </span>
            </div>

            {dayDetail.day.reasons.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1">
                {dayDetail.day.reasons.map((reason) => (
                  <span
                    key={reason}
                    className="rounded-full border border-[var(--warning)] bg-[var(--warning-soft)] px-2 py-1 text-[9px] font-black text-[var(--warning-strong)]"
                  >
                    {REASON_LABELS[reason] ?? reason}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="mt-5 space-y-2">
              {dayDetail.items.length > 0 ? (
                dayDetail.items.map((item) => <ItemRow key={item.id} item={item} />)
              ) : (
                <div className="rounded-2xl border border-dashed border-[var(--accent-border)] bg-white/60 px-4 py-6 text-center">
                  <p className="text-sm font-black text-[var(--text-secondary)]">فعالیتی برای این روز ثبت نشده</p>
                  <p className="mt-1 text-[11px] leading-5 text-[var(--text-tertiary)]">
                    ویزیت، جلسه، ماموریت یا مرخصی از همین روز قابل اضافه‌شدن است.
                  </p>
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
              <p className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[var(--accent)]" /> ویزیت (شمارش در دستیابی)</p>
              <p className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[var(--warning)]" /> جلسه، برنامه، مرخصی یا ماموریت</p>
              <p className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[var(--danger)]" /> تعطیل رسمی یا تعطیلی تیم/شرکت</p>
              <p className="flex items-center gap-2"><span className="text-sm font-black text-[var(--danger)]">جمعه</span> پایان هفته / روز غیرکاری پایه</p>
            </div>
            <p className="mt-3 border-t border-[var(--border-subtle)] pt-3 text-[10px] leading-5 text-[var(--text-tertiary)]">
              فعالیت‌های غیرویزیت هرگز شمارنده ویزیت پزشک (Frequency/Visited/Achievement) را تغییر نمی‌دهند؛ تعطیلات رسمی از dataset سالانه نسخه‌دار می‌آیند.
            </p>
          </article>
        </aside>
      </div>
    </section>
  )
}


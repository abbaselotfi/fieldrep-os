import { PageHeader } from '../components/PageHeader'
import { demoCalendarEvents } from '../data/demo-field-workspace'

const weekDays = [
  { full: 'شنبه', short: 'ش' },
  { full: 'یکشنبه', short: 'ی' },
  { full: 'دوشنبه', short: 'د' },
  { full: 'سه‌شنبه', short: 'س' },
  { full: 'چهارشنبه', short: 'چ' },
  { full: 'پنجشنبه', short: 'پ' },
  { full: 'جمعه', short: 'ج' },
] as const

const eventTypeLabel = {
  visit: 'ویزیت',
  meeting: 'میتینگ',
  leave: 'مرخصی',
  trip: 'ماموریت',
  company_closure: 'تعطیلی شرکت',
} as const

export function CalendarPage() {
  const selectedDay = 15
  const leadingBlankDays = 1
  const markedDays = new Set(demoCalendarEvents.map((event) => event.day))
  const companyDays = new Set(demoCalendarEvents.filter((event) => event.type === 'company_closure').map((event) => event.day))
  const selectedEvents = demoCalendarEvents.filter((event) => event.day === selectedDay)

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="CALENDAR"
        title="تقویم"
        description="ویزیت، مرخصی، ماموریت، میتینگ و تعطیلی شرکت روی یک تقویم عملیاتی مشترک نمایش داده می‌شوند."
        actions={
          <button type="button" className="min-h-11 rounded-2xl bg-[var(--accent)] px-4 text-sm font-bold text-white">افزودن فعالیت</button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <article className="overflow-hidden rounded-[26px] border border-[var(--border-subtle)] bg-white p-3 sm:p-6">
          <div className="flex items-center justify-between gap-3 px-1 sm:px-0">
            <button type="button" aria-label="ماه بعد" className="grid h-11 w-11 place-items-center rounded-2xl border border-[var(--border-subtle)] text-lg">‹</button>
            <div className="text-center">
              <h2 className="text-lg font-black">شهریور ۱۴۰۵</h2>
              <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">داده نمایشی · چرخه جاری</p>
            </div>
            <button type="button" aria-label="ماه قبل" className="grid h-11 w-11 place-items-center rounded-2xl border border-[var(--border-subtle)] text-lg">›</button>
          </div>

          <div className="mt-5 grid grid-cols-7 gap-0.5 sm:mt-6 sm:gap-2">
            {weekDays.map((day, index) => (
              <div key={day.full} className={['pb-2 text-center text-[10px] font-bold sm:text-xs', index === 6 ? 'text-[var(--danger)]' : 'text-[var(--text-tertiary)]'].join(' ')}>
                <span className="sm:hidden">{day.short}</span>
                <span className="hidden sm:inline">{day.full}</span>
              </div>
            ))}
            {Array.from({ length: leadingBlankDays }, (_, index) => <div key={`blank-${index}`} aria-hidden="true" />)}
            {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => {
              const columnIndex = (leadingBlankDays + day - 1) % 7
              const friday = columnIndex === 6
              const selected = day === selectedDay
              const hasEvent = markedDays.has(day)
              const companyEvent = companyDays.has(day)

              return (
                <button
                  key={day}
                  type="button"
                  aria-label={`${day.toLocaleString('fa-IR')} شهریور`}
                  className={[
                    'relative min-h-11 rounded-xl text-sm font-bold transition-colors sm:rounded-[20px]',
                    selected
                      ? 'bg-[var(--accent)] text-white shadow-[0_8px_20px_rgba(36,87,214,.2)]'
                      : companyEvent
                        ? 'bg-[var(--warning-soft)] text-[var(--warning-strong)]'
                        : 'hover:bg-[var(--surface-soft)]',
                    friday && !selected && !companyEvent ? 'text-[var(--danger)]' : '',
                  ].join(' ')}
                >
                  {day.toLocaleString('fa-IR')}
                  {hasEvent && !selected ? <span className="absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-[var(--accent)] sm:bottom-1.5" /> : null}
                </button>
              )
            })}
          </div>
        </article>

        <aside className="space-y-3">
          <article className="rounded-[26px] border border-[var(--accent-border)] bg-[var(--accent-soft)] p-5">
            <p className="text-xs font-bold text-[var(--accent-strong)]">{selectedDay.toLocaleString('fa-IR')} شهریور</p>
            <h2 className="mt-2 text-lg font-black">برنامه روز</h2>
            <div className="mt-4 space-y-2">
              {selectedEvents.map((event) => (
                <div key={`${event.time}-${event.title}`} className="rounded-2xl bg-white/85 px-3.5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-black">{event.title}</p>
                    <span className="shrink-0 rounded-full bg-[var(--surface-soft)] px-2 py-1 text-[9px] font-black text-[var(--text-secondary)]">{eventTypeLabel[event.type]}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--text-secondary)]"><span dir="ltr">{event.time}</span> · {event.detail}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-[22px] border border-[var(--border-subtle)] bg-white p-4">
            <p className="text-xs font-bold">راهنمای وضعیت</p>
            <div className="mt-3 space-y-2 text-xs text-[var(--text-secondary)]">
              <p className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[var(--accent)]" /> ویزیت / فعالیت</p>
              <p className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[var(--warning)]" /> تعطیلی یا برنامه شرکت</p>
              <p className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[var(--danger)]" /> جمعه / تعطیل رسمی</p>
            </div>
          </article>
        </aside>
      </div>
    </section>
  )
}

import { PageHeader } from '../components/PageHeader'

const weekDays = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'] as const
const markedDays = new Set([3, 6, 9, 15, 18, 23, 27])
const companyDays = new Set([20])

export function CalendarPage() {
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
        <article className="overflow-hidden rounded-[26px] border border-[var(--border-subtle)] bg-white p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <button type="button" aria-label="ماه بعد" className="grid h-11 w-11 place-items-center rounded-2xl border border-[var(--border-subtle)] text-lg">‹</button>
            <div className="text-center">
              <h2 className="text-lg font-black">شهریور ۱۴۰۵</h2>
              <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">چرخه جاری</p>
            </div>
            <button type="button" aria-label="ماه قبل" className="grid h-11 w-11 place-items-center rounded-2xl border border-[var(--border-subtle)] text-lg">›</button>
          </div>

          <div className="mt-6 grid grid-cols-7 gap-1 sm:gap-2">
            {weekDays.map((day, index) => (
              <div key={day} className={['pb-2 text-center text-[10px] font-bold sm:text-xs', index === 6 ? 'text-[var(--danger)]' : 'text-[var(--text-tertiary)]'].join(' ')}>{day}</div>
            ))}
            {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => {
              const friday = (day - 1) % 7 === 6
              const selected = day === 15
              const hasVisit = markedDays.has(day)
              const companyEvent = companyDays.has(day)

              return (
                <button
                  key={day}
                  type="button"
                  className={[
                    'relative aspect-square min-h-11 rounded-2xl text-sm font-bold transition-colors sm:rounded-[20px]',
                    selected
                      ? 'bg-[var(--accent)] text-white shadow-[0_8px_20px_rgba(36,87,214,.2)]'
                      : companyEvent
                        ? 'bg-[var(--warning-soft)] text-[var(--warning-strong)]'
                        : 'hover:bg-[var(--surface-soft)]',
                    friday && !selected && !companyEvent ? 'text-[var(--danger)]' : '',
                  ].join(' ')}
                >
                  {day.toLocaleString('fa-IR')}
                  {hasVisit && !selected ? <span className="absolute bottom-1.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-[var(--accent)]" /> : null}
                </button>
              )
            })}
          </div>
        </article>

        <aside className="space-y-3">
          <article className="rounded-[26px] border border-[var(--accent-border)] bg-[var(--accent-soft)] p-5">
            <p className="text-xs font-bold text-[var(--accent-strong)]">۱۵ شهریور</p>
            <h2 className="mt-2 text-lg font-black">برنامه روز</h2>
            <div className="mt-4 space-y-2">
              {['09:00 · ویزیت پزشک', '11:30 · ویزیت داروخانه', '14:00 · میتینگ تیم', '16:30 · ویزیت پزشک'].map((item) => (
                <div key={item} className="rounded-2xl bg-white/80 px-3.5 py-3 text-xs font-bold">{item}</div>
              ))}
            </div>
          </article>

          <article className="rounded-[22px] border border-[var(--border-subtle)] bg-white p-4">
            <p className="text-xs font-bold">راهنمای وضعیت</p>
            <div className="mt-3 space-y-2 text-xs text-[var(--text-secondary)]">
              <p className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[var(--accent)]" /> ویزیت / فعالیت</p>
              <p className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[var(--warning)]" /> برنامه یا تعطیلی شرکت</p>
              <p className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[var(--danger)]" /> تعطیل رسمی / جمعه</p>
            </div>
          </article>
        </aside>
      </div>
    </section>
  )
}

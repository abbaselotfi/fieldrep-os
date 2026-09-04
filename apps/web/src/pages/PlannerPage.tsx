import { PageHeader } from '../components/PageHeader'

const plannedVisits = [
  { time: '09:00', specialty: 'Internal Medicine', route: 'Route 8', className: 'A', frequency: '4 / 6' },
  { time: '10:30', specialty: 'Endocrinology', route: 'Route 8', className: 'A', frequency: '5 / 6' },
  { time: '12:00', specialty: 'General Practice', route: 'Route 8', className: 'B', frequency: '3 / 4' },
  { time: '15:00', specialty: 'Internal Medicine', route: 'Route 7', className: 'B', frequency: '2 / 4' },
] as const

export function PlannerPage() {
  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="PLAN & REPORT"
        title="پلن و ریپورت"
        description="همان منطق اصلی فایل اکسل، اما با چهار نمای هماهنگ برای کار میدانی، تقویم، جدول و نقشه."
        actions={
          <button type="button" className="min-h-11 rounded-2xl bg-[var(--accent)] px-4 text-sm font-bold text-white">+ افزودن به پلن</button>
        }
      />

      <article className="rounded-[24px] border border-[var(--border-subtle)] bg-white p-3 sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="inline-grid grid-cols-4 rounded-2xl bg-[var(--surface-soft)] p-1 text-xs font-bold">
            {['لیست', 'تقویم', 'اکسل', 'نقشه'].map((view, index) => (
              <button key={view} type="button" className={['min-h-10 rounded-xl px-3 transition-colors', index === 0 ? 'bg-white text-[var(--accent-strong)] shadow-sm' : 'text-[var(--text-secondary)]'].join(' ')}>{view}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {['۱۵–۱۹ شهریور', 'Route 8', 'همه کلاس‌ها'].map((filter) => (
              <button key={filter} type="button" className="min-h-10 rounded-xl border border-[var(--border-subtle)] bg-white px-3 text-xs font-bold text-[var(--text-secondary)]">{filter}⌄</button>
            ))}
          </div>
        </div>
      </article>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <article className="overflow-hidden rounded-[26px] border border-[var(--border-subtle)] bg-white">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4">
            <div>
              <p className="text-xs font-bold text-[var(--text-tertiary)]">شنبه ۱۵ شهریور</p>
              <h2 className="mt-1 text-lg font-black">برنامه روز</h2>
            </div>
            <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-bold text-[var(--accent-strong)]">9 هدف</span>
          </div>

          <div className="divide-y divide-[var(--border-subtle)]">
            {plannedVisits.map((visit, index) => (
              <div key={`${visit.time}-${visit.specialty}`} className="grid gap-3 px-4 py-4 sm:grid-cols-[64px_minmax(0,1fr)_auto] sm:items-center sm:px-5">
                <span dir="ltr" className="text-xs font-black text-[var(--text-secondary)]">{visit.time}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold">پزشک برنامه‌ریزی‌شده {index + 1}</p>
                    <span className="rounded-full bg-[var(--surface-app)] px-2 py-1 text-[10px] font-black">Class {visit.className}</span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-tertiary)]">{visit.specialty} · {visit.route}</p>
                </div>
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <span className="text-xs font-bold text-[var(--text-secondary)]">{visit.frequency}</span>
                  <button type="button" className="min-h-10 rounded-xl border border-[var(--border-subtle)] px-3 text-xs font-bold">جزئیات</button>
                </div>
              </div>
            ))}
          </div>
        </article>

        <aside className="space-y-3">
          <article className="rounded-[24px] border border-[var(--accent-border)] bg-[var(--accent-soft)] p-5">
            <p className="text-xs font-bold text-[var(--accent-strong)]">AI PLANNER</p>
            <h2 className="mt-2 text-lg font-black">پیشنهادهای هفته بعد</h2>
            <p className="mt-2 text-xs leading-6 text-[var(--text-secondary)]">پیشنهادها بعداً بر اساس Frequency، آخرین ویزیت، Route، تقویم و محدودیت‌های کاری امتیازدهی می‌شوند.</p>
            <button type="button" className="mt-4 min-h-10 w-full rounded-xl bg-white text-xs font-bold text-[var(--accent-strong)]">مشاهده منطق پیشنهاد</button>
          </article>
          <article className="rounded-[24px] border border-[var(--border-subtle)] bg-white p-5">
            <p className="text-xs font-bold text-[var(--text-tertiary)]">خلاصه سیکل</p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between"><span>پوشش</span><strong>78٪</strong></div>
              <div className="flex justify-between"><span>کلاس A عقب‌مانده</span><strong>3</strong></div>
              <div className="flex justify-between"><span>ویزیت تکراری</span><strong>0</strong></div>
            </div>
          </article>
        </aside>
      </div>
    </section>
  )
}

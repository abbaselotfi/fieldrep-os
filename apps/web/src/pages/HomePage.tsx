import { Link } from 'react-router-dom'

import { MetricCard } from '../components/MetricCard'
import { PageHeader } from '../components/PageHeader'
import { demoReportSummary, demoTodayPlan, demoWorkspace, getDemoCustomer } from '../data/demo-field-workspace'

const statusLabels = {
  completed: 'انجام شد',
  next: 'بعدی',
  planned: 'برنامه',
} as const

export function HomePage() {
  const completedCount = demoTodayPlan.filter((entry) => entry.status === 'completed').length
  const remainingCount = demoTodayPlan.length - completedCount
  const nextEntry = demoTodayPlan.find((entry) => entry.status === 'next') ?? demoTodayPlan.find((entry) => entry.status === 'planned') ?? demoTodayPlan[0]!
  const nextCustomer = getDemoCustomer(nextEntry.customerId)
  const nextLocation = nextCustomer.locations[0]!
  const progress = Math.round((completedCount / demoTodayPlan.length) * 100)

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="TODAY WORKSPACE"
        title="امروز"
        description={`${demoWorkspace.workspace} · ${demoWorkspace.territory} — نمای سریع پلن روز، فعالیت بعدی و وضعیت اجرا با داده نمایشی یک Field User.`}
        actions={
          <Link
            to="/visit/new"
            className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[var(--accent)] px-4 text-sm font-bold text-white shadow-[0_8px_22px_rgba(36,87,214,.2)]"
          >
            ثبت ویزیت
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="هدف امروز" value={demoTodayPlan.length.toLocaleString('fa-IR')} detail="ویزیت" emphasis />
        <MetricCard label="انجام‌شده" value={completedCount.toLocaleString('fa-IR')} detail={`${progress.toLocaleString('fa-IR')}٪`} />
        <MetricCard label="باقی‌مانده" value={remainingCount.toLocaleString('fa-IR')} detail="ویزیت" />
        <MetricCard label="Achievement" value={`${demoReportSummary.achievement.toLocaleString('fa-IR')}٪`} detail={demoWorkspace.cycle} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)]">
        <article className="rounded-[26px] border border-[var(--border-subtle)] bg-white p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-bold text-[var(--text-tertiary)]">فعالیت بعدی</p>
              <h2 className="mt-2 truncate text-xl font-black">{nextCustomer.name}</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">{nextCustomer.specialty} · {nextCustomer.route}</p>
            </div>
            <span dir="ltr" className="shrink-0 rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-bold text-[var(--accent-strong)]">{nextEntry.time}</span>
          </div>

          <div className="mt-6 rounded-2xl bg-[var(--surface-soft)] p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-[var(--text-tertiary)]">موقعیت انتخاب‌شده</p>
              <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-[var(--text-secondary)]">{nextLocation.label}</span>
            </div>
            <p className="mt-1.5 text-sm font-bold">{nextLocation.area} · مشهد</p>
            <p className="mt-1 text-xs leading-6 text-[var(--text-secondary)]">{nextLocation.address}</p>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/visit/new" className="inline-flex min-h-11 items-center rounded-2xl bg-[var(--text-primary)] px-4 text-sm font-bold text-white">شروع ویزیت</Link>
            <Link to="/planner" className="inline-flex min-h-11 items-center rounded-2xl border border-[var(--border-subtle)] px-4 text-sm font-bold text-[var(--text-secondary)]">باز کردن پلن</Link>
          </div>
        </article>

        <article className="rounded-[26px] border border-[var(--border-subtle)] bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-[var(--text-tertiary)]">پیشرفت روز</p>
              <h2 className="mt-1.5 text-lg font-black">{completedCount.toLocaleString('fa-IR')} از {demoTodayPlan.length.toLocaleString('fa-IR')} ویزیت</h2>
            </div>
            <span className="text-2xl font-black text-[var(--accent-strong)]">{progress.toLocaleString('fa-IR')}٪</span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--surface-app)]">
            <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2 text-center text-xs">
            <div className="rounded-2xl bg-[var(--surface-soft)] p-3">
              <strong className="block text-base">۴</strong>
              <span className="text-[var(--text-tertiary)]">کلاس A</span>
            </div>
            <div className="rounded-2xl bg-[var(--surface-soft)] p-3">
              <strong className="block text-base">۳</strong>
              <span className="text-[var(--text-tertiary)]">کلاس B/C</span>
            </div>
          </div>
        </article>
      </div>

      <article className="rounded-[26px] border border-[var(--border-subtle)] bg-white p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-[var(--text-tertiary)]">TIMELINE</p>
            <h2 className="mt-1 text-lg font-black">برنامه امروز</h2>
          </div>
          <Link to="/calendar" className="text-xs font-bold text-[var(--accent-strong)]">تقویم کامل</Link>
        </div>
        <div className="mt-5 divide-y divide-[var(--border-subtle)]">
          {demoTodayPlan.slice(0, 6).map((entry, index) => {
            const customer = getDemoCustomer(entry.customerId)
            return (
              <div key={`${entry.time}-${entry.customerId}-${index}`} className="grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-2 py-3.5 sm:grid-cols-[64px_minmax(0,1fr)_auto] sm:gap-3">
                <span dir="ltr" className="text-xs font-bold text-[var(--text-secondary)]">{entry.time}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{customer.name}</p>
                  <p className="mt-1 truncate text-xs text-[var(--text-tertiary)]">{customer.specialty} · {customer.locations[0]!.area}</p>
                </div>
                <span className="whitespace-nowrap rounded-full border border-[var(--border-subtle)] px-2 py-1 text-[10px] font-bold text-[var(--text-secondary)] sm:px-2.5">{statusLabels[entry.status]}</span>
              </div>
            )
          })}
        </div>
      </article>
    </section>
  )
}

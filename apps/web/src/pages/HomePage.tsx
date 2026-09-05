import { Link } from 'react-router-dom'

import { MetricCard } from '../components/MetricCard'
import { PageHeader } from '../components/PageHeader'
import { demoAiSuggestions, demoReportSummary, demoTodayPlan, demoWorkspace, getDemoCustomer } from '../data/demo-field-workspace'

const statusLabels = {
  completed: 'انجام‌شده',
  next: 'بعدی',
  planned: 'برنامه',
} as const

const statusClasses = {
  completed: 'bg-[var(--success-soft)] text-[var(--success)]',
  next: 'bg-[var(--accent-soft)] text-[var(--accent-strong)]',
  planned: 'bg-[var(--surface-soft)] text-[var(--text-secondary)]',
} as const

export function HomePage() {
  const completedCount = demoTodayPlan.filter((entry) => entry.status === 'completed').length
  const remainingCount = demoTodayPlan.length - completedCount
  const nextEntry = demoTodayPlan.find((entry) => entry.status === 'next') ?? demoTodayPlan.find((entry) => entry.status === 'planned') ?? demoTodayPlan[0]!
  const nextCustomer = getDemoCustomer(nextEntry.customerId)
  const nextLocation = nextCustomer.locations[0]!
  const progress = Math.round((completedCount / demoTodayPlan.length) * 100)
  const topSuggestion = demoAiSuggestions[0]!
  const suggestedCustomer = getDemoCustomer(topSuggestion.customerId)
  const persianDate = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="DAILY WORKSPACE"
        title="داشبورد روزانه"
        description={`${demoWorkspace.workspace} · ${demoWorkspace.territory} — تمرکز روی کار بعدی، پیشرفت روز و ثبت سریع بدون شلوغی اضافه.`}
        actions={
          <Link
            to="/visit/new"
            className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[var(--accent)] px-4 text-sm font-extrabold text-white shadow-[0_10px_24px_rgba(0,102,204,.24)] transition-transform active:scale-[.98]"
          >
            ثبت سریع ویزیت
          </Link>
        }
      />

      <article className="surface-hero app-card overflow-hidden p-5 sm:p-6 lg:p-7">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,.8fr)] lg:items-center">
          <div>
            <p className="text-xs font-bold text-[var(--accent-strong)]">{persianDate}</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">روز بخیر، {demoWorkspace.user}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-[var(--text-secondary)]">امروز {demoTodayPlan.length.toLocaleString('fa-IR')} ویزیت در برنامه داری. مهم‌ترین کار بعدی را همین‌جا می‌بینی و با یک لمس می‌توانی گزارش را شروع کنی.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link to="/visit/new" className="inline-flex min-h-11 items-center rounded-2xl bg-[var(--text-primary)] px-4 text-sm font-extrabold text-[var(--surface-app)]">شروع روز</Link>
              <Link to="/planner" className="inline-flex min-h-11 items-center rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-soft)] px-4 text-sm font-bold text-[var(--text-secondary)]">مرور برنامه</Link>
            </div>
          </div>

          <div className="rounded-[22px] border border-[var(--border-subtle)] bg-[var(--surface-glass)] p-4 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold text-[var(--text-tertiary)]">پیشرفت امروز</p>
                <p className="mt-1 text-sm font-extrabold">{completedCount.toLocaleString('fa-IR')} از {demoTodayPlan.length.toLocaleString('fa-IR')} ویزیت</p>
              </div>
              <strong className="text-3xl font-black text-[var(--accent-strong)]">{progress.toLocaleString('fa-IR')}٪</strong>
            </div>
            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
              <div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-[var(--surface-soft)] p-2.5"><strong className="block text-base">{demoTodayPlan.length.toLocaleString('fa-IR')}</strong><span className="text-[10px] text-[var(--text-tertiary)]">برنامه</span></div>
              <div className="rounded-2xl bg-[var(--success-soft)] p-2.5"><strong className="block text-base text-[var(--success)]">{completedCount.toLocaleString('fa-IR')}</strong><span className="text-[10px] text-[var(--text-tertiary)]">انجام‌شده</span></div>
              <div className="rounded-2xl bg-[var(--warning-soft)] p-2.5"><strong className="block text-base text-[var(--warning-strong)]">{remainingCount.toLocaleString('fa-IR')}</strong><span className="text-[10px] text-[var(--text-tertiary)]">باقی‌مانده</span></div>
            </div>
          </div>
        </div>
      </article>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="ویزیت‌های امروز" value={demoTodayPlan.length.toLocaleString('fa-IR')} detail="هدف روزانه" emphasis />
        <MetricCard label="انجام‌شده" value={completedCount.toLocaleString('fa-IR')} detail={`${progress.toLocaleString('fa-IR')}٪ امروز`} />
        <MetricCard label="باقی‌مانده" value={remainingCount.toLocaleString('fa-IR')} detail="تا پایان روز" />
        <MetricCard label="Achievement" value={`${demoReportSummary.achievement.toLocaleString('fa-IR')}٪`} detail={demoWorkspace.cycle} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <article className="app-card app-card-interactive p-5 xl:col-span-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-[var(--text-tertiary)]">ویزیت بعدی</p>
              <h3 className="mt-2 truncate text-lg font-black">{nextCustomer.name}</h3>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">{nextCustomer.specialty} · {nextCustomer.route}</p>
            </div>
            <span dir="ltr" className="shrink-0 rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-black text-[var(--accent-strong)]">{nextEntry.time}</span>
          </div>
          <div className="mt-4 rounded-2xl bg-[var(--surface-soft)] p-3.5">
            <p className="text-[10px] font-bold text-[var(--text-tertiary)]">{nextLocation.label}</p>
            <p className="mt-1 text-sm font-bold">{nextLocation.area}</p>
            <p className="mt-1 text-xs leading-6 text-[var(--text-secondary)]">{nextLocation.address}</p>
          </div>
          <Link to="/visit/new" className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-2xl bg-[var(--accent)] px-4 text-xs font-extrabold text-white">شروع ویزیت</Link>
        </article>

        <article className="ai-surface app-card app-card-interactive p-5 xl:col-span-1">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold text-[var(--ai-strong)]">پیشنهاد AI</p>
              <h3 className="mt-2 text-lg font-black">{suggestedCustomer.name}</h3>
            </div>
            <span className="rounded-full bg-[var(--ai-soft)] px-2.5 py-1 text-[10px] font-black text-[var(--ai-strong)]">امتیاز {topSuggestion.score.toLocaleString('fa-IR')}</span>
          </div>
          <p className="mt-3 text-xs leading-6 text-[var(--text-secondary)]">{topSuggestion.reason}</p>
          <Link to="/ai" className="mt-4 inline-flex min-h-10 items-center rounded-2xl border border-[var(--border-strong)] px-4 text-xs font-extrabold text-[var(--ai-strong)]">دیدن تحلیل</Link>
        </article>

        <article className="app-card app-card-interactive p-5 xl:col-span-1">
          <p className="text-[11px] font-bold text-[var(--text-tertiary)]">کارهای سریع</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link to="/planner" className="rounded-2xl bg-[var(--surface-soft)] p-3 text-center text-xs font-extrabold">برنامه‌ریزی</Link>
            <Link to="/customers" className="rounded-2xl bg-[var(--surface-soft)] p-3 text-center text-xs font-extrabold">پزشکان</Link>
            <Link to="/reports" className="rounded-2xl bg-[var(--surface-soft)] p-3 text-center text-xs font-extrabold">عملکرد</Link>
            <Link to="/calendar" className="rounded-2xl bg-[var(--surface-soft)] p-3 text-center text-xs font-extrabold">تقویم</Link>
          </div>
        </article>
      </div>

      <article className="app-card p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold text-[var(--text-tertiary)]">ویزیت‌های امروز</p>
            <h2 className="mt-1 text-lg font-black">مسیر روز</h2>
          </div>
          <Link to="/calendar" className="text-xs font-extrabold text-[var(--accent-strong)]">تقویم کامل</Link>
        </div>

        <div className="no-scrollbar mt-5 flex snap-x gap-3 overflow-x-auto pb-2">
          {demoTodayPlan.map((entry, index) => {
            const customer = getDemoCustomer(entry.customerId)
            return (
              <article key={`${entry.time}-${entry.customerId}-${index}`} className="min-w-[240px] snap-start rounded-[20px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-4 sm:min-w-[270px]">
                <div className="flex items-center justify-between gap-3">
                  <span dir="ltr" className="text-sm font-black">{entry.time}</span>
                  <span className={['rounded-full px-2 py-1 text-[9px] font-black', statusClasses[entry.status]].join(' ')}>{statusLabels[entry.status]}</span>
                </div>
                <h3 className="mt-3 truncate text-sm font-extrabold">{customer.name}</h3>
                <p className="mt-1 truncate text-[11px] text-[var(--text-tertiary)]">{customer.specialty} · {customer.locations[0]!.area}</p>
                <div className="mt-3 flex items-center justify-between text-[10px] text-[var(--text-secondary)]">
                  <span>{customer.route}</span>
                  <span className="font-black text-[var(--accent-strong)]">Class {customer.className}</span>
                </div>
              </article>
            )
          })}
        </div>
      </article>
    </section>
  )
}

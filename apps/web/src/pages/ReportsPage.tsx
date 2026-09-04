import { MetricCard } from '../components/MetricCard'
import { PageHeader } from '../components/PageHeader'
import { demoReportSummary, demoTodayPlan, getDemoCustomer } from '../data/demo-field-workspace'

export function ReportsPage() {
  const completedEntries = demoTodayPlan.filter((entry) => entry.status === 'completed')

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="REPORTS"
        title="گزارش‌ها"
        description="گزارش روزانه، هفتگی، ماهانه و سیکلی با Scope کاربر؛ داده‌های این مرحله کاملاً نمایشی و مستقل از داده واقعی شرکت هستند."
        actions={<button type="button" className="min-h-11 rounded-2xl border border-[var(--border-subtle)] bg-white px-4 text-sm font-bold">خروجی</button>}
      />

      <div className="overflow-x-auto pb-1">
        <div className="inline-grid min-w-[320px] grid-cols-4 rounded-2xl border border-[var(--border-subtle)] bg-white p-1 text-xs font-bold">
          {['روزانه', 'هفتگی', 'ماهانه', 'سیکل'].map((period, index) => (
            <button key={period} type="button" className={['min-h-10 rounded-xl px-3 sm:px-4', index === 0 ? 'bg-[var(--accent-soft)] text-[var(--accent-strong)]' : 'text-[var(--text-secondary)]'].join(' ')}>{period}</button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Plan" value={demoReportSummary.planned.toLocaleString('fa-IR')} detail="امروز" />
        <MetricCard label="Report" value={demoReportSummary.completed.toLocaleString('fa-IR')} detail="امروز" emphasis />
        <MetricCard label="Achievement" value={`${demoReportSummary.achievement.toLocaleString('fa-IR')}٪`} detail="Plan vs Actual" />
        <MetricCard label="Unique Customers" value={demoReportSummary.uniqueCustomers.toLocaleString('fa-IR')} detail="ویزیت" />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <article className="rounded-[26px] border border-[var(--border-subtle)] bg-white p-5 sm:p-6">
          <p className="text-xs font-bold text-[var(--text-tertiary)]">PLAN VS ACTUAL</p>
          <h2 className="mt-1.5 text-lg font-black">خلاصه اجرای روز</h2>
          <div className="mt-6 space-y-4">
            {demoReportSummary.classAchievement.map(({ label, value }) => (
              <div key={label}>
                <div className="flex justify-between text-xs"><span className="font-bold">{label}</span><span>{value.toLocaleString('fa-IR')}٪</span></div>
                <div className="mt-2 h-2 rounded-full bg-[var(--surface-app)]"><div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${value}%` }} /></div>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[26px] border border-[var(--border-subtle)] bg-white p-5 sm:p-6">
          <p className="text-xs font-bold text-[var(--text-tertiary)]">ACTIVITY MIX</p>
          <h2 className="mt-1.5 text-lg font-black">فعالیت‌های ثبت‌شده</h2>
          <div className="mt-5 divide-y divide-[var(--border-subtle)]">
            {demoReportSummary.activityMix.map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-3 text-sm"><span>{label}</span><strong>{value.toLocaleString('fa-IR')}</strong></div>
            ))}
          </div>
        </article>
      </div>

      <article className="overflow-hidden rounded-[26px] border border-[var(--border-subtle)] bg-white">
        <div className="border-b border-[var(--border-subtle)] px-4 py-4 sm:px-5">
          <p className="text-xs font-bold text-[var(--text-tertiary)]">DAILY ACTUALS</p>
          <h2 className="mt-1 text-lg font-black">آخرین گزارش‌های امروز</h2>
        </div>
        <div className="divide-y divide-[var(--border-subtle)]">
          {completedEntries.slice(0, 5).map((entry) => {
            const customer = getDemoCustomer(entry.customerId)
            return (
              <div key={`${entry.time}-${entry.customerId}`} className="grid grid-cols-[54px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 sm:px-5">
                <span dir="ltr" className="text-xs font-black text-[var(--text-secondary)]">{entry.time}</span>
                <div className="min-w-0"><p className="truncate text-sm font-bold">{customer.name}</p><p className="mt-1 truncate text-[11px] text-[var(--text-tertiary)]">{customer.specialty} · {customer.route}</p></div>
                <span className="rounded-full bg-[var(--success-soft)] px-2.5 py-1 text-[10px] font-black text-[var(--success)]">ثبت‌شده</span>
              </div>
            )
          })}
        </div>
      </article>
    </section>
  )
}

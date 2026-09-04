import { MetricCard } from '../components/MetricCard'
import { PageHeader } from '../components/PageHeader'

export function ReportsPage() {
  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="REPORTS"
        title="گزارش‌ها"
        description="گزارش روزانه، هفتگی، ماهانه و سیکلی با همان مرز دسترسی کاربر؛ Supervisor و Admin بعداً Scope وسیع‌تری خواهند داشت."
        actions={<button type="button" className="min-h-11 rounded-2xl border border-[var(--border-subtle)] bg-white px-4 text-sm font-bold">خروجی</button>}
      />

      <div className="inline-grid grid-cols-4 rounded-2xl border border-[var(--border-subtle)] bg-white p-1 text-xs font-bold">
        {['روزانه', 'هفتگی', 'ماهانه', 'سیکل'].map((period, index) => (
          <button key={period} type="button" className={['min-h-10 rounded-xl px-4', index === 0 ? 'bg-[var(--accent-soft)] text-[var(--accent-strong)]' : 'text-[var(--text-secondary)]'].join(' ')}>{period}</button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Plan" value="9" detail="امروز" />
        <MetricCard label="Report" value="7" detail="امروز" emphasis />
        <MetricCard label="Achievement" value="78٪" detail="Plan vs Actual" />
        <MetricCard label="Unique Customers" value="7" detail="ویزیت" />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <article className="rounded-[26px] border border-[var(--border-subtle)] bg-white p-5 sm:p-6">
          <p className="text-xs font-bold text-[var(--text-tertiary)]">PLAN VS ACTUAL</p>
          <h2 className="mt-1.5 text-lg font-black">خلاصه اجرای روز</h2>
          <div className="mt-6 space-y-4">
            {[['Class A', 82], ['Class B', 75], ['Class C', 67]].map(([label, value]) => (
              <div key={String(label)}>
                <div className="flex justify-between text-xs"><span className="font-bold">{label}</span><span>{value}%</span></div>
                <div className="mt-2 h-2 rounded-full bg-[var(--surface-app)]"><div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${value}%` }} /></div>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[26px] border border-[var(--border-subtle)] bg-white p-5 sm:p-6">
          <p className="text-xs font-bold text-[var(--text-tertiary)]">ACTIVITY MIX</p>
          <h2 className="mt-1.5 text-lg font-black">فعالیت‌های ثبت‌شده</h2>
          <div className="mt-5 divide-y divide-[var(--border-subtle)]">
            {[['ویزیت پزشک', '7'], ['ویزیت داروخانه', '2'], ['میتینگ داخلی', '1'], ['ماموریت / سفر', '0']].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between py-3 text-sm"><span>{label}</span><strong>{value}</strong></div>
            ))}
          </div>
        </article>
      </div>
    </section>
  )
}

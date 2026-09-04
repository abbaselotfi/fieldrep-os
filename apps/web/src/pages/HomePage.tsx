import { Link } from 'react-router-dom'

import { MetricCard } from '../components/MetricCard'
import { PageHeader } from '../components/PageHeader'

const todayItems = [
  { time: '09:00', title: 'ویزیت برنامه‌ریزی‌شده', detail: 'Internal Medicine · Route 8', status: 'انجام شد' },
  { time: '11:00', title: 'ویزیت بعدی', detail: 'Clinic · Ahmadabad', status: 'بعدی' },
  { time: '13:30', title: 'میتینگ داخلی', detail: 'جلسه تیم دیابت', status: 'برنامه' },
  { time: '16:00', title: 'ویزیت برنامه‌ریزی‌شده', detail: 'Endocrinology · Route 8', status: 'برنامه' },
] as const

export function HomePage() {
  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="TODAY WORKSPACE"
        title="امروز"
        description="یک نمای سریع از برنامه روز، فعالیت بعدی و وضعیت اجرای پلن؛ بدون شلوغی یک داشبورد مدیریتی."
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
        <MetricCard label="هدف امروز" value="9" detail="ویزیت" emphasis />
        <MetricCard label="انجام‌شده" value="7" detail="78٪" />
        <MetricCard label="باقی‌مانده" value="2" detail="ویزیت" />
        <MetricCard label="پوشش مسیر" value="8" detail="Route" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)]">
        <article className="rounded-[26px] border border-[var(--border-subtle)] bg-white p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold text-[var(--text-tertiary)]">فعالیت بعدی</p>
              <h2 className="mt-2 text-xl font-black">ویزیت پزشک</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">Internal Medicine · Route 8</p>
            </div>
            <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-bold text-[var(--accent-strong)]">11:00</span>
          </div>

          <div className="mt-6 rounded-2xl bg-[var(--surface-soft)] p-4">
            <p className="text-xs font-semibold text-[var(--text-tertiary)]">موقعیت</p>
            <p className="mt-1.5 text-sm font-bold">احمدآباد · مشهد</p>
            <p className="mt-1 text-xs leading-6 text-[var(--text-secondary)]">موقعیت دقیق پس از اتصال Location/Map Provider نمایش داده می‌شود.</p>
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
              <h2 className="mt-1.5 text-lg font-black">7 از 9 ویزیت</h2>
            </div>
            <span className="text-2xl font-black text-[var(--accent-strong)]">78٪</span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--surface-app)]">
            <div className="h-full w-[78%] rounded-full bg-[var(--accent)]" />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2 text-center text-xs">
            <div className="rounded-2xl bg-[var(--surface-soft)] p-3">
              <strong className="block text-base">4</strong>
              <span className="text-[var(--text-tertiary)]">کلاس A</span>
            </div>
            <div className="rounded-2xl bg-[var(--surface-soft)] p-3">
              <strong className="block text-base">3</strong>
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
          {todayItems.map((item) => (
            <div key={`${item.time}-${item.title}`} className="grid grid-cols-[58px_minmax(0,1fr)_auto] items-center gap-3 py-3.5">
              <span dir="ltr" className="text-xs font-bold text-[var(--text-secondary)]">{item.time}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{item.title}</p>
                <p className="mt-1 truncate text-xs text-[var(--text-tertiary)]">{item.detail}</p>
              </div>
              <span className="rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-[10px] font-bold text-[var(--text-secondary)]">{item.status}</span>
            </div>
          ))}
        </div>
      </article>
    </section>
  )
}

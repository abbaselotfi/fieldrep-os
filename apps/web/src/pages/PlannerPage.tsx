import { useState } from 'react'
import { Link } from 'react-router-dom'

import { PageHeader } from '../components/PageHeader'
import {
  demoAiSuggestions,
  demoTodayPlan,
  demoWeekPlan,
  getDemoCustomer,
  type DemoPlanStatus,
} from '../data/demo-field-workspace'

type PlannerView = 'list' | 'calendar' | 'excel' | 'map'

const plannerViews: readonly { key: PlannerView; label: string }[] = [
  { key: 'list', label: 'لیست' },
  { key: 'calendar', label: 'تقویم' },
  { key: 'excel', label: 'اکسل' },
  { key: 'map', label: 'نقشه' },
]

const statusLabels: Record<DemoPlanStatus, string> = {
  completed: 'انجام شد',
  next: 'بعدی',
  planned: 'برنامه',
}

function ListPlannerView() {
  const selectedDay = demoWeekPlan[0]!

  return (
    <article className="overflow-hidden rounded-[26px] border border-[var(--border-subtle)] bg-white">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-4 sm:px-5">
        <div>
          <p className="text-xs font-bold text-[var(--text-tertiary)]">{selectedDay.weekday} {selectedDay.day.toLocaleString('fa-IR')} شهریور</p>
          <h2 className="mt-1 text-lg font-black">برنامه روز</h2>
        </div>
        <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-bold text-[var(--accent-strong)]">{selectedDay.target.toLocaleString('fa-IR')} هدف</span>
      </div>

      <div className="divide-y divide-[var(--border-subtle)]">
        {selectedDay.customerIds.map((customerId, index) => {
          const customer = getDemoCustomer(customerId)
          const todayEntry = demoTodayPlan.find((entry) => entry.customerId === customerId)
          const location = customer.locations[0]!

          return (
            <div key={`${customerId}-${index}`} className="grid gap-3 px-4 py-4 sm:grid-cols-[64px_minmax(0,1fr)_auto] sm:items-center sm:px-5">
              <span dir="ltr" className="text-xs font-black text-[var(--text-secondary)]">{todayEntry?.time ?? '—'}</span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold">{customer.name}</p>
                  <span className="rounded-full bg-[var(--surface-app)] px-2 py-1 text-[10px] font-black">Class {customer.className}</span>
                  {todayEntry === undefined ? null : (
                    <span className="rounded-full border border-[var(--border-subtle)] px-2 py-1 text-[10px] font-bold text-[var(--text-secondary)]">
                      {statusLabels[todayEntry.status]}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-[var(--text-tertiary)]">{customer.specialty} · {customer.route} · {location.area}</p>
              </div>
              <div className="flex items-center justify-between gap-3 sm:justify-end">
                <span dir="ltr" className="text-xs font-bold text-[var(--text-secondary)]">{customer.frequencyCompleted} / {customer.frequencyTarget}</span>
                <button type="button" className="min-h-10 rounded-xl border border-[var(--border-subtle)] px-3 text-xs font-bold">جزئیات</button>
              </div>
            </div>
          )
        })}
      </div>
    </article>
  )
}

function CalendarPlannerView() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {demoWeekPlan.map((day) => (
        <article key={day.day} className="rounded-[24px] border border-[var(--border-subtle)] bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold text-[var(--text-tertiary)]">{day.weekday}</p>
              <h2 className="mt-1 text-base font-black">{day.day.toLocaleString('fa-IR')} شهریور</h2>
            </div>
            <span className="rounded-full bg-[var(--surface-soft)] px-2.5 py-1 text-[10px] font-black">{day.route}</span>
          </div>
          <div className="mt-4 flex items-end justify-between">
            <div>
              <strong className="text-2xl font-black">{day.customerIds.length.toLocaleString('fa-IR')}</strong>
              <span className="mr-1 text-xs text-[var(--text-secondary)]">پلن</span>
            </div>
            <span className="text-xs font-bold text-[var(--text-secondary)]">هدف {day.target.toLocaleString('fa-IR')}</span>
          </div>
          <div className="mt-4 space-y-2">
            {day.customerIds.slice(0, 3).map((customerId) => {
              const customer = getDemoCustomer(customerId)
              return <div key={customerId} className="truncate rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-xs font-bold">{customer.name}</div>
            })}
            {day.customerIds.length > 3 ? <p className="px-1 text-[11px] font-bold text-[var(--accent-strong)]">+ {(day.customerIds.length - 3).toLocaleString('fa-IR')} مورد دیگر</p> : null}
          </div>
        </article>
      ))}
    </div>
  )
}

function ExcelPlannerView() {
  return (
    <article className="overflow-hidden rounded-[26px] border border-[var(--border-subtle)] bg-white">
      <div className="border-b border-[var(--border-subtle)] px-4 py-4 sm:px-5">
        <p className="text-xs font-bold text-[var(--text-tertiary)]">EXCEL PARITY VIEW</p>
        <h2 className="mt-1 text-lg font-black">نمای فشرده هفتگی</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full border-collapse text-right text-xs">
          <thead className="bg-[var(--surface-soft)] text-[var(--text-tertiary)]">
            <tr>
              <th className="px-4 py-3 font-black">روز</th>
              <th className="px-4 py-3 font-black">مسیر</th>
              {Array.from({ length: 6 }, (_, index) => <th key={index} className="px-4 py-3 font-black">ویزیت {(index + 1).toLocaleString('fa-IR')}</th>)}
              <th className="px-4 py-3 font-black">جمع</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {demoWeekPlan.map((day) => (
              <tr key={day.day}>
                <td className="whitespace-nowrap px-4 py-3 font-black">{day.weekday} {day.day.toLocaleString('fa-IR')}</td>
                <td className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)]">{day.route}</td>
                {Array.from({ length: 6 }, (_, index) => {
                  const customerId = day.customerIds[index]
                  return <td key={index} className="max-w-40 px-4 py-3"><span className="block truncate font-bold">{customerId === undefined ? '—' : getDemoCustomer(customerId).name}</span></td>
                })}
                <td className="px-4 py-3 font-black">{day.customerIds.length.toLocaleString('fa-IR')} / {day.target.toLocaleString('fa-IR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-[var(--border-subtle)] px-4 py-3 text-[11px] leading-6 text-[var(--text-tertiary)] sm:px-5">در موبایل این نما عمداً افقی اسکرول می‌شود؛ نمای پیشنهادی موبایل «لیست» است.</p>
    </article>
  )
}

function MapPlannerView() {
  const locations = demoWeekPlan[0]!.customerIds.slice(0, 5).map((customerId) => getDemoCustomer(customerId))

  return (
    <article className="grid gap-4 rounded-[26px] border border-[var(--border-subtle)] bg-white p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="relative min-h-[360px] overflow-hidden rounded-[22px] border border-dashed border-[var(--accent-border)] bg-[linear-gradient(135deg,var(--surface-soft),var(--accent-soft))] p-5">
        <div className="max-w-md">
          <p className="text-xs font-black text-[var(--accent-strong)]">MAP PROVIDER SLOT</p>
          <h2 className="mt-2 text-xl font-black">نمای نقشه آماده اتصال</h2>
          <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">در P5 همین سطح به Adapter نقشه مانند نشان یا Google Maps متصل می‌شود. فعلاً فقط چیدمان و لیست لوکیشن‌ها بررسی می‌شود.</p>
        </div>
        <div className="absolute bottom-6 left-7 grid h-10 w-10 place-items-center rounded-full bg-[var(--accent)] text-xs font-black text-white shadow-lg">۱</div>
        <div className="absolute bottom-24 right-12 grid h-10 w-10 place-items-center rounded-full bg-white text-xs font-black text-[var(--accent-strong)] shadow-lg">۲</div>
        <div className="absolute left-1/2 top-1/2 grid h-10 w-10 place-items-center rounded-full bg-white text-xs font-black text-[var(--accent-strong)] shadow-lg">۳</div>
      </div>
      <div className="space-y-2">
        <p className="px-1 text-xs font-black text-[var(--text-tertiary)]">لوکیشن‌های روز</p>
        {locations.map((customer) => (
          <div key={customer.id} className="rounded-2xl border border-[var(--border-subtle)] p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-black">{customer.name}</p>
              <span className="shrink-0 rounded-full bg-[var(--surface-soft)] px-2 py-1 text-[10px] font-black">{customer.route}</span>
            </div>
            <p className="mt-1.5 text-xs text-[var(--text-secondary)]">{customer.locations[0]!.area} · {customer.locations[0]!.label}</p>
          </div>
        ))}
      </div>
    </article>
  )
}

export function PlannerPage() {
  const [activeView, setActiveView] = useState<PlannerView>('list')

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="PLAN & REPORT"
        title="پلن و ریپورت"
        description="منطق اصلی فایل اکسل در چهار نمای هماهنگ نمایش داده می‌شود؛ کاربر می‌تواند متناسب با موبایل، برنامه‌ریزی فشرده یا موقعیت، View را عوض کند."
        actions={
          <Link to="/visit/new" className="inline-flex min-h-11 items-center rounded-2xl bg-[var(--accent)] px-4 text-sm font-bold text-white">+ افزودن به پلن</Link>
        }
      />

      <article className="rounded-[24px] border border-[var(--border-subtle)] bg-white p-3 sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="grid grid-cols-4 rounded-2xl bg-[var(--surface-soft)] p-1 text-xs font-bold">
            {plannerViews.map((view) => (
              <button
                key={view.key}
                type="button"
                aria-pressed={activeView === view.key}
                onClick={() => setActiveView(view.key)}
                className={[
                  'min-h-10 rounded-xl px-2 transition-colors sm:px-3',
                  activeView === view.key ? 'bg-white text-[var(--accent-strong)] shadow-sm' : 'text-[var(--text-secondary)]',
                ].join(' ')}
              >
                {view.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {['۱۵–۱۹ شهریور', 'Route 8', 'همه کلاس‌ها'].map((filter) => (
              <button key={filter} type="button" className="min-h-10 rounded-xl border border-[var(--border-subtle)] bg-white px-3 text-xs font-bold text-[var(--text-secondary)]">{filter} ⌄</button>
            ))}
          </div>
        </div>
      </article>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          {activeView === 'list' ? <ListPlannerView /> : null}
          {activeView === 'calendar' ? <CalendarPlannerView /> : null}
          {activeView === 'excel' ? <ExcelPlannerView /> : null}
          {activeView === 'map' ? <MapPlannerView /> : null}
        </div>

        <aside className="space-y-3">
          <article className="rounded-[24px] border border-[var(--accent-border)] bg-[var(--accent-soft)] p-5">
            <p className="text-xs font-bold text-[var(--accent-strong)]">AI PLANNER · PREVIEW</p>
            <h2 className="mt-2 text-lg font-black">پیشنهادهای هفته بعد</h2>
            <div className="mt-4 space-y-2">
              {demoAiSuggestions.map((suggestion) => {
                const customer = getDemoCustomer(suggestion.customerId)
                return (
                  <div key={suggestion.customerId} className="rounded-2xl bg-white/80 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-black">{customer.name}</p>
                      <span className="text-[10px] font-black text-[var(--accent-strong)]">{suggestion.score.toLocaleString('fa-IR')} امتیاز</span>
                    </div>
                    <p className="mt-1.5 text-[11px] leading-5 text-[var(--text-secondary)]">{suggestion.reason}</p>
                  </div>
                )
              })}
            </div>
            <p className="mt-3 text-[10px] leading-5 text-[var(--text-tertiary)]">این داده‌ها نمایشی‌اند؛ موتور پیشنهاد واقعی در P7 پیاده‌سازی می‌شود.</p>
          </article>
          <article className="rounded-[24px] border border-[var(--border-subtle)] bg-white p-5">
            <p className="text-xs font-bold text-[var(--text-tertiary)]">خلاصه سیکل</p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between"><span>پوشش</span><strong>۷۸٪</strong></div>
              <div className="flex justify-between"><span>کلاس A عقب‌مانده</span><strong>۳</strong></div>
              <div className="flex justify-between"><span>ویزیت تکراری</span><strong>۰</strong></div>
            </div>
          </article>
        </aside>
      </div>
    </section>
  )
}

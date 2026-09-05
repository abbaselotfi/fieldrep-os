import { useMemo, useState } from 'react'

import { PageHeader } from '../components/PageHeader'
import { demoCustomers, getDemoCustomer } from '../data/demo-field-workspace'
import {
  createPreviewPlanSeed,
  previewPlannerDays,
  type PreviewPlanEntry,
} from '../features/planner/preview-plan'
import {
  createPreviewVisitActual,
  previewVisitProducts,
  type PreviewVisitActual,
} from '../features/visits/preview-visit'

const previewPlans = createPreviewPlanSeed()

function planLabel(entry: PreviewPlanEntry): string {
  const customer = getDemoCustomer(entry.customerId)
  const day = previewPlannerDays.find((candidate) => candidate.planDate === entry.planDate)
  return `${day?.jalaliDay.toLocaleString('fa-IR') ?? entry.planDate} شهریور · ${customer.name}`
}

export function VisitPage() {
  const firstPlan = previewPlans[0]!
  const [planEntryId, setPlanEntryId] = useState(firstPlan.id)
  const [customerId, setCustomerId] = useState(firstPlan.customerId)
  const [visitDate, setVisitDate] = useState(firstPlan.planDate)
  const [time, setTime] = useState('11:00')
  const [notes, setNotes] = useState('')
  const [productCounts, setProductCounts] = useState<Record<string, number>>(() => ({
    [previewVisitProducts[0]!.id]: 1,
  }))
  const [submitted, setSubmitted] = useState<PreviewVisitActual | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const customer = getDemoCustomer(customerId)
  const selectedPlan = useMemo(
    () => previewPlans.find((entry) => entry.id === planEntryId),
    [planEntryId],
  )
  const totalProductCalls = Object.values(productCounts).reduce((sum, count) => sum + count, 0)

  function selectPlan(nextPlanEntryId: string) {
    setPlanEntryId(nextPlanEntryId)
    setSubmitted(null)
    setSubmitError(null)
    if (nextPlanEntryId === '') return

    const plan = previewPlans.find((entry) => entry.id === nextPlanEntryId)
    if (plan === undefined) return
    setCustomerId(plan.customerId)
    setVisitDate(plan.planDate)
  }

  function setProductCount(productId: string, nextCount: number) {
    setProductCounts((current) => ({
      ...current,
      [productId]: Math.max(0, Math.min(100, nextCount)),
    }))
    setSubmitted(null)
  }

  function submitVisit() {
    try {
      const actual = createPreviewVisitActual(
        {
          customerId,
          visitDate,
          time,
          productCounts,
          ...(planEntryId === '' ? {} : { planEntryId }),
          ...(notes.trim() === '' ? {} : { notes }),
        },
        crypto.randomUUID(),
      )
      setSubmitted(actual)
      setSubmitError(null)
    } catch (error) {
      setSubmitted(null)
      setSubmitError(error instanceof Error ? error.message : 'visit_submit_failed')
    }
  }

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        eyebrow="CALL REPORT"
        title="ثبت و پایان ویزیت"
        description="فرم کوتاه و سریع برای تبدیل Plan به Actual Visit؛ اطلاعات مهم در دسترس است و جزئیات تخصصی فقط وقتی لازم باشند دیده می‌شوند."
      />

      <article className="app-card grid gap-3 p-4 text-xs leading-6 text-[var(--text-secondary)] sm:grid-cols-3 sm:p-5">
        <div className="rounded-2xl bg-[var(--accent-soft)] p-3.5"><strong className="block text-[var(--accent-strong)]">Plan</strong>ویزیت برنامه‌ریزی‌شده فقط قصد کاربر است.</div>
        <div className="rounded-2xl bg-[var(--success-soft)] p-3.5"><strong className="block text-[var(--success)]">Actual</strong>پس از انجام، رکورد واقعی جداگانه ساخته می‌شود.</div>
        <div className="rounded-2xl bg-[var(--surface-soft)] p-3.5"><strong className="block text-[var(--text-primary)]">Products</strong>هر محصول شمارنده مستقل Call دارد.</div>
      </article>

      <article className="app-card overflow-hidden">
        <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_280px]">
          <div className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold text-[var(--text-tertiary)]">Check-in موقعیت</p>
                <h2 className="mt-1 text-base font-black">{customer.locations[0]!.label} · {customer.locations[0]!.area}</h2>
                <p className="mt-2 text-xs leading-6 text-[var(--text-secondary)]">GPS و Accuracy در مدل دامنه پیش‌بینی شده‌اند؛ اتصال واقعی Check-in و Geofence طبق Roadmap در P6 انجام می‌شود.</p>
              </div>
              <span className="rounded-full bg-[var(--warning-soft)] px-2.5 py-1 text-[10px] font-black text-[var(--warning-strong)]">Preview</span>
            </div>
            <button type="button" className="mt-4 min-h-11 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 text-xs font-extrabold text-[var(--text-secondary)]">بررسی موقعیت فعلی</button>
          </div>
          <div className="relative min-h-44 overflow-hidden border-t border-[var(--border-subtle)] bg-[var(--surface-soft)] md:border-r md:border-t-0">
            <div className="absolute inset-0 opacity-50" style={{ backgroundImage: 'linear-gradient(var(--border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
            <div className="absolute inset-0 grid place-items-center">
              <div className="grid h-12 w-12 place-items-center rounded-full border-4 border-[var(--accent-border)] bg-[var(--accent)] text-xs font-black text-white shadow-[0_10px_26px_rgba(0,102,204,.3)]">GPS</div>
            </div>
          </div>
        </div>
      </article>

      <form
        className="app-card space-y-5 p-5 sm:p-7"
        onSubmit={(event) => {
          event.preventDefault()
          submitVisit()
        }}
      >
        <label className="block">
          <span className="text-xs font-bold">اتصال به پلن</span>
          <select
            value={planEntryId}
            onChange={(event) => selectPlan(event.target.value)}
            className="mt-2 min-h-12 w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 text-sm"
          >
            <option value="">بدون پلن قبلی · Unplanned Visit</option>
            {previewPlans.slice(0, 18).map((entry) => (
              <option key={entry.id} value={entry.id}>{planLabel(entry)}</option>
            ))}
          </select>
          <p className="mt-2 text-[11px] leading-5 text-[var(--text-tertiary)]">
            در API واقعی، مالک پلن از Session بررسی می‌شود و Client نمی‌تواند پلن کاربر دیگری را به Actual متصل کند.
          </p>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-bold">مشتری</span>
            <select
              value={customerId}
              disabled={selectedPlan !== undefined}
              onChange={(event) => {
                setCustomerId(event.target.value)
                setSubmitted(null)
              }}
              className="mt-2 min-h-12 w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 text-sm disabled:bg-[var(--surface-soft)] disabled:text-[var(--text-secondary)]"
            >
              {demoCustomers.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.specialty}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-bold">تاریخ</span>
            <select
              value={visitDate}
              disabled={selectedPlan !== undefined}
              onChange={(event) => {
                setVisitDate(event.target.value)
                setSubmitted(null)
              }}
              className="mt-2 min-h-12 w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 text-sm disabled:bg-[var(--surface-soft)] disabled:text-[var(--text-secondary)]"
            >
              {previewPlannerDays.map((day) => (
                <option key={day.planDate} value={day.planDate}>{day.weekday} {day.jalaliDay.toLocaleString('fa-IR')} شهریور</option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-bold">زمان انجام</span>
            <input
              type="time"
              value={time}
              onChange={(event) => {
                setTime(event.target.value)
                setSubmitted(null)
              }}
              className="mt-2 min-h-12 w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 text-sm"
            />
          </label>
          <div className="rounded-2xl bg-[var(--surface-soft)] p-4 text-xs leading-6 text-[var(--text-secondary)]">
            <strong className="block text-sm text-[var(--text-primary)]">{customer.name}</strong>
            {customer.specialty} · Class {customer.className} · {customer.route}<br />
            {customer.locations[0]!.label} · {customer.locations[0]!.area}
          </div>
        </div>

        <fieldset>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <legend className="text-xs font-bold">محصولات معرفی‌شده</legend>
            <span className="text-xs font-black text-[var(--accent-strong)]">جمع: {totalProductCalls.toLocaleString('fa-IR')}</span>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {previewVisitProducts.map((product) => {
              const count = productCounts[product.id] ?? 0
              return (
                <div key={product.id} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-black">{product.name}</p>
                    <span className={['h-2 w-2 rounded-full', count > 0 ? 'bg-[var(--success)]' : 'bg-[var(--border-strong)]'].join(' ')} />
                  </div>
                  <div className="mt-3 flex items-center justify-between rounded-xl bg-[var(--surface-raised)] p-1">
                    <button type="button" onClick={() => setProductCount(product.id, count - 1)} className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--surface-soft)] text-lg font-black" aria-label={`کاهش ${product.name}`}>−</button>
                    <strong className="min-w-10 text-center text-lg font-black">{count.toLocaleString('fa-IR')}</strong>
                    <button type="button" onClick={() => setProductCount(product.id, count + 1)} className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--surface-soft)] text-lg font-black" aria-label={`افزایش ${product.name}`}>+</button>
                  </div>
                </div>
              )
            })}
          </div>
        </fieldset>

        <label className="block">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-bold">یادداشت ویزیت</span>
            <button type="button" className="rounded-full bg-[var(--ai-soft)] px-3 py-1 text-[10px] font-black text-[var(--ai-strong)]">◉ یادداشت صوتی</button>
          </div>
          <textarea
            rows={4}
            value={notes}
            onChange={(event) => {
              setNotes(event.target.value)
              setSubmitted(null)
            }}
            placeholder="خلاصه ویزیت، واکنش پزشک، Follow-up…"
            className="mt-2 w-full resize-y rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 text-sm"
          />
        </label>

        {submitError === null ? null : (
          <div role="alert" className="rounded-2xl bg-[var(--danger-soft)] p-4 text-xs font-bold text-[var(--danger)]">ثبت Preview ناموفق بود: {submitError}</div>
        )}

        {submitted === null ? null : (
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--success-soft)] p-4 text-xs leading-6 text-[var(--success)]">
            <strong className="block text-sm">Actual Visit با موفقیت در Preview ساخته شد.</strong>
            نوع: {submitted.source === 'planned' ? 'Planned → Actual' : 'Unplanned Actual'} · Product Calls: {submitted.productCalls.reduce((sum, call) => sum + call.callCount, 0).toLocaleString('fa-IR')}
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => {
            setNotes('')
            setSubmitted(null)
            setSubmitError(null)
          }} className="min-h-12 rounded-2xl border border-[var(--border-subtle)] px-4 text-sm font-bold">پاک کردن یادداشت</button>
          <button type="submit" className="min-h-12 rounded-2xl bg-[var(--success)] px-6 text-sm font-black text-white shadow-[0_10px_24px_rgba(16,185,129,.22)]">ثبت و پایان ویزیت</button>
        </div>
      </form>

      <p className="px-1 text-[11px] leading-6 text-[var(--text-tertiary)]">
        این صفحه روی GitHub Pages از Preview state استفاده می‌کند. Client واقعی cookie-authenticated برای Worker پس از استقرار محیط ایزوله به API متصل می‌شود؛ GPS و Voice نیز فعلاً UI-ready هستند و داده ساختگی به‌عنوان evidence ذخیره نمی‌شود.
      </p>
    </section>
  )
}

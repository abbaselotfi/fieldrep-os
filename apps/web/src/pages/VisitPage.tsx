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
    <section className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        eyebrow="PLAN → ACTUAL VISIT"
        title="ثبت گزارش ویزیت"
        description="پلن و عملکرد واقعی جدا نگه داشته می‌شوند؛ گزارش می‌تواند به یک پلن وصل باشد یا به‌صورت Unplanned ثبت شود و Product Callهای واقعی را ذخیره کند."
      />

      <article className="grid gap-3 rounded-[24px] border border-[var(--accent-border)] bg-[var(--accent-soft)] p-4 text-xs leading-6 text-[var(--text-secondary)] sm:grid-cols-3 sm:p-5">
        <div><strong className="block text-[var(--accent-strong)]">Plan</strong>ویزیت برنامه‌ریزی‌شده فقط قصد کاربر است.</div>
        <div><strong className="block text-[var(--accent-strong)]">Actual</strong>پس از انجام، رکورد ویزیت واقعی جداگانه ساخته می‌شود.</div>
        <div><strong className="block text-[var(--accent-strong)]">Products</strong>هر محصول شمارنده مستقل Call دارد و برای گزارش‌ها قابل جمع‌زدن است.</div>
      </article>

      <form
        className="space-y-5 rounded-[26px] border border-[var(--border-subtle)] bg-white p-5 sm:p-7"
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
              className="mt-2 min-h-12 w-full rounded-2xl border border-[var(--border-subtle)] bg-white px-4 text-sm disabled:bg-[var(--surface-soft)] disabled:text-[var(--text-secondary)]"
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
              className="mt-2 min-h-12 w-full rounded-2xl border border-[var(--border-subtle)] bg-white px-4 text-sm disabled:bg-[var(--surface-soft)] disabled:text-[var(--text-secondary)]"
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
              className="mt-2 min-h-12 w-full rounded-2xl border border-[var(--border-subtle)] bg-white px-4 text-sm"
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
            <legend className="text-xs font-bold">Product Callهای واقعی</legend>
            <span className="text-xs font-black text-[var(--accent-strong)]">جمع: {totalProductCalls.toLocaleString('fa-IR')}</span>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {previewVisitProducts.map((product) => {
              const count = productCounts[product.id] ?? 0
              return (
                <div key={product.id} className="rounded-2xl border border-[var(--border-subtle)] p-3.5">
                  <p className="text-sm font-black">{product.name}</p>
                  <div className="mt-3 flex items-center justify-between rounded-xl bg-[var(--surface-soft)] p-1">
                    <button type="button" onClick={() => setProductCount(product.id, count - 1)} className="grid h-10 w-10 place-items-center rounded-lg bg-white text-lg font-black" aria-label={`کاهش ${product.name}`}>−</button>
                    <strong className="min-w-10 text-center text-lg font-black">{count.toLocaleString('fa-IR')}</strong>
                    <button type="button" onClick={() => setProductCount(product.id, count + 1)} className="grid h-10 w-10 place-items-center rounded-lg bg-white text-lg font-black" aria-label={`افزایش ${product.name}`}>+</button>
                  </div>
                </div>
              )
            })}
          </div>
        </fieldset>

        <label className="block">
          <span className="text-xs font-bold">یادداشت ویزیت</span>
          <textarea
            rows={4}
            value={notes}
            onChange={(event) => {
              setNotes(event.target.value)
              setSubmitted(null)
            }}
            placeholder="خلاصه ویزیت، واکنش پزشک، Follow-up…"
            className="mt-2 w-full resize-y rounded-2xl border border-[var(--border-subtle)] bg-white p-4 text-sm"
          />
        </label>

        <div className="rounded-2xl border border-dashed border-[var(--accent-border)] bg-[var(--accent-soft)] p-4">
          <p className="text-xs font-bold text-[var(--accent-strong)]">Location verification آماده اتصال</p>
          <p className="mt-1 text-xs leading-6 text-[var(--text-secondary)]">ساختار Actual از الان locationId را می‌پذیرد؛ GPS، Accuracy و Geofence طبق Roadmap در P6 فعال می‌شوند.</p>
        </div>

        {submitError === null ? null : (
          <div role="alert" className="rounded-2xl bg-red-50 p-4 text-xs font-bold text-red-700">ثبت Preview ناموفق بود: {submitError}</div>
        )}

        {submitted === null ? null : (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs leading-6 text-emerald-900">
            <strong className="block text-sm">Actual Visit با موفقیت در Preview ساخته شد.</strong>
            نوع: {submitted.source === 'planned' ? 'Planned → Actual' : 'Unplanned Actual'} · Product Calls: {submitted.productCalls.reduce((sum, call) => sum + call.callCount, 0).toLocaleString('fa-IR')}
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => {
            setNotes('')
            setSubmitted(null)
            setSubmitError(null)
          }} className="min-h-11 rounded-2xl border border-[var(--border-subtle)] px-4 text-sm font-bold">پاک کردن یادداشت</button>
          <button type="submit" className="min-h-11 rounded-2xl bg-[var(--accent)] px-5 text-sm font-bold text-white">ثبت Actual Visit</button>
        </div>
      </form>

      <p className="px-1 text-[11px] leading-6 text-[var(--text-tertiary)]">
        این صفحه روی GitHub Pages از Preview state استفاده می‌کند. Client واقعی cookie-authenticated برای Worker نیز در همین تسک اضافه شده و پس از استقرار محیط ایزوله به API وصل می‌شود.
      </p>
    </section>
  )
}

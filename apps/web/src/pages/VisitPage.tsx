import { PageHeader } from '../components/PageHeader'
import { demoCustomers, demoProducts } from '../data/demo-field-workspace'

export function VisitPage() {
  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <PageHeader eyebrow="VISIT REPORT" title="ثبت ویزیت" description="فرم پایه Plan → Actual با داده نمایشی. فیلدهای نهایی Excel parity و Outcome در P2 تکمیل می‌شوند." />

      <form className="space-y-5 rounded-[26px] border border-[var(--border-subtle)] bg-white p-5 sm:p-7" onSubmit={(event) => event.preventDefault()}>
        <label className="block">
          <span className="text-xs font-bold">مشتری</span>
          <select defaultValue="doctor-mehdi-sharifi" className="mt-2 min-h-12 w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 text-sm">
            {demoCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · {customer.specialty}</option>)}
          </select>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-bold">نوع فعالیت</span>
            <select className="mt-2 min-h-12 w-full rounded-2xl border border-[var(--border-subtle)] bg-white px-4 text-sm">
              <option>ویزیت پزشک</option>
              <option>ویزیت داروخانه</option>
              <option>میتینگ</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-bold">زمان</span>
            <input type="time" defaultValue="11:00" className="mt-2 min-h-12 w-full rounded-2xl border border-[var(--border-subtle)] bg-white px-4 text-sm" />
          </label>
        </div>

        <fieldset>
          <legend className="text-xs font-bold">محصولات مطرح‌شده</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {demoProducts.map((product, index) => (
              <label key={product} className="cursor-pointer">
                <input type="checkbox" defaultChecked={index === 0} className="peer sr-only" />
                <span className="inline-flex min-h-11 items-center rounded-2xl border border-[var(--border-subtle)] bg-white px-4 text-xs font-bold text-[var(--text-secondary)] peer-checked:border-[var(--accent-border)] peer-checked:bg-[var(--accent-soft)] peer-checked:text-[var(--accent-strong)]">{product}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block">
          <span className="text-xs font-bold">یادداشت</span>
          <textarea rows={4} placeholder="خلاصه ویزیت…" className="mt-2 w-full resize-y rounded-2xl border border-[var(--border-subtle)] bg-white p-4 text-sm" />
        </label>

        <div className="rounded-2xl border border-dashed border-[var(--accent-border)] bg-[var(--accent-soft)] p-4">
          <p className="text-xs font-bold text-[var(--accent-strong)]">Location verification آماده اتصال</p>
          <p className="mt-1 text-xs leading-6 text-[var(--text-secondary)]">GPS فقط در صورت فعال بودن قابلیت توسط شرکت و با مجوز سیستم‌عامل ثبت خواهد شد؛ وضعیت فاصله و دقت در P6 اضافه می‌شود.</p>
        </div>

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <button type="button" className="min-h-11 rounded-2xl border border-[var(--border-subtle)] px-4 text-sm font-bold">ذخیره پیش‌نویس</button>
          <button type="submit" className="min-h-11 rounded-2xl bg-[var(--accent)] px-5 text-sm font-bold text-white">ثبت گزارش</button>
        </div>
      </form>
    </section>
  )
}

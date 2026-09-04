import { PageHeader } from '../components/PageHeader'

export function VisitPage() {
  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <PageHeader eyebrow="VISIT REPORT" title="ثبت ویزیت" description="فرم پایه برای Plan → Actual. در P2 فیلدهای نهایی اکسل، محصول، Outcome و منطق Visited/Achievement به آن متصل می‌شوند." />

      <form className="space-y-4 rounded-[26px] border border-[var(--border-subtle)] bg-white p-5 sm:p-7" onSubmit={(event) => event.preventDefault()}>
        <label className="block">
          <span className="text-xs font-bold">مشتری</span>
          <button type="button" className="mt-2 flex min-h-12 w-full items-center justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 text-sm text-[var(--text-secondary)]">
            انتخاب پزشک / داروخانه
            <span aria-hidden="true">⌄</span>
          </button>
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

        <label className="block">
          <span className="text-xs font-bold">یادداشت</span>
          <textarea rows={4} placeholder="خلاصه ویزیت…" className="mt-2 w-full resize-y rounded-2xl border border-[var(--border-subtle)] bg-white p-4 text-sm" />
        </label>

        <div className="rounded-2xl border border-dashed border-[var(--accent-border)] bg-[var(--accent-soft)] p-4">
          <p className="text-xs font-bold text-[var(--accent-strong)]">Location verification آماده اتصال</p>
          <p className="mt-1 text-xs leading-6 text-[var(--text-secondary)]">GPS فقط در صورت فعال بودن قابلیت توسط شرکت و با رضایت/مجوز سیستم‌عامل ثبت خواهد شد.</p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="min-h-11 rounded-2xl border border-[var(--border-subtle)] px-4 text-sm font-bold">ذخیره پیش‌نویس</button>
          <button type="submit" className="min-h-11 rounded-2xl bg-[var(--accent)] px-5 text-sm font-bold text-white">ثبت گزارش</button>
        </div>
      </form>
    </section>
  )
}

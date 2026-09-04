import { PageHeader } from '../components/PageHeader'

const customers = [
  ['پزشک نمونه ۱', 'Internal Medicine', 'A', 'Route 8', '4 / 6'],
  ['پزشک نمونه ۲', 'Endocrinology', 'A', 'Route 7', '5 / 6'],
  ['پزشک نمونه ۳', 'General Practice', 'B', 'Route 8', '3 / 4'],
  ['داروخانه نمونه', 'Pharmacy', 'B', 'Route 8', '2 / 4'],
] as const

export function CustomersPage() {
  return (
    <section className="space-y-6">
      <PageHeader eyebrow="CUSTOMERS" title="مشتریان" description="فهرست مجاز پزشکان، داروخانه‌ها و مراکز هر Workspace با امکان جستجو، فیلتر و چند لوکیشن." />

      <article className="rounded-[24px] border border-[var(--border-subtle)] bg-white p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_repeat(3,auto)]">
          <label className="relative">
            <span className="sr-only">جستجوی مشتری</span>
            <input type="search" placeholder="جستجوی نام، تخصص یا مسیر…" className="min-h-11 w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 text-sm outline-none" />
          </label>
          {['Route', 'Class', 'Specialty'].map((filter) => (
            <button key={filter} type="button" className="min-h-11 rounded-2xl border border-[var(--border-subtle)] px-4 text-xs font-bold text-[var(--text-secondary)]">{filter} ⌄</button>
          ))}
        </div>
      </article>

      <article className="overflow-hidden rounded-[26px] border border-[var(--border-subtle)] bg-white">
        <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(140px,.8fr)_90px_100px_100px] gap-4 border-b border-[var(--border-subtle)] bg-[var(--surface-soft)] px-5 py-3 text-[11px] font-bold text-[var(--text-tertiary)] md:grid">
          <span>مشتری</span><span>تخصص</span><span>کلاس</span><span>مسیر</span><span>Frequency</span>
        </div>
        <div className="divide-y divide-[var(--border-subtle)]">
          {customers.map(([name, specialty, grade, route, frequency]) => (
            <button key={name} type="button" className="grid w-full gap-2 px-4 py-4 text-right hover:bg-[var(--surface-soft)] md:grid-cols-[minmax(0,1.3fr)_minmax(140px,.8fr)_90px_100px_100px] md:items-center md:gap-4 md:px-5">
              <span className="font-bold">{name}</span>
              <span className="text-xs text-[var(--text-secondary)]">{specialty}</span>
              <span className="w-fit rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[10px] font-black text-[var(--accent-strong)]">{grade}</span>
              <span className="text-xs text-[var(--text-secondary)]">{route}</span>
              <span className="text-xs font-bold">{frequency}</span>
            </button>
          ))}
        </div>
      </article>
    </section>
  )
}

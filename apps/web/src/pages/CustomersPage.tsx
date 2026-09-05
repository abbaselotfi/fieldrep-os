import { PageHeader } from '../components/PageHeader'
import { demoCustomers } from '../data/demo-field-workspace'

const kindLabel = {
  doctor: 'پزشک',
  pharmacy: 'داروخانه',
  clinic: 'مرکز',
} as const

export function CustomersPage() {
  return (
    <section className="space-y-6">
      <PageHeader eyebrow="CUSTOMERS" title="مشتریان" description="فهرست مجاز پزشکان، داروخانه‌ها و مراکز Workspace با داده نمایشی، امکان جستجو، فیلتر و چند لوکیشن." />

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
        <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(130px,.8fr)_80px_95px_105px_90px] gap-3 border-b border-[var(--border-subtle)] bg-[var(--surface-soft)] px-5 py-3 text-[11px] font-bold text-[var(--text-tertiary)] lg:grid">
          <span>مشتری</span><span>تخصص</span><span>کلاس</span><span>مسیر</span><span>Frequency</span><span>لوکیشن</span>
        </div>
        <div className="divide-y divide-[var(--border-subtle)]">
          {demoCustomers.map((customer) => (
            <button key={customer.id} type="button" className="grid w-full gap-3 px-4 py-4 text-right transition-colors hover:bg-[var(--surface-soft)] lg:grid-cols-[minmax(0,1.3fr)_minmax(130px,.8fr)_80px_95px_105px_90px] lg:items-center lg:gap-3 lg:px-5">
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-bold">{customer.name}</span>
                  <span className="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[9px] font-black text-[var(--text-tertiary)] lg:hidden">{kindLabel[customer.kind]}</span>
                </span>
                <span className="mt-1 block truncate text-[11px] text-[var(--text-tertiary)] lg:hidden">{customer.locations[0]!.area} · {customer.locations[0]!.label}</span>
              </span>
              <span className="text-xs text-[var(--text-secondary)]">{customer.specialty}</span>
              <span className="w-fit rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[10px] font-black text-[var(--accent-strong)]">{customer.className}</span>
              <span className="text-xs text-[var(--text-secondary)]">{customer.route}</span>
              <span dir="ltr" className="text-right text-xs font-bold">{customer.frequencyCompleted} / {customer.frequencyTarget}</span>
              <span className="text-xs font-bold text-[var(--text-secondary)]">{customer.locations.length.toLocaleString('fa-IR')} محل</span>
            </button>
          ))}
        </div>
      </article>
    </section>
  )
}

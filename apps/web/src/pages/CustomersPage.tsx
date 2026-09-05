import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageHeader } from '../components/PageHeader'
import { demoCustomers, type DemoCustomerClass } from '../data/demo-field-workspace'

const kindLabel = {
  doctor: 'پزشک',
  pharmacy: 'داروخانه',
  clinic: 'مرکز',
} as const

const classTone: Record<DemoCustomerClass, string> = {
  A: 'bg-[var(--success-soft)] text-[var(--success)]',
  B: 'bg-[var(--accent-soft)] text-[var(--accent-strong)]',
  C: 'bg-[var(--warning-soft)] text-[var(--warning-strong)]',
}

export function CustomersPage() {
  const [query, setQuery] = useState('')
  const [classFilter, setClassFilter] = useState<'all' | DemoCustomerClass>('all')

  const filteredCustomers = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('fa-IR')
    return demoCustomers.filter((customer) => {
      const matchesClass = classFilter === 'all' || customer.className === classFilter
      if (!matchesClass) return false
      if (!needle) return true
      return [customer.name, customer.specialty, customer.route, customer.locations[0]?.area ?? '']
        .some((value) => value.toLocaleLowerCase('fa-IR').includes(needle))
    })
  }, [classFilter, query])

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="CUSTOMERS"
        title="پزشکان و مشتریان"
        description="دسترسی سریع به پزشک، کلاس، Frequency، مسیر و ثبت ویزیت؛ با تمرکز روی اطلاعاتی که در میدان واقعاً لازم است."
      />

      <article className="app-card p-4 sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <label className="relative block">
            <span className="sr-only">جستجوی مشتری</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="جستجوی نام، تخصص، مسیر یا منطقه…"
              className="min-h-12 w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 text-sm outline-none transition-colors focus:border-[var(--accent-border)]"
            />
          </label>
          <div className="no-scrollbar flex gap-2 overflow-x-auto" aria-label="فیلتر کلاس">
            {(['all', 'A', 'B', 'C'] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setClassFilter(filter)}
                className={[
                  'min-h-11 min-w-12 rounded-2xl border px-3 text-xs font-black transition-colors',
                  classFilter === filter
                    ? 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-strong)]'
                    : 'border-[var(--border-subtle)] bg-[var(--surface-soft)] text-[var(--text-secondary)]',
                ].join(' ')}
              >
                {filter === 'all' ? 'همه' : `کلاس ${filter}`}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-[var(--text-tertiary)]">
          <span>{filteredCustomers.length.toLocaleString('fa-IR')} نتیجه</span>
          <span>مرتب‌سازی: اولویت و Frequency</span>
        </div>
      </article>

      {filteredCustomers.length === 0 ? (
        <article className="app-card grid min-h-52 place-items-center p-8 text-center">
          <div>
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--surface-soft)] text-lg">⌕</div>
            <h2 className="mt-4 text-base font-black">نتیجه‌ای پیدا نشد</h2>
            <p className="mt-2 text-xs leading-6 text-[var(--text-secondary)]">عبارت جستجو یا فیلتر کلاس را تغییر بده.</p>
          </div>
        </article>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {filteredCustomers.map((customer) => {
            const primaryLocation = customer.locations[0]!
            const completion = Math.min(100, Math.round((customer.frequencyCompleted / customer.frequencyTarget) * 100))
            return (
              <article key={customer.id} className="app-card app-card-interactive p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--surface-soft)] text-sm font-black text-[var(--accent-strong)]">
                    {customer.kind === 'doctor' ? 'DR' : customer.kind === 'pharmacy' ? 'PH' : 'CL'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="min-w-0 flex-1 truncate text-sm font-black">{customer.name}</h2>
                      <span className={['rounded-full px-2.5 py-1 text-[10px] font-black', classTone[customer.className]].join(' ')}>{customer.className}</span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">{customer.specialty}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-[var(--text-tertiary)]">
                      <span>{kindLabel[customer.kind]}</span>
                      <span>•</span>
                      <span>{customer.route}</span>
                      <span>•</span>
                      <span>{primaryLocation.area}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl bg-[var(--surface-soft)] p-3.5">
                  <div className="flex items-center justify-between gap-3 text-[11px]">
                    <span className="font-bold text-[var(--text-secondary)]">Frequency</span>
                    <span dir="ltr" className="font-black">{customer.frequencyCompleted} / {customer.frequencyTarget}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                    <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${completion}%` }} />
                  </div>
                  <p className="mt-3 line-clamp-2 text-[11px] leading-5 text-[var(--text-tertiary)]">{primaryLocation.address}</p>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <button type="button" className="min-h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] text-[11px] font-bold text-[var(--text-secondary)]">تماس</button>
                  <button type="button" className="min-h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] text-[11px] font-bold text-[var(--text-secondary)]">مسیر</button>
                  <Link to="/visit/new" className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[var(--accent)] text-[11px] font-black text-white">ثبت ویزیت</Link>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

import { APP_NAME } from '@fieldrep/shared'

const foundationItems = [
  'Multi-workspace architecture',
  'Permission + scope boundary',
  'Excel-parity planner roadmap',
  'Offline PWA foundation',
] as const

export function App() {
  return (
    <main className="min-h-screen bg-[var(--surface-app)] text-[var(--text-primary)]">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center px-5 py-10 sm:px-8">
        <section className="w-full rounded-[28px] border border-[var(--border-subtle)] bg-white p-6 shadow-[0_18px_60px_rgba(31,45,61,0.07)] sm:p-10">
          <div className="mb-8 flex items-center justify-between gap-4">
            <div>
              <span className="inline-flex rounded-full bg-[var(--accent-soft)] px-3 py-1 text-sm font-semibold text-[var(--accent-strong)]">
                P1 Foundation
              </span>
              <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">{APP_NAME}</h1>
              <p className="mt-3 max-w-2xl text-base leading-8 text-[var(--text-secondary)] sm:text-lg">
                زیرساخت اولیه پنل هوشمند برنامه‌ریزی و گزارش فعالیت‌های Field Force آماده توسعه است.
              </p>
            </div>
            <div className="hidden h-16 w-16 place-items-center rounded-2xl bg-[var(--accent)] text-xl font-bold text-white sm:grid">
              FR
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {foundationItems.map((item, index) => (
              <article
                key={item}
                className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-4"
              >
                <span className="text-xs font-semibold text-[var(--accent-strong)]">0{index + 1}</span>
                <p className="mt-2 text-sm font-medium leading-6">{item}</p>
              </article>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3 text-sm text-[var(--text-secondary)]">
            <span className="rounded-full border border-[var(--border-subtle)] px-3 py-2">React + TypeScript</span>
            <span className="rounded-full border border-[var(--border-subtle)] px-3 py-2">Cloudflare Workers</span>
            <span className="rounded-full border border-[var(--border-subtle)] px-3 py-2">RTL-first</span>
          </div>
        </section>
      </div>
    </main>
  )
}

import { Navigate, Route, Routes } from 'react-router-dom'

import { AppShell } from './app/AppShell'

type PageAccent = 'primary' | 'neutral'

interface PlaceholderPageProps {
  eyebrow: string
  title: string
  description: string
  accent?: PageAccent
}

function PlaceholderPage({ eyebrow, title, description, accent = 'neutral' }: PlaceholderPageProps) {
  return (
    <section className="space-y-5">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold text-[var(--accent-strong)]">{eyebrow}</p>
          <h1 className="mt-1.5 text-2xl font-black tracking-tight sm:text-3xl">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-[var(--text-secondary)]">{description}</p>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        {['برنامه‌ریزی‌شده', 'انجام‌شده', 'باقی‌مانده'].map((label) => (
          <article key={label} className="rounded-[22px] border border-[var(--border-subtle)] bg-white p-4 sm:p-5">
            <p className="text-xs font-semibold text-[var(--text-tertiary)]">{label}</p>
            <div className="mt-3 flex items-end justify-between gap-3">
              <span className="text-2xl font-black">—</span>
              <span className="text-xs text-[var(--text-tertiary)]">امروز</span>
            </div>
          </article>
        ))}
      </div>

      <article
        className={[
          'min-h-[260px] rounded-[26px] border p-5 sm:p-7',
          accent === 'primary'
            ? 'border-[var(--accent-border)] bg-[var(--accent-soft)]'
            : 'border-[var(--border-subtle)] bg-white',
        ].join(' ')}
      >
        <div className="flex h-full min-h-[220px] flex-col items-center justify-center text-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-lg shadow-sm" aria-hidden="true">•••</div>
          <h2 className="mt-4 text-base font-extrabold">ساختار صفحه آماده است</h2>
          <p className="mt-2 max-w-md text-sm leading-7 text-[var(--text-secondary)]">
            محتوای عملیاتی این بخش در مرحله صفحات Field User به داده واقعی و منطق اکسل متصل می‌شود.
          </p>
        </div>
      </article>
    </section>
  )
}

function HomePage() {
  return (
    <PlaceholderPage
      eyebrow="TODAY WORKSPACE"
      title="خانه"
      description="مرکز کار روزانه کاربر؛ برنامه امروز، فعالیت بعدی، وضعیت همگام‌سازی و اقدام‌های سریع از اینجا در دسترس خواهند بود."
      accent="primary"
    />
  )
}

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route
          path="calendar"
          element={<PlaceholderPage eyebrow="CALENDAR" title="تقویم" description="نمای ماه، هفته و روز برای ویزیت‌ها، تعطیلی‌ها، مرخصی، ماموریت و برنامه‌های شرکتی." />}
        />
        <Route
          path="planner"
          element={<PlaceholderPage eyebrow="PLAN & REPORT" title="پلن و ریپورت" description="هسته اصلی FieldRep OS با نماهای لیست، تقویم، اکسل و نقشه روی یک مدل داده مشترک." accent="primary" />}
        />
        <Route
          path="customers"
          element={<PlaceholderPage eyebrow="CUSTOMERS" title="مشتریان" description="پزشکان، داروخانه‌ها و مراکز با اطلاعات شرکت، داده شخصی مجاز و چند موقعیت مکانی." />}
        />
        <Route
          path="reports"
          element={<PlaceholderPage eyebrow="REPORTS" title="گزارش‌ها" description="گزارش‌های روزانه، هفتگی، ماهانه و سیکلی بر اساس سطح دسترسی کاربر." />}
        />
        <Route
          path="settings"
          element={<PlaceholderPage eyebrow="SETTINGS" title="بیشتر و تنظیمات" description="تنظیمات حساب، فضای کاری، وضعیت آفلاین و گزینه‌های در دسترس کاربر." />}
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

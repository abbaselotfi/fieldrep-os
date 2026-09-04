import { APP_NAME } from '@fieldrep/shared'
import { NavLink, Outlet } from 'react-router-dom'

import { NavIcon, type NavIconName } from './NavIcon'

interface NavigationItem {
  label: string
  to: string
  icon: NavIconName
  end?: boolean
}

const desktopNavigation: readonly NavigationItem[] = [
  { label: 'خانه', to: '/', icon: 'home', end: true },
  { label: 'تقویم', to: '/calendar', icon: 'calendar' },
  { label: 'پلن و ریپورت', to: '/planner', icon: 'planner' },
  { label: 'مشتریان', to: '/customers', icon: 'customers' },
  { label: 'گزارش‌ها', to: '/reports', icon: 'reports' },
  { label: 'تنظیمات', to: '/settings', icon: 'settings' },
]

const mobileNavigation: readonly NavigationItem[] = [
  { label: 'خانه', to: '/', icon: 'home', end: true },
  { label: 'پلن', to: '/planner', icon: 'planner' },
  { label: 'تقویم', to: '/calendar', icon: 'calendar' },
  { label: 'بیشتر', to: '/settings', icon: 'more' },
]

function DesktopNavItem({ item }: { item: NavigationItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.end ?? false}
      className={({ isActive }) =>
        [
          'group flex min-h-12 items-center gap-3 rounded-2xl px-3.5 text-sm font-semibold transition-colors',
          isActive
            ? 'bg-[var(--accent-soft)] text-[var(--accent-strong)]'
            : 'text-[var(--text-secondary)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)]',
        ].join(' ')
      }
    >
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/70 shadow-[0_1px_2px_rgba(16,24,40,.03)] group-hover:bg-white">
        <NavIcon name={item.icon} />
      </span>
      <span>{item.label}</span>
    </NavLink>
  )
}

function MobileNavItem({ item }: { item: NavigationItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.end ?? false}
      className={({ isActive }) =>
        [
          'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-semibold transition-colors',
          isActive ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]',
        ].join(' ')
      }
    >
      <NavIcon name={item.icon} className="h-[21px] w-[21px]" />
      <span>{item.label}</span>
    </NavLink>
  )
}

export function AppShell() {
  return (
    <div dir="rtl" className="min-h-screen bg-[var(--surface-app)] text-[var(--text-primary)]">
      <aside className="fixed inset-y-0 right-0 z-30 hidden w-72 flex-col border-l border-[var(--border-subtle)] bg-[var(--surface-raised)] px-5 py-6 lg:flex">
        <div className="flex items-center gap-3 px-2">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--accent)] text-sm font-black tracking-tight text-white shadow-[0_8px_24px_rgba(36,87,214,.22)]">
            FR
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-extrabold tracking-tight">{APP_NAME}</p>
            <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">Field Workspace</p>
          </div>
        </div>

        <button
          type="button"
          className="mt-7 flex w-full items-center justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-3 text-right transition-colors hover:bg-white"
        >
          <span className="min-w-0">
            <span className="block text-[11px] font-semibold text-[var(--text-tertiary)]">فضای کاری</span>
            <span className="mt-1 block truncate text-sm font-bold">دیابت · مشهد</span>
          </span>
          <span className="text-lg text-[var(--text-tertiary)]" aria-hidden="true">⌄</span>
        </button>

        <nav className="mt-6 flex flex-1 flex-col gap-1.5" aria-label="ناوبری اصلی">
          {desktopNavigation.map((item) => (
            <DesktopNavItem key={item.to} item={item} />
          ))}
        </nav>

        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-3.5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-xs font-extrabold text-[var(--accent-strong)] shadow-sm">
              AL
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">Field User</p>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--success)]">
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                <span>همگام‌سازی فعال</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-h-screen lg:pr-72">
        <header className="sticky top-0 z-20 border-b border-[var(--border-subtle)] bg-[color:rgba(247,249,252,.88)] backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-[1480px] items-center justify-between gap-4 px-4 sm:px-6 lg:h-[72px] lg:px-8">
            <div className="flex min-w-0 items-center gap-3 lg:hidden">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--accent)] text-[11px] font-black text-white">FR</div>
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold">{APP_NAME}</p>
                <p className="truncate text-[10px] text-[var(--text-tertiary)]">دیابت · مشهد</p>
              </div>
            </div>

            <div className="hidden min-w-0 lg:block">
              <p className="text-xs font-semibold text-[var(--text-tertiary)]">فضای کاری کاربر</p>
              <p className="mt-0.5 text-sm font-bold">دیابت · مشهد</p>
            </div>

            <div className="flex items-center gap-2">
              <span className="hidden items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-white px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] sm:inline-flex">
                <span className="h-2 w-2 rounded-full bg-[var(--success)]" />
                Online
              </span>
              <button
                type="button"
                className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--border-subtle)] bg-white text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                aria-label="اعلان‌ها"
              >
                <span aria-hidden="true">◌</span>
              </button>
              <button
                type="button"
                className="grid h-10 w-10 place-items-center rounded-full bg-[var(--text-primary)] text-xs font-extrabold text-white lg:hidden"
                aria-label="حساب کاربری"
              >
                AL
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1480px] px-4 pb-28 pt-5 sm:px-6 sm:pt-7 lg:px-8 lg:pb-10 lg:pt-8">
          <Outlet />
        </main>
      </div>

      <nav className="fixed inset-x-3 bottom-3 z-40 grid h-[72px] grid-cols-5 items-stretch rounded-[24px] border border-[var(--border-subtle)] bg-[color:rgba(255,255,255,.96)] px-1 shadow-[0_16px_50px_rgba(31,45,61,.16)] backdrop-blur-xl lg:hidden" aria-label="ناوبری موبایل">
        <MobileNavItem item={mobileNavigation[0]!} />
        <MobileNavItem item={mobileNavigation[1]!} />
        <div className="relative flex items-center justify-center">
          <button
            type="button"
            className="absolute -top-5 grid h-14 w-14 place-items-center rounded-[20px] bg-[var(--accent)] text-white shadow-[0_10px_30px_rgba(36,87,214,.35)] transition-transform active:scale-95"
            aria-label="ثبت ویزیت جدید"
          >
            <NavIcon name="plus" className="h-6 w-6" />
          </button>
          <span className="mt-9 text-[10px] font-bold text-[var(--accent-strong)]">ثبت</span>
        </div>
        <MobileNavItem item={mobileNavigation[2]!} />
        <MobileNavItem item={mobileNavigation[3]!} />
      </nav>
    </div>
  )
}

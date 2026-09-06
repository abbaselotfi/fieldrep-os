import { APP_NAME } from '@fieldrep/shared'
import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'

import { SyncStatusPill } from '../offline/sync-react'
import { NavIcon, type NavIconName } from './NavIcon'

interface NavigationItem {
  label: string
  to: string
  icon: NavIconName
  end?: boolean
}

type Theme = 'dark' | 'light'

const desktopNavigation: readonly NavigationItem[] = [
  { label: 'خانه', to: '/', icon: 'home', end: true },
  { label: 'برنامه‌ریزی', to: '/planner', icon: 'planner' },
  { label: 'تقویم', to: '/calendar', icon: 'calendar' },
  { label: 'پزشکان و مشتریان', to: '/customers', icon: 'customers' },
  { label: 'ثبت ویزیت', to: '/visit/new', icon: 'visit' },
  { label: 'دستیار AI', to: '/ai', icon: 'ai' },
  { label: 'گزارش‌ها', to: '/reports', icon: 'reports' },
  { label: 'تنظیمات', to: '/settings', icon: 'settings' },
]

const mobileNavigation: readonly NavigationItem[] = [
  { label: 'خانه', to: '/', icon: 'home', end: true },
  { label: 'برنامه', to: '/planner', icon: 'planner' },
  { label: 'AI', to: '/ai', icon: 'ai' },
  { label: 'بیشتر', to: '/settings', icon: 'more' },
]

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  return window.localStorage.getItem('fieldrep-theme') === 'light' ? 'light' : 'dark'
}

function DesktopNavItem({ item }: { item: NavigationItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.end ?? false}
      className={({ isActive }) =>
        [
          'group flex min-h-12 items-center gap-3 rounded-2xl px-3.5 text-sm font-semibold transition-all duration-200',
          isActive
            ? 'bg-[var(--accent-soft)] text-[var(--accent-strong)]'
            : 'text-[var(--text-secondary)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)]',
        ].join(' ')
      }
    >
      <span className="grid h-9 w-9 place-items-center rounded-xl border border-transparent bg-[var(--surface-soft)] transition-colors group-hover:border-[var(--border-subtle)]">
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
          'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-bold transition-colors',
          isActive ? 'text-[var(--accent-strong)]' : 'text-[var(--text-tertiary)]',
        ].join(' ')
      }
    >
      <NavIcon name={item.icon} className="h-[21px] w-[21px]" />
      <span>{item.label}</span>
    </NavLink>
  )
}

export function AppShell() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const persianDate = useMemo(
    () => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()),
    [],
  )

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    window.localStorage.setItem('fieldrep-theme', theme)
  }, [theme])

  return (
    <div dir="rtl" className="min-h-screen bg-[var(--surface-app)] text-[var(--text-primary)]">
      <aside className="fixed inset-y-0 right-0 z-30 hidden w-[284px] flex-col border-l border-[var(--border-subtle)] bg-[var(--surface-raised)] px-5 py-5 lg:flex">
        <div className="flex items-center gap-3 px-1.5">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--accent)] text-sm font-black tracking-tight text-white shadow-[0_12px_30px_rgba(0,102,204,.28)]">FR</div>
          <div className="min-w-0">
            <p className="truncate text-base font-black tracking-tight">{APP_NAME}</p>
            <p className="mt-0.5 text-[11px] font-medium text-[var(--text-tertiary)]">Field Intelligence Workspace</p>
          </div>
        </div>

        <button type="button" className="mt-6 flex w-full items-center justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-3 text-right transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised-2)]">
          <span className="min-w-0">
            <span className="block text-[10px] font-bold text-[var(--text-tertiary)]">فضای کاری فعال</span>
            <span className="mt-1 block truncate text-sm font-extrabold">تیم دیابت · مشهد</span>
          </span>
          <span className="text-lg text-[var(--text-tertiary)]" aria-hidden="true">⌄</span>
        </button>

        <nav className="thin-scrollbar mt-5 flex flex-1 flex-col gap-1 overflow-y-auto" aria-label="ناوبری اصلی">
          {desktopNavigation.map((item) => <DesktopNavItem key={item.to} item={item} />)}
        </nav>

        <div className="mt-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-3.5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--surface-raised)] text-xs font-black text-[var(--accent-strong)]">FU</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">کاربر فیلد</p>
              <div className="mt-1 flex items-center gap-1.5 text-[10px] font-semibold text-[var(--success)]">
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                <span>همگام‌سازی فعال</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-h-screen lg:pr-[284px]">
        <header className="sticky top-0 z-20 border-b border-[var(--border-subtle)] bg-[var(--surface-glass)] backdrop-blur-2xl">
          <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6 lg:h-[72px] lg:px-8">
            <div className="flex min-w-0 items-center gap-3 lg:hidden">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--accent)] text-[11px] font-black text-white">FR</div>
              <div className="min-w-0">
                <p className="truncate text-sm font-black">{APP_NAME}</p>
                <p className="truncate text-[10px] text-[var(--text-tertiary)]">{persianDate}</p>
              </div>
            </div>

            <div className="hidden min-w-0 lg:block">
              <p className="text-[11px] font-bold text-[var(--text-tertiary)]">امروز</p>
              <p className="mt-0.5 text-sm font-extrabold">{persianDate}</p>
            </div>

            <div className="flex items-center gap-2">
              <SyncStatusPill />
              <button
                type="button"
                onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
                className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                aria-label={theme === 'dark' ? 'فعال کردن حالت روشن' : 'فعال کردن حالت تاریک'}
                title={theme === 'dark' ? 'حالت روشن' : 'حالت تاریک'}
              >
                <NavIcon name="theme" />
              </button>
              <button type="button" className="relative grid h-10 w-10 place-items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]" aria-label="اعلان‌ها">
                <NavIcon name="bell" />
                <span className="absolute left-2.5 top-2.5 h-2 w-2 rounded-full border-2 border-[var(--surface-soft)] bg-[var(--danger)]" />
              </button>
              <button type="button" className="grid h-10 w-10 place-items-center rounded-full bg-[var(--accent)] text-xs font-black text-white shadow-[0_8px_20px_rgba(0,102,204,.22)]" aria-label="حساب کاربری">FU</button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] px-4 pb-28 pt-5 sm:px-6 sm:pt-7 lg:px-8 lg:pb-12 lg:pt-8">
          <Outlet />
        </main>
      </div>

      <Link
        to="/visit/new"
        className="fixed bottom-8 left-8 z-40 hidden min-h-12 items-center gap-2 rounded-2xl bg-[var(--accent)] px-5 text-sm font-extrabold text-white shadow-[var(--shadow-float)] transition-transform hover:-translate-y-0.5 active:translate-y-0 lg:inline-flex"
      >
        <NavIcon name="plus" className="h-5 w-5" />
        ثبت سریع ویزیت
      </Link>

      <nav className="fixed inset-x-3 bottom-3 z-40 grid h-[72px] grid-cols-5 items-stretch rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-glass)] px-1 shadow-[var(--shadow-float)] backdrop-blur-2xl lg:hidden" aria-label="ناوبری موبایل">
        <MobileNavItem item={mobileNavigation[0]!} />
        <MobileNavItem item={mobileNavigation[1]!} />
        <div className="relative flex items-center justify-center">
          <Link to="/visit/new" className="absolute -top-5 grid h-14 w-14 place-items-center rounded-[20px] bg-[var(--accent)] text-white shadow-[0_12px_32px_rgba(0,102,204,.38)] transition-transform active:scale-95" aria-label="ثبت ویزیت جدید">
            <NavIcon name="plus" className="h-6 w-6" />
          </Link>
          <span className="mt-9 text-[10px] font-black text-[var(--accent-strong)]">ویزیت</span>
        </div>
        <MobileNavItem item={mobileNavigation[2]!} />
        <MobileNavItem item={mobileNavigation[3]!} />
      </nav>
    </div>
  )
}

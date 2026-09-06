import { useState } from 'react'

import { useOfflineSync, presentSyncStatus } from '../offline/sync-react'
import { PageHeader } from '../components/PageHeader'
import { demoWorkspace } from '../data/demo-field-workspace'

const sections = [
  ['حساب و امنیت', 'نشست‌ها، ورود و تنظیمات حساب کاربری'],
  ['فضای کاری', `${demoWorkspace.workspace} · ${demoWorkspace.territory}`],
  ['زبان و منطقه', 'فارسی · تقویم شمسی · Asia/Tehran'],
] as const

function Toggle({ enabled, onChange, label }: { enabled: boolean; onChange: () => void; label: string }) {
  return (
    <button type="button" onClick={onChange} aria-pressed={enabled} aria-label={label} className={['relative h-7 w-12 rounded-full transition-colors', enabled ? 'bg-[var(--accent)]' : 'bg-[var(--surface-muted)]'].join(' ')}>
      <span className={['absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all', enabled ? 'right-6' : 'right-1'].join(' ')} />
    </button>
  )
}

export function SettingsPage() {
  const [planNotifications, setPlanNotifications] = useState(true)
  const [syncNotifications, setSyncNotifications] = useState(true)
  const { ready, status, syncNow, clearLocalData } = useOfflineSync()
  const presentation = presentSyncStatus(status, ready)
  const pendingCount = status?.pendingCount ?? 0
  const conflictCount = status?.conflictCount ?? 0
  const failedCount = status?.failedCount ?? 0
  const lastSyncAt = status?.lastSyncAt ?? null

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="PROFILE & SETTINGS"
        title="پروفایل و تنظیمات"
        description="تنظیمات شخصی، قلمرو، اعلان‌ها و وضعیت همگام‌سازی؛ بدون مخلوط کردن تنظیمات مدیریتی شرکت با تجربه کاربر فیلد."
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(280px,.75fr)_minmax(0,1.25fr)]">
        <article className="surface-hero app-card p-5 sm:p-6">
          <div className="flex items-center gap-4">
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-[22px] bg-[var(--accent)] text-lg font-black text-white shadow-[0_12px_30px_rgba(0,102,204,.24)]">FU</div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-black">{demoWorkspace.user}</h2>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">Medical Representative</p>
              <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">{demoWorkspace.workspace} · {demoWorkspace.territory}</p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-[var(--surface-soft)] p-3.5"><p className="text-[10px] text-[var(--text-tertiary)]">سیکل فعال</p><p className="mt-1 text-xs font-black">{demoWorkspace.cycle}</p></div>
            <div className={['rounded-2xl p-3.5', status?.state === 'synced' ? 'bg-[var(--success-soft)]' : 'bg-[var(--surface-soft)]'].join(' ')}>
              <p className="text-[10px] text-[var(--text-tertiary)]">وضعیت Sync</p>
              <p className={['mt-1 text-xs font-black', status?.state === 'synced' ? 'text-[var(--success)]' : ''].join(' ')}>{ready ? presentation.label : 'در حال آماده‌سازی'}</p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-4">
            <p className="text-[10px] font-bold text-[var(--text-tertiary)]">هدف ماهانه</p>
            <div className="mt-2 flex items-end justify-between gap-3"><strong className="text-2xl font-black">۸۲٪</strong><span className="text-[10px] text-[var(--text-tertiary)]">در مسیر هدف</span></div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]"><div className="h-full w-[82%] rounded-full bg-[var(--accent)]" /></div>
          </div>
        </article>

        <div className="space-y-4">
          <article className="app-card p-5">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-[11px] font-bold text-[var(--text-tertiary)]">اعلان‌ها</p><h2 className="mt-1 text-base font-black">یادآوری‌های کاری</h2></div>
            </div>
            <div className="mt-4 divide-y divide-[var(--border-subtle)]">
              <div className="flex items-center justify-between gap-4 py-3.5">
                <div><p className="text-sm font-bold">یادآوری برنامه روزانه</p><p className="mt-1 text-[11px] text-[var(--text-tertiary)]">قبل از شروع اولین ویزیت</p></div>
                <Toggle enabled={planNotifications} onChange={() => setPlanNotifications((value) => !value)} label="یادآوری برنامه روزانه" />
              </div>
              <div className="flex items-center justify-between gap-4 py-3.5">
                <div><p className="text-sm font-bold">هشدار همگام‌سازی</p><p className="mt-1 text-[11px] text-[var(--text-tertiary)]">وقتی عملیات آفلاین در صف بماند</p></div>
                <Toggle enabled={syncNotifications} onChange={() => setSyncNotifications((value) => !value)} label="هشدار همگام‌سازی" />
              </div>
            </div>
          </article>

<article className="app-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold text-[var(--text-tertiary)]">آفلاین و همگام‌سازی</p>
                <h2 className="mt-1 text-base font-black">وضعیت ذخیره محلی</h2>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3 py-1.5 text-[11px] font-bold text-[var(--text-secondary)]">
                <span className={`h-2 w-2 rounded-full ${presentation.dotClass}`} />
                {ready ? presentation.label : 'در حال آماده‌سازی'}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-2xl bg-[var(--surface-soft)] p-3.5">
                <p className="text-[10px] text-[var(--text-tertiary)]">در صف</p>
                <p className="mt-1 text-sm font-black">{pendingCount.toLocaleString('fa-IR')}</p>
              </div>
              <div className="rounded-2xl bg-[var(--surface-soft)] p-3.5">
                <p className="text-[10px] text-[var(--text-tertiary)]">تناقض</p>
                <p className={['mt-1 text-sm font-black', conflictCount > 0 ? 'text-[var(--danger)]' : ''].join(' ')}>{conflictCount.toLocaleString('fa-IR')}</p>
              </div>
              <div className="rounded-2xl bg-[var(--surface-soft)] p-3.5">
                <p className="text-[10px] text-[var(--text-tertiary)]">خطا</p>
                <p className={['mt-1 text-sm font-black', failedCount > 0 ? 'text-[var(--danger)]' : ''].join(' ')}>{failedCount.toLocaleString('fa-IR')}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[11px] leading-6 text-[var(--text-tertiary)]">
                {lastSyncAt !== null
                  ? `آخرین همگام‌سازی: ${new Date(lastSyncAt).toLocaleString('fa-IR')}`
                  : 'هنوز همگام‌سازی انجام نشده است'}
                <br />
                داده‌ها در IndexedDB و جداشده از سایر کاربران/ورک‌اسپیس‌ها ذخیره می‌شوند.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void syncNow()}
                  className="inline-flex min-h-10 items-center rounded-2xl bg-[var(--accent)] px-4 text-xs font-extrabold text-white"
                >
                  همگام‌سازی اکنون
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('تمامی داده‌های آفلاین این دستگاه پاک می‌شود. ادامه می‌دهید؟')) {
                      void clearLocalData()
                    }
                  }}
                  className="inline-flex min-h-10 items-center rounded-2xl border border-[var(--border-strong)] px-4 text-xs font-bold text-[var(--danger)]"
                >
                  پاکسازی حافظه محلی
                </button>
              </div>
            </div>
          </article>
          <div className="grid gap-3 md:grid-cols-2">
            {sections.map(([title, description]) => (
              <button key={title} type="button" className="app-card app-card-interactive flex min-h-24 items-center justify-between p-5 text-right">
                <span className="min-w-0">
                  <strong className="block text-sm">{title}</strong>
                  <span className="mt-1.5 block truncate text-xs leading-6 text-[var(--text-secondary)]">{description}</span>
                </span>
                <span className="text-xl text-[var(--text-tertiary)]" aria-hidden="true">‹</span>
              </button>
            ))}
          </div>

          <article className="app-card flex items-center justify-between gap-4 p-5">
            <div>
              <p className="text-sm font-black">تم نمایش</p>
              <p className="mt-1 text-[11px] leading-6 text-[var(--text-secondary)]">تغییر حالت روشن/تاریک از آیکون ماه در هدر انجام می‌شود و روی دستگاه ذخیره می‌گردد.</p>
            </div>
            <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-[10px] font-black text-[var(--accent-strong)]">Dark-first</span>
          </article>
        </div>
      </div>
    </section>
  )
}

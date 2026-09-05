import { PageHeader } from '../components/PageHeader'

const sections = [
  ['حساب کاربری', 'نام، زبان، امنیت حساب و Sessionها'],
  ['فضای کاری', 'دیابت · مشهد · تنظیمات قابل مشاهده کاربر'],
  ['آفلاین و همگام‌سازی', 'وضعیت Cache، صف Sync و آخرین همگام‌سازی'],
  ['اعلان‌ها', 'یادآوری پلن، فعالیت‌ها و پیام‌های سازمانی'],
] as const

export function SettingsPage() {
  return (
    <section className="space-y-6">
      <PageHeader eyebrow="SETTINGS" title="بیشتر و تنظیمات" description="تنظیمات شخصی و وضعیت برنامه؛ تنظیمات شرکت و Workspace فقط در پنل‌های مجاز مدیریتی دیده خواهند شد." />
      <div className="grid gap-3 lg:grid-cols-2">
        {sections.map(([title, description]) => (
          <button key={title} type="button" className="flex min-h-24 items-center justify-between rounded-[22px] border border-[var(--border-subtle)] bg-white p-5 text-right transition-colors hover:bg-[var(--surface-soft)]">
            <span>
              <strong className="block text-sm">{title}</strong>
              <span className="mt-1.5 block text-xs leading-6 text-[var(--text-secondary)]">{description}</span>
            </span>
            <span className="text-xl text-[var(--text-tertiary)]" aria-hidden="true">‹</span>
          </button>
        ))}
      </div>
    </section>
  )
}

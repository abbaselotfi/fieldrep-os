import { useMemo, useState } from 'react'

import { PageHeader } from '../components/PageHeader'
import {
  demoAiSuggestions,
  demoCustomers,
  getDemoCustomer,
} from '../data/demo-field-workspace'
import {
  activePreviewPlans,
  cancelPreviewPlan,
  createPreviewPlan,
  createPreviewPlanSeed,
  previewAdjacentDuplicateDates,
  previewDayProgress,
  previewPlannerDays,
  previewPlansForDate,
  updatePreviewPlan,
  type PreviewPlanDraft,
  type PreviewPlanEntry,
  type PreviewPlanMutationError,
  type PreviewPlannerDay,
} from '../features/planner/preview-plan'

type PlannerView = 'list' | 'calendar' | 'excel' | 'map'

type EditorState =
  | { mode: 'create'; planDate: string }
  | { mode: 'edit'; entryId: string }

const plannerViews: readonly { key: PlannerView; label: string }[] = [
  { key: 'list', label: 'لیست' },
  { key: 'calendar', label: 'تقویم' },
  { key: 'excel', label: 'اکسل' },
  { key: 'map', label: 'نقشه' },
]

function ListPlannerView({
  entries,
  selectedDay,
  onEdit,
  onCancel,
}: {
  entries: readonly PreviewPlanEntry[]
  selectedDay: PreviewPlannerDay
  onEdit: (entryId: string) => void
  onCancel: (entryId: string) => void
}) {
  const dayEntries = previewPlansForDate(entries, selectedDay.planDate)
  const progress = previewDayProgress(entries, selectedDay.planDate)

  return (
    <article className="overflow-hidden rounded-[26px] border border-[var(--border-subtle)] bg-white">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-4 sm:px-5">
        <div>
          <p className="text-xs font-bold text-[var(--text-tertiary)]">
            {selectedDay.weekday} {selectedDay.jalaliDay.toLocaleString('fa-IR')} شهریور
          </p>
          <h2 className="mt-1 text-lg font-black">برنامه روز</h2>
        </div>
        <div className="text-left">
          <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-bold text-[var(--accent-strong)]">
            {progress.planned.toLocaleString('fa-IR')} / {progress.target.toLocaleString('fa-IR')}
          </span>
          <p className="mt-2 text-[10px] font-bold text-[var(--text-tertiary)]">
            {progress.overBy > 0
              ? `${progress.overBy.toLocaleString('fa-IR')} بالاتر از هدف`
              : `${progress.remaining.toLocaleString('fa-IR')} تا هدف`}
          </p>
        </div>
      </div>

      {dayEntries.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-[var(--text-tertiary)]">برای این روز پلنی ثبت نشده است.</div>
      ) : (
        <div className="divide-y divide-[var(--border-subtle)]">
          {dayEntries.map((entry, index) => {
            const customer = getDemoCustomer(entry.customerId)
            const location = customer.locations[0]!

            return (
              <div key={entry.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[54px_minmax(0,1fr)_auto] sm:items-center sm:px-5">
                <span className="text-xs font-black text-[var(--text-secondary)]">#{(index + 1).toLocaleString('fa-IR')}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold">{customer.name}</p>
                    <span className="rounded-full bg-[var(--surface-app)] px-2 py-1 text-[10px] font-black">Class {customer.className}</span>
                    {entry.source === 'manual' ? (
                      <span className="rounded-full border border-[var(--accent-border)] px-2 py-1 text-[10px] font-bold text-[var(--accent-strong)]">جدید</span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                    {customer.specialty} · {entry.route} · {location.area}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
                  <span dir="ltr" className="text-xs font-bold text-[var(--text-secondary)]">
                    {customer.frequencyCompleted} / {customer.frequencyTarget}
                  </span>
                  <button type="button" onClick={() => onEdit(entry.id)} className="min-h-10 rounded-xl border border-[var(--border-subtle)] px-3 text-xs font-bold">ویرایش</button>
                  <button type="button" onClick={() => onCancel(entry.id)} className="min-h-10 rounded-xl px-3 text-xs font-bold text-[var(--danger,#b42318)]">لغو</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </article>
  )
}

function CalendarPlannerView({
  entries,
  selectedDate,
  onSelectDate,
  onEdit,
}: {
  entries: readonly PreviewPlanEntry[]
  selectedDate: string
  onSelectDate: (date: string) => void
  onEdit: (entryId: string) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {previewPlannerDays.map((day) => {
        const dayEntries = previewPlansForDate(entries, day.planDate)
        const selected = selectedDate === day.planDate
        return (
          <article
            key={day.planDate}
            className={[
              'rounded-[24px] border bg-white p-4 transition-colors',
              selected ? 'border-[var(--accent)] ring-2 ring-[var(--accent-soft)]' : 'border-[var(--border-subtle)]',
            ].join(' ')}
          >
            <button type="button" onClick={() => onSelectDate(day.planDate)} className="w-full text-right">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold text-[var(--text-tertiary)]">{day.weekday}</p>
                  <h2 className="mt-1 text-base font-black">{day.jalaliDay.toLocaleString('fa-IR')} شهریور</h2>
                </div>
                <span className="rounded-full bg-[var(--surface-soft)] px-2.5 py-1 text-[10px] font-black">{day.route}</span>
              </div>
              <div className="mt-4 flex items-end justify-between">
                <div>
                  <strong className="text-2xl font-black">{dayEntries.length.toLocaleString('fa-IR')}</strong>
                  <span className="mr-1 text-xs text-[var(--text-secondary)]">پلن</span>
                </div>
                <span className="text-xs font-bold text-[var(--text-secondary)]">هدف {day.target.toLocaleString('fa-IR')}</span>
              </div>
            </button>
            <div className="mt-4 space-y-2">
              {dayEntries.slice(0, 4).map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => onEdit(entry.id)}
                  className="block w-full truncate rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-right text-xs font-bold hover:bg-[var(--accent-soft)]"
                >
                  {getDemoCustomer(entry.customerId).name}
                </button>
              ))}
              {dayEntries.length > 4 ? (
                <p className="px-1 text-[11px] font-bold text-[var(--accent-strong)]">+ {(dayEntries.length - 4).toLocaleString('fa-IR')} مورد دیگر</p>
              ) : null}
            </div>
          </article>
        )
      })}
    </div>
  )
}

function ExcelPlannerView({
  entries,
  onEdit,
}: {
  entries: readonly PreviewPlanEntry[]
  onEdit: (entryId: string) => void
}) {
  const columns = Math.max(...previewPlannerDays.map((day) => day.target))

  return (
    <article className="overflow-hidden rounded-[26px] border border-[var(--border-subtle)] bg-white">
      <div className="border-b border-[var(--border-subtle)] px-4 py-4 sm:px-5">
        <p className="text-xs font-bold text-[var(--text-tertiary)]">EXCEL PARITY VIEW</p>
        <h2 className="mt-1 text-lg font-black">نمای فشرده هفتگی</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[1320px] w-full border-collapse text-right text-xs">
          <thead className="bg-[var(--surface-soft)] text-[var(--text-tertiary)]">
            <tr>
              <th className="px-4 py-3 font-black">روز</th>
              <th className="px-4 py-3 font-black">مسیر</th>
              {Array.from({ length: columns }, (_, index) => (
                <th key={index} className="px-4 py-3 font-black">ویزیت {(index + 1).toLocaleString('fa-IR')}</th>
              ))}
              <th className="px-4 py-3 font-black">جمع</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {previewPlannerDays.map((day) => {
              const dayEntries = previewPlansForDate(entries, day.planDate)
              return (
                <tr key={day.planDate}>
                  <td className="whitespace-nowrap px-4 py-3 font-black">{day.weekday} {day.jalaliDay.toLocaleString('fa-IR')}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)]">{day.route}</td>
                  {Array.from({ length: columns }, (_, index) => {
                    const entry = dayEntries[index]
                    return (
                      <td key={index} className="max-w-44 px-2 py-2">
                        {entry === undefined ? (
                          <span className="block px-2 py-1 text-[var(--text-tertiary)]">—</span>
                        ) : (
                          <button type="button" onClick={() => onEdit(entry.id)} className="block w-full truncate rounded-lg px-2 py-1 text-right font-bold hover:bg-[var(--accent-soft)]">
                            {getDemoCustomer(entry.customerId).name}
                          </button>
                        )}
                      </td>
                    )
                  })}
                  <td className="whitespace-nowrap px-4 py-3 font-black">{dayEntries.length.toLocaleString('fa-IR')} / {day.target.toLocaleString('fa-IR')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-[var(--border-subtle)] px-4 py-3 text-[11px] leading-6 text-[var(--text-tertiary)] sm:px-5">
        همان داده پلن در نمای لیست، تقویم و اکسل استفاده می‌شود؛ ویرایش در هر نما بلافاصله در بقیه نماها دیده می‌شود.
      </p>
    </article>
  )
}

function MapPlannerView({ entries, selectedDay }: { entries: readonly PreviewPlanEntry[]; selectedDay: PreviewPlannerDay }) {
  const locations = previewPlansForDate(entries, selectedDay.planDate)
    .slice(0, 5)
    .map((entry) => getDemoCustomer(entry.customerId))

  return (
    <article className="grid gap-4 rounded-[26px] border border-[var(--border-subtle)] bg-white p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="relative min-h-[360px] overflow-hidden rounded-[22px] border border-dashed border-[var(--accent-border)] bg-[linear-gradient(135deg,var(--surface-soft),var(--accent-soft))] p-5">
        <div className="max-w-md">
          <p className="text-xs font-black text-[var(--accent-strong)]">MAP PROVIDER SLOT</p>
          <h2 className="mt-2 text-xl font-black">نمای نقشه آماده اتصال</h2>
          <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">در P5 همین پلن واقعی به Adapter نقشه مانند نشان یا Google Maps متصل می‌شود.</p>
        </div>
        <div className="absolute bottom-6 left-7 grid h-10 w-10 place-items-center rounded-full bg-[var(--accent)] text-xs font-black text-white shadow-lg">۱</div>
        <div className="absolute bottom-24 right-12 grid h-10 w-10 place-items-center rounded-full bg-white text-xs font-black text-[var(--accent-strong)] shadow-lg">۲</div>
        <div className="absolute left-1/2 top-1/2 grid h-10 w-10 place-items-center rounded-full bg-white text-xs font-black text-[var(--accent-strong)] shadow-lg">۳</div>
      </div>
      <div className="space-y-2">
        <p className="px-1 text-xs font-black text-[var(--text-tertiary)]">لوکیشن‌های {selectedDay.jalaliDay.toLocaleString('fa-IR')} شهریور</p>
        {locations.map((customer) => (
          <div key={customer.id} className="rounded-2xl border border-[var(--border-subtle)] p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-black">{customer.name}</p>
              <span className="shrink-0 rounded-full bg-[var(--surface-soft)] px-2 py-1 text-[10px] font-black">{customer.route}</span>
            </div>
            <p className="mt-1.5 text-xs text-[var(--text-secondary)]">{customer.locations[0]!.area} · {customer.locations[0]!.label}</p>
          </div>
        ))}
      </div>
    </article>
  )
}

function PlanEditor({
  entries,
  initialDraft,
  editingEntryId,
  error,
  onSave,
  onClose,
}: {
  entries: readonly PreviewPlanEntry[]
  initialDraft: PreviewPlanDraft
  editingEntryId: string | undefined
  error: PreviewPlanMutationError | null
  onSave: (draft: PreviewPlanDraft) => void
  onClose: () => void
}) {
  const [customerId, setCustomerId] = useState(initialDraft.customerId)
  const [planDate, setPlanDate] = useState(initialDraft.planDate)
  const customer = getDemoCustomer(customerId)
  const day = previewPlannerDays.find((item) => item.planDate === planDate)!
  const adjacentDates = previewAdjacentDuplicateDates(entries, { customerId, planDate }, editingEntryId)
  const progress = previewDayProgress(entries, planDate)
  const editingEntry = editingEntryId === undefined ? undefined : entries.find((entry) => entry.id === editingEntryId)
  const addsToSelectedDay = editingEntry === undefined || editingEntry.planDate !== planDate
  const afterCount = progress.planned + (addsToSelectedDay ? 1 : 0)
  const targetExceeded = afterCount > day.target

  return (
    <article className="rounded-[26px] border border-[var(--accent-border)] bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black text-[var(--accent-strong)]">PLAN CRUD · PREVIEW</p>
          <h2 className="mt-1 text-lg font-black">{editingEntryId === undefined ? 'افزودن به پلن' : 'ویرایش پلن'}</h2>
          <p className="mt-1 text-xs leading-6 text-[var(--text-secondary)]">این فرم روی Pages داده نمایشی را تغییر می‌دهد؛ قرارداد API واقعی همین عملیات در Worker آماده شده است.</p>
        </div>
        <button type="button" onClick={onClose} className="min-h-10 rounded-xl border border-[var(--border-subtle)] px-3 text-xs font-bold">بستن</button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <label className="grid gap-1.5 text-xs font-bold text-[var(--text-secondary)]">
          پزشک / مشتری
          <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} className="min-h-11 rounded-xl border border-[var(--border-subtle)] bg-white px-3 text-sm text-[var(--text-primary)]">
            {demoCustomers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1.5 text-xs font-bold text-[var(--text-secondary)]">
          روز
          <select value={planDate} onChange={(event) => setPlanDate(event.target.value)} className="min-h-11 rounded-xl border border-[var(--border-subtle)] bg-white px-3 text-sm text-[var(--text-primary)]">
            {previewPlannerDays.map((item) => (
              <option key={item.planDate} value={item.planDate}>{item.weekday} {item.jalaliDay.toLocaleString('fa-IR')} شهریور</option>
            ))}
          </select>
        </label>
        <div className="rounded-xl bg-[var(--surface-soft)] px-3 py-2.5 text-xs leading-6 text-[var(--text-secondary)]">
          <strong className="text-[var(--text-primary)]">{customer.route}</strong><br />
          {customer.specialty} · Class {customer.className} · فرکانس {customer.frequencyTarget.toLocaleString('fa-IR')}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold">
        <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1.5">بعد از ثبت: {afterCount.toLocaleString('fa-IR')} / {day.target.toLocaleString('fa-IR')}</span>
        {adjacentDates.length > 0 ? <span className="rounded-full bg-amber-50 px-3 py-1.5 text-amber-800">هشدار: این مشتری در روز مجاور هم پلن دارد</span> : null}
        {targetExceeded ? <span className="rounded-full bg-amber-50 px-3 py-1.5 text-amber-800">هشدار: Daily Target رد می‌شود</span> : null}
        {error === 'duplicate_same_day' ? <span className="rounded-full bg-red-50 px-3 py-1.5 text-red-700">ثبت نشد: مشتری در همین روز از قبل وجود دارد</span> : null}
        {error === 'day_not_available' ? <span className="rounded-full bg-red-50 px-3 py-1.5 text-red-700">روز انتخاب‌شده خارج از بازه Preview است</span> : null}
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-[var(--border-subtle)] px-4 text-sm font-bold">انصراف</button>
        <button type="button" onClick={() => onSave({ customerId, planDate })} className="min-h-11 rounded-xl bg-[var(--accent)] px-5 text-sm font-bold text-white">ذخیره پلن</button>
      </div>
    </article>
  )
}

export function PlannerPage() {
  const [activeView, setActiveView] = useState<PlannerView>('list')
  const [entries, setEntries] = useState<PreviewPlanEntry[]>(() => createPreviewPlanSeed())
  const [selectedDate, setSelectedDate] = useState(previewPlannerDays[0]!.planDate)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [editorError, setEditorError] = useState<PreviewPlanMutationError | null>(null)
  const selectedDay = previewPlannerDays.find((day) => day.planDate === selectedDate) ?? previewPlannerDays[0]!
  const activeEntries = useMemo(() => activePreviewPlans(entries), [entries])
  const coverage = Math.round((new Set(activeEntries.map((entry) => entry.customerId)).size / demoCustomers.length) * 100)
  const selectedProgress = previewDayProgress(entries, selectedDate)

  const editingEntry = editor?.mode === 'edit'
    ? entries.find((entry) => entry.id === editor.entryId)
    : undefined
  const initialDraft: PreviewPlanDraft | null = editor === null
    ? null
    : editor.mode === 'edit' && editingEntry !== undefined
      ? { customerId: editingEntry.customerId, planDate: editingEntry.planDate }
      : { customerId: demoCustomers[0]!.id, planDate: editor.mode === 'create' ? editor.planDate : selectedDate }

  function openCreate(planDate = selectedDate) {
    setSelectedDate(planDate)
    setEditorError(null)
    setEditor({ mode: 'create', planDate })
  }

  function openEdit(entryId: string) {
    const entry = entries.find((candidate) => candidate.id === entryId)
    if (entry !== undefined) setSelectedDate(entry.planDate)
    setEditorError(null)
    setEditor({ mode: 'edit', entryId })
  }

  function saveDraft(draft: PreviewPlanDraft) {
    const result = editor?.mode === 'edit'
      ? updatePreviewPlan(entries, editor.entryId, draft)
      : createPreviewPlan(entries, draft, crypto.randomUUID())

    setEditorError(result.error)
    if (result.error !== null) return
    setEntries(result.entries)
    setSelectedDate(draft.planDate)
    setEditor(null)
  }

  function cancelEntry(entryId: string) {
    setEntries((current) => cancelPreviewPlan(current, entryId))
    if (editor?.mode === 'edit' && editor.entryId === entryId) setEditor(null)
  }

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="PLAN & REPORT"
        title="پلن و ریپورت"
        description="یک منبع پلن مشترک برای نمای لیست، تقویم و اکسل؛ افزودن، جابه‌جایی و لغو در همه Viewها همگام دیده می‌شود."
        actions={
          <button type="button" onClick={() => openCreate()} className="inline-flex min-h-11 items-center rounded-2xl bg-[var(--accent)] px-4 text-sm font-bold text-white">+ افزودن به پلن</button>
        }
      />

      {editor !== null && initialDraft !== null ? (
        <PlanEditor
          key={editor.mode === 'edit' ? editor.entryId : `new-${editor.planDate}`}
          entries={entries}
          initialDraft={initialDraft}
          editingEntryId={editor.mode === 'edit' ? editor.entryId : undefined}
          error={editorError}
          onSave={saveDraft}
          onClose={() => setEditor(null)}
        />
      ) : null}

      <article className="rounded-[24px] border border-[var(--border-subtle)] bg-white p-3 sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="grid grid-cols-4 rounded-2xl bg-[var(--surface-soft)] p-1 text-xs font-bold">
            {plannerViews.map((view) => (
              <button
                key={view.key}
                type="button"
                aria-pressed={activeView === view.key}
                onClick={() => setActiveView(view.key)}
                className={[
                  'min-h-10 rounded-xl px-2 transition-colors sm:px-3',
                  activeView === view.key ? 'bg-white text-[var(--accent-strong)] shadow-sm' : 'text-[var(--text-secondary)]',
                ].join(' ')}
              >
                {view.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {previewPlannerDays.map((day) => (
              <button
                key={day.planDate}
                type="button"
                onClick={() => setSelectedDate(day.planDate)}
                className={[
                  'min-h-10 rounded-xl border px-3 text-xs font-bold',
                  selectedDate === day.planDate
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)]'
                    : 'border-[var(--border-subtle)] bg-white text-[var(--text-secondary)]',
                ].join(' ')}
              >
                {day.jalaliDay.toLocaleString('fa-IR')} شهریور
              </button>
            ))}
          </div>
        </div>
      </article>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          {activeView === 'list' ? <ListPlannerView entries={entries} selectedDay={selectedDay} onEdit={openEdit} onCancel={cancelEntry} /> : null}
          {activeView === 'calendar' ? <CalendarPlannerView entries={entries} selectedDate={selectedDate} onSelectDate={setSelectedDate} onEdit={openEdit} /> : null}
          {activeView === 'excel' ? <ExcelPlannerView entries={entries} onEdit={openEdit} /> : null}
          {activeView === 'map' ? <MapPlannerView entries={entries} selectedDay={selectedDay} /> : null}
        </div>

        <aside className="space-y-3">
          <article className="rounded-[24px] border border-[var(--accent-border)] bg-[var(--accent-soft)] p-5">
            <p className="text-xs font-bold text-[var(--accent-strong)]">AI PLANNER · PREVIEW</p>
            <h2 className="mt-2 text-lg font-black">پیشنهادهای هفته بعد</h2>
            <div className="mt-4 space-y-2">
              {demoAiSuggestions.map((suggestion) => {
                const customer = getDemoCustomer(suggestion.customerId)
                return (
                  <div key={suggestion.customerId} className="rounded-2xl bg-white/80 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-black">{customer.name}</p>
                      <span className="text-[10px] font-black text-[var(--accent-strong)]">{suggestion.score.toLocaleString('fa-IR')} امتیاز</span>
                    </div>
                    <p className="mt-1.5 text-[11px] leading-5 text-[var(--text-secondary)]">{suggestion.reason}</p>
                  </div>
                )
              })}
            </div>
            <p className="mt-3 text-[10px] leading-5 text-[var(--text-tertiary)]">این پیشنهادها هنوز نمایشی‌اند؛ موتور Recommendation واقعی در P7 پیاده‌سازی می‌شود.</p>
          </article>
          <article className="rounded-[24px] border border-[var(--border-subtle)] bg-white p-5">
            <p className="text-xs font-bold text-[var(--text-tertiary)]">خلاصه پلن</p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between"><span>کل پلن فعال</span><strong>{activeEntries.length.toLocaleString('fa-IR')}</strong></div>
              <div className="flex justify-between"><span>پوشش نمونه</span><strong>{coverage.toLocaleString('fa-IR')}٪</strong></div>
              <div className="flex justify-between"><span>روز انتخاب‌شده</span><strong>{selectedProgress.planned.toLocaleString('fa-IR')} / {selectedProgress.target.toLocaleString('fa-IR')}</strong></div>
              <div className="flex justify-between"><span>Duplicate همان روز</span><strong>۰</strong></div>
            </div>
          </article>
          <button type="button" onClick={() => openCreate(selectedDate)} className="min-h-11 w-full rounded-2xl border border-[var(--accent-border)] bg-white px-4 text-sm font-bold text-[var(--accent-strong)]">افزودن برای {selectedDay.jalaliDay.toLocaleString('fa-IR')} شهریور</button>
        </aside>
      </div>
    </section>
  )
}

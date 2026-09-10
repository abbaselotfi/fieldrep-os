import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import {
  decideSuggestion,
  type SuggestionAction,
  type VisitSuggestion,
} from '@fieldrep/domain'
import { PageHeader } from '../components/PageHeader'
import { getDemoCustomer } from '../data/demo-field-workspace'
import { buildPreviewBatch } from '../features/ai/build-preview-batch'
import {
  BAND_CLASSES,
  BAND_LABELS,
  describeSuggestion,
  STATUS_LABELS,
} from '../features/ai/recommendation-labels'
import { applySuggestionDecision } from '../features/ai/suggestion-state'
import { previewPlannerDays } from '../features/planner/preview-plan'

const quickPrompts = [
  'بهترین پزشکان امروز',
  'پیش‌برنامه فردا',
  'تحلیل پوشش قلمرو',
] as const

export function AiPage() {
  const [message, setMessage] = useState('')
  const [lastQuestion, setLastQuestion] = useState<string | null>(null)
  const batch = useMemo(() => buildPreviewBatch(), [])
  const [suggestions, setSuggestions] = useState<VisitSuggestion[]>(batch.suggestions)
  const [decisionError, setDecisionError] = useState<string | null>(null)

  const openSuggestions = suggestions.filter(
    (suggestion) => suggestion.status === 'suggested' || suggestion.status === 'edited',
  )
  const acceptedCount = suggestions.filter((suggestion) => suggestion.status === 'accepted').length

  function decide(action: SuggestionAction, suggestion: VisitSuggestion, editedDate?: string) {
    try {
      const decision = decideSuggestion({
        suggestion,
        action,
        ...(action === 'edit' && editedDate !== undefined ? { editedDate } : {}),
      })
      setSuggestions((current) => applySuggestionDecision(current, decision))
      setDecisionError(null)
    } catch (error) {
      setDecisionError(
        error instanceof Error ? error.message : 'suggestion_decision_failed',
      )
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = message.trim()
    if (!value) return
    setLastQuestion(value)
    setMessage('')
  }

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="LOCAL AI"
        title="دستیار هوشمند فیلد"
        description="رابط ساده برای پیشنهاد ویزیت، تحلیل قلمرو و توضیح تصمیم‌های موتور برنامه‌ریزی. در این مرحله UI آماده است و اتصال مدل در فاز AI فعال می‌شود."
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
        <article className="ai-surface app-card flex min-h-[560px] flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-4 sm:px-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-2xl bg-[var(--ai-soft)] text-sm font-black text-[var(--ai-strong)]">AI</span>
                <div>
                  <h2 className="text-sm font-black">Concierge محلی</h2>
                  <p className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">Explainable · Workspace aware</p>
                </div>
              </div>
            </div>
            <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-2.5 py-1 text-[9px] font-black text-[var(--ai-strong)]">UI آماده اتصال</span>
          </div>

          <div className="flex-1 space-y-4 p-5 sm:p-6">
            <div className="max-w-[88%] rounded-[22px] rounded-tr-md bg-[var(--surface-soft)] p-4 text-sm leading-7 text-[var(--text-secondary)]">
              می‌توانم برای برنامه‌ریزی فردا، اولویت پزشکان، Route efficiency و پوشش Frequency پیشنهاد قابل توضیح بسازم. هر پیشنهاد باید قبل از تبدیل شدن به پلن رسمی تأیید شود.
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {quickPrompts.map((prompt) => (
                <button key={prompt} type="button" onClick={() => setMessage(prompt)} className="min-h-11 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3 text-xs font-extrabold text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]">
                  {prompt}
                </button>
              ))}
            </div>

            {lastQuestion === null ? null : (
              <>
                <div className="mr-auto max-w-[86%] rounded-[22px] rounded-tl-md bg-[var(--accent)] p-4 text-sm leading-7 text-white">{lastQuestion}</div>
                <div className="max-w-[88%] rounded-[22px] rounded-tr-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
                  <p className="text-sm font-black">این بخش هنوز به مدل واقعی متصل نشده است.</p>
                  <p className="mt-2 text-xs leading-6 text-[var(--text-secondary)]">برای جلوگیری از نمایش پاسخ ساختگی، فعلاً فقط پیشنهادهای محاسبه‌شده‌ی دمو و دلایل ساختاریافته نشان داده می‌شوند. اتصال Cloudflare Workers AI یا مدل محلی در فاز AI انجام می‌شود.</p>
                </div>
              </>
            )}
          </div>

          <form onSubmit={handleSubmit} className="border-t border-[var(--border-subtle)] p-4 sm:p-5">
            <div className="flex items-end gap-2 rounded-[20px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-2 focus-within:border-[var(--accent-border)]">
              <button type="button" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm text-[var(--text-tertiary)]" aria-label="ورودی صوتی">◉</button>
              <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={1} placeholder="مثلاً: برای فردا چه پزشکانی اولویت دارند؟" className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none" />
              <button type="submit" className="min-h-10 shrink-0 rounded-xl bg-[var(--ai)] px-4 text-xs font-black text-white">ارسال</button>
            </div>
          </form>
        </article>

        <div className="space-y-4">
          <article className="app-card p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold text-[var(--text-tertiary)]">پیشنهادهای موتور توصیه</p>
                <h2 className="mt-1 text-lg font-black">
                  {openSuggestions.length.toLocaleString('fa-IR')} پیشنهاد باز · {acceptedCount.toLocaleString('fa-IR')} پذیرفته
                </h2>
              </div>
              <Link to="/planner" className="text-xs font-extrabold text-[var(--accent-strong)]">باز کردن پلن</Link>
            </div>
            <p className="mt-2 text-[10px] leading-5 text-[var(--text-tertiary)]">
              موتور قطعی · نسخه {batch.engineVersion} · سیاست {batch.policyVersion} — فقط پذیرش شما پیشنهاد را به پلن تبدیل می‌کند.
            </p>

            {decisionError === null ? null : (
              <p role="alert" className="mt-3 rounded-2xl bg-[var(--danger-soft)] p-3 text-[11px] font-bold text-[var(--danger)]">
                {decisionError}
              </p>
            )}

            <div className="mt-4 space-y-3">
              {suggestions.map((suggestion, index) => {
                const customer = getDemoCustomer(suggestion.customerId)
                const isOpen = suggestion.status === 'suggested' || suggestion.status === 'edited'
                return (
                  <div key={suggestion.id} className="rounded-[20px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-4">
                    <div className="flex items-start gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--ai-soft)] text-xs font-black text-[var(--ai-strong)]">{(index + 1).toLocaleString('fa-IR')}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="truncate text-sm font-black">{customer.name}</h3>
                          <span className={['rounded-full px-2.5 py-1 text-[9px] font-black', BAND_CLASSES[suggestion.priorityBand]].join(' ')}>
                            {BAND_LABELS[suggestion.priorityBand]}
                          </span>
                        </div>
                        <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">{customer.specialty} · {customer.route}</p>
                        <p className="mt-2 text-[11px] leading-6 text-[var(--text-secondary)]">{describeSuggestion(suggestion)}</p>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-[var(--surface-raised)] px-2.5 py-1 text-[9px] font-black text-[var(--text-tertiary)]">
                            امتیاز {suggestion.score.toLocaleString('fa-IR', { maximumFractionDigits: 1 })}
                          </span>
                          <span className="rounded-full bg-[var(--surface-raised)] px-2.5 py-1 text-[9px] font-black text-[var(--text-tertiary)]">
                            {STATUS_LABELS[suggestion.status]}
                          </span>
                        </div>

                        {isOpen ? (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <select
                              value={suggestion.suggestedDate}
                              onChange={(event) => decide('edit', suggestion, event.target.value)}
                              className="min-h-9 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2 text-[10px] font-bold"
                              aria-label={`تاریخ پیشنهاد ${customer.name}`}
                            >
                              {previewPlannerDays.map((day) => (
                                <option key={day.planDate} value={day.planDate}>
                                  {day.weekday} {day.jalaliDay.toLocaleString('fa-IR')}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => decide('accept', suggestion)}
                              className="min-h-9 rounded-xl bg-[var(--success)] px-3 text-[10px] font-black text-white"
                            >
                              پذیرش
                            </button>
                            <button
                              type="button"
                              onClick={() => decide('reject', suggestion)}
                              className="min-h-9 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 text-[10px] font-black text-[var(--text-secondary)]"
                            >
                              رد
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </article>

          <article className="app-card p-5">
            <p className="text-[11px] font-bold text-[var(--text-tertiary)]">وضعیت موتور</p>
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between rounded-2xl bg-[var(--surface-soft)] px-3.5 py-3"><span>Rule / Scoring Engine</span><span className="font-black text-[var(--success)]">آماده دمو</span></div>
              <div className="flex items-center justify-between rounded-2xl bg-[var(--surface-soft)] px-3.5 py-3"><span>Route Optimization</span><span className="font-black text-[var(--warning-strong)]">فاز بعد</span></div>
              <div className="flex items-center justify-between rounded-2xl bg-[var(--surface-soft)] px-3.5 py-3"><span>Cloudflare Workers AI</span><span className="font-black text-[var(--ai-strong)]">آماده اتصال</span></div>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}

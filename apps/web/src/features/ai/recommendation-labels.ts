import type { PriorityBand, SuggestionStatus, VisitSuggestion } from '@fieldrep/domain'

/** Persian presentation labels for recommendation engine output (P7-A3). */
export const REASON_LABELS: Record<string, string> = {
  frequency_gap: 'ویزیت باقیمانده از فرکانس الزامی',
  class_priority: 'اولویت کلاس مشتری',
  cycle_urgency: 'فشار زمانی چرخه برنامه‌ریزی',
  days_since_last_visit: 'فاصله از آخرین ویزیت',
  route_affinity: 'هم‌مسیر بودن با برنامه',
}

export const BAND_LABELS: Record<PriorityBand, string> = {
  very_high: 'اولویت خیلی بالا',
  high: 'اولویت بالا',
  medium: 'اولویت متوسط',
  low: 'اولویت پایین',
}

export const BAND_CLASSES: Record<PriorityBand, string> = {
  very_high: 'bg-[var(--danger-soft)] text-[var(--danger)]',
  high: 'bg-[var(--ai-soft)] text-[var(--ai-strong)]',
  medium: 'bg-[var(--warning-soft)] text-[var(--warning-strong)]',
  low: 'bg-[var(--surface-soft)] text-[var(--text-secondary)]',
}

export const STATUS_LABELS: Record<SuggestionStatus, string> = {
  suggested: 'پیشنهاد شده',
  accepted: 'پذیرفته شد',
  rejected: 'رد شد',
  edited: 'ویرایش شد',
  converted_to_plan: 'به پلن تبدیل شد',
  expired: 'منقضی شد',
}

export function reasonLabels(suggestion: VisitSuggestion): string[] {
  return suggestion.reasons.map((reason) => REASON_LABELS[reason.code] ?? reason.code)
}

/** Reproducible natural explanation derived from structured reasons (§10). */
export function describeSuggestion(suggestion: VisitSuggestion): string {
  const labels = reasonLabels(suggestion)
  return labels.length === 0 ? 'بدون فاکتور امتیاز فعال' : labels.join(' · ')
}
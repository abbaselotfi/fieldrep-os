import type { VisitVerificationResult, VisitVerificationStatus } from '@fieldrep/domain'

const STATUS_LABELS: Record<VisitVerificationStatus, string> = {
  verified: 'تأیید شده',
  nearby: 'نزدیک',
  unverified: 'تأییدنشده',
  outside: 'خارج از محدوده',
}

const STATUS_CLASSES: Record<VisitVerificationStatus, string> = {
  verified: 'bg-[var(--success-soft)] text-[var(--success)]',
  nearby: 'bg-[var(--warning-soft)] text-[var(--warning-strong)]',
  unverified: 'bg-[var(--surface-soft)] text-[var(--text-secondary)]',
  outside: 'bg-[var(--danger-soft)] text-[var(--danger)]',
}

const REASON_LABELS: Record<string, string> = {
  within_verified_radius: 'داخل شعاع تأیید',
  within_nearby_radius: 'داخل شعاع نزدیک',
  beyond_nearby_radius: 'فراتر از شعاع مجاز',
  accuracy_exceeds_limit: 'دقت GPS کمتر از حد مجاز',
  target_location_missing: 'موقعیت هدف ثبت نشده',
  offline_capture: 'ثبت آفلاین',
}

export function verificationStatusLabel(status: VisitVerificationStatus): string {
  return STATUS_LABELS[status]
}

export function verificationReasonLabels(result: VisitVerificationResult): string[] {
  return result.reasons.map((reason) => REASON_LABELS[reason] ?? reason)
}

export function VisitLocationBadge({ result }: { result: VisitVerificationResult }) {
  const reasons = verificationReasonLabels(result)
  return (
    <div
      data-verification-status={result.status}
      className={[
        'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-black',
        STATUS_CLASSES[result.status],
      ].join(' ')}
    >
      <span className="h-2 w-2 rounded-full bg-current" aria-hidden />
      <span>{verificationStatusLabel(result.status)}</span>
      {result.distanceMeters !== null && (
        <span className="font-bold opacity-80">
          {Math.round(result.distanceMeters).toLocaleString('fa-IR')} متر
        </span>
      )}
      <span className="sr-only">{reasons.join('، ')}</span>
    </div>
  )
}
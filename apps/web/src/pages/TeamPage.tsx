import { useMemo } from 'react'

import {
  buildTeamProgressSummary,
  summarizeVerifications,
  type TeamMemberProgress,
  type VerificationEntry,
} from '@fieldrep/domain'

import { MetricCard } from '../components/MetricCard'
import { PageHeader } from '../components/PageHeader'

/**
 * Supervisor workspace demo (P8-A1) — read-only team rollups.
 *
 * Data comes from the same deterministic domain aggregators the worker
 * serves on `/supervisor/*`; the demo facts below stand in for the live
 * team-subtree facts filtered by `authorizedTeamMembers` upstream
 * (PERMISSION-MATRIX §7) until the TeamPage wires to the real endpoints.
 */
const demoTeamMembers: readonly TeamMemberProgress[] = [
  { userId: 'demo-u1', planTotal: 10, planCompleted: 9, visitCompleted: 11, visitCancelled: 1 },
  { userId: 'demo-u2', planTotal: 12, planCompleted: 7, visitCompleted: 6, visitCancelled: 0 },
  { userId: 'demo-u3', planTotal: 8, planCompleted: 3, visitCompleted: 4, visitCancelled: 2 },
]

const demoVerifications: readonly VerificationEntry[] = [
  { userId: 'demo-u1', status: 'verified' },
  { userId: 'demo-u1', status: 'verified' },
  { userId: 'demo-u2', status: 'nearby' },
  { userId: 'demo-u3', status: 'outside' },
  { userId: 'demo-u3', status: 'unverified' },
]

export function TeamPage() {
  const progress = useMemo(() => buildTeamProgressSummary(demoTeamMembers), [])
  const verifications = useMemo(() => summarizeVerifications(demoVerifications), [])
  const planLabel = `${Math.round(progress.planCompletionRatio * 100).toLocaleString('fa-IR')}٪`
  const verifiedLabel = `${Math.round(verifications.verifiedRatio * 100).toLocaleString('fa-IR')}٪`

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="SUPERVISOR"
        title="داشبورد تیم"
        description="تجمیع فقط‌خواندنی پیشرفت پلن، ویزیت و تأیید موقعیت اعضا؛ drill-down و export در گام‌های بعدی."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="اعضا" value={progress.memberCount.toLocaleString('fa-IR')} detail="نماینده فعال" />
        <MetricCard label="Plan / Actual" value={planLabel} detail="نسبت اجرای تیم" emphasis />
        <MetricCard label="ویزیت تیم" value={progress.visitCompleted.toLocaleString('fa-IR')} detail="تکمیل‌شده" />
        <MetricCard label="Verified" value={verifiedLabel} detail="GPS در شعاع تأیید" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <article className="app-card p-5 sm:p-6">
          <p className="text-[11px] font-bold text-[var(--text-tertiary)]">PLAN PROGRESS</p>
          <h2 className="mt-1 text-lg font-black">پیشرفت پلن اعضا</h2>
          <div className="mt-5 space-y-4">
            {demoTeamMembers.map((member, index) => {
              const completion = member.planTotal === 0
                ? 0
                : Math.round((member.planCompleted / member.planTotal) * 100)
              return (
                <div key={`member-${index}`}>
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-bold">{`عضو ${(index + 1).toLocaleString('fa-IR')}`}</span>
                    <strong>{completion.toLocaleString('fa-IR')}٪</strong>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                    <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(6, completion)}%` }} />
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
                    {`${member.planCompleted.toLocaleString('fa-IR')} از ${member.planTotal.toLocaleString('fa-IR')} پلن · ${member.visitCompleted.toLocaleString('fa-IR')} ویزیت`}
                  </p>
                </div>
              )
            })}
          </div>
        </article>

        <article className="app-card p-5 sm:p-6">
          <p className="text-[11px] font-bold text-[var(--text-tertiary)]">VERIFICATION MIX</p>
          <h2 className="mt-1 text-lg font-black">ترکیب تأیید موقعیت</h2>
          <div className="mt-5 space-y-3 text-xs">
            {(
              [
                { label: 'تأیید شده', value: verifications.team.verified, tone: 'var(--success)' },
                { label: 'نزدیک', value: verifications.team.nearby, tone: 'var(--accent-strong)' },
                { label: 'خارج از محدوده', value: verifications.team.outside, tone: 'var(--danger)' },
                { label: 'تأییدنشده', value: verifications.team.unverified, tone: 'var(--warning-strong)' },
              ] as const
            ).map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3">
                <span className="font-bold"><span className="ml-2 inline-block h-2 w-2 rounded-full" style={{ background: row.tone }} />{row.label}</span>
                <strong>{row.value.toLocaleString('fa-IR')}</strong>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs leading-6 text-[var(--text-tertiary)]">تجمیع از همان سرویس دامنه‌ای ساخته می‌شود که API سوپروایزر برمی‌گرداند؛ drill-down هر عضو در گام بعدی.</p>
        </article>
      </div>
    </section>
  )
}

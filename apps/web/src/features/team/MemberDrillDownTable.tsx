import type { MemberDrillDownSummary } from '@fieldrep/domain'

import { describeCoverageBand } from './demo-member-coverage'

interface MemberDrillDownTableProps {
  summary: MemberDrillDownSummary
  onClose: () => void
}

/**
 * Member drill-down table (P8-A2) — presentational only.
 * Aggregation lives in the domain (`buildMemberDrillDown`); labels come from
 * `describeCoverageBand`. No data fetching here — future live wiring only
 * swaps the `summary` prop source.
 */
export function MemberDrillDownTable({ summary, onClose }: MemberDrillDownTableProps) {
  return (
    <article className="app-card p-5 sm:p-6" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold text-[var(--text-tertiary)]">MEMBER DRILL-DOWN</p>
          <h2 className="mt-1 text-lg font-black">پوشش مشتری عضو</h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {`${summary.customersCovered.toLocaleString('fa-IR')} پوشش کامل از ${summary.rowCount.toLocaleString('fa-IR')} مشتری`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-10 shrink-0 rounded-xl border border-[var(--border-subtle)] px-3 text-xs font-bold text-[var(--text-secondary)]"
        >
          بستن
        </button>
      </div>

      {summary.rows.length === 0 ? (
        <p className="mt-5 rounded-2xl bg-[var(--surface-soft)] px-4 py-6 text-center text-sm text-[var(--text-tertiary)]">
          برای این عضو رکورد پوششی ثبت نشده است.
        </p>
      ) : (
        <div className="thin-scrollbar mt-5 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-right text-xs">
            <thead className="bg-[var(--surface-soft)] text-[var(--text-tertiary)]">
              <tr>
                <th className="px-4 py-3 font-black">مشتری</th>
                <th className="px-4 py-3 font-black">انجام‌شده / هدف</th>
                <th className="px-4 py-3 font-black">پلن‌شده</th>
                <th className="px-4 py-3 font-black">وضعیت</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {summary.rows.map((row) => (
                <tr key={row.customerId} className="transition-colors hover:bg-[var(--surface-soft)]">
                  <td className="whitespace-nowrap px-4 py-3 font-bold">{row.customerName}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {`${row.completedVisits.toLocaleString('fa-IR')} از ${row.requiredFrequency.toLocaleString('fa-IR')}`}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{row.plannedVisits.toLocaleString('fa-IR')}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-bold">{describeCoverageBand(row.coverageRatio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  )
}

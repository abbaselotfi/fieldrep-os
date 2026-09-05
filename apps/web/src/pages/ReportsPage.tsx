import { useMemo, useState } from 'react'

import { MetricCard } from '../components/MetricCard'
import { PageHeader } from '../components/PageHeader'
import {
  buildPreviewReport,
  formatPreviewReportDate,
  formatPreviewReportWeekday,
  previewProductNames,
  previewReportCustomerName,
  type PreviewReportPeriod,
} from '../features/reports/preview-report'

const reportPeriods: readonly { key: PreviewReportPeriod; label: string }[] = [
  { key: 'day', label: 'روزانه' },
  { key: 'week', label: 'هفتگی' },
  { key: 'month', label: 'ماهانه' },
  { key: 'cycle', label: 'سیکل' },
]

export function ReportsPage() {
  const [period, setPeriod] = useState<PreviewReportPeriod>('day')
  const report = useMemo(() => buildPreviewReport(period), [period])
  const completionLabel = report.completionPercent === null
    ? '—'
    : `${Math.round(report.completionPercent).toLocaleString('fa-IR')}٪`
  const maxProductCalls = Math.max(1, ...report.byProduct.map((product) => product.callCount))

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="PERFORMANCE"
        title="گزارش‌ها و عملکرد"
        description="Plan در برابر Actual، پوشش مشتری، Product Call و روند اجرا؛ همه از Actual Visit و Projection قابل ردیابی ساخته می‌شوند."
        actions={
          <button type="button" onClick={() => window.print()} className="min-h-11 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 text-sm font-bold">چاپ گزارش</button>
        }
      />

      <article className="app-card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="no-scrollbar inline-flex overflow-x-auto rounded-2xl bg-[var(--surface-soft)] p-1 text-xs font-bold">
          {reportPeriods.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={period === item.key}
              onClick={() => setPeriod(item.key)}
              className={[
                'min-h-10 min-w-20 rounded-xl px-3 transition-colors sm:px-4',
                period === item.key
                  ? 'bg-[var(--surface-raised)] text-[var(--accent-strong)] shadow-sm'
                  : 'text-[var(--text-secondary)]',
              ].join(' ')}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="px-1 text-xs font-bold text-[var(--text-secondary)]">
          {formatPreviewReportDate(report.from)}
          {report.from === report.to ? '' : ` تا ${formatPreviewReportDate(report.to)}`}
        </p>
      </article>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Plan" value={report.planned.toLocaleString('fa-IR')} detail="پلن در بازه" />
        <MetricCard label="Actual" value={report.completed.toLocaleString('fa-IR')} detail="ویزیت تکمیل‌شده" emphasis />
        <MetricCard label="Plan / Actual" value={completionLabel} detail="نسبت اجرای بازه" />
        <MetricCard label="Unique Customers" value={report.uniqueCustomers.toLocaleString('fa-IR')} detail="مشتری یکتا" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)]">
        <article className="app-card p-5 sm:p-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold text-[var(--text-tertiary)]">PRODUCT MIX</p>
              <h2 className="mt-1 text-lg font-black">Product Callها</h2>
            </div>
            <span className="text-xs font-black text-[var(--accent-strong)]">جمع {report.totalProductCalls.toLocaleString('fa-IR')}</span>
          </div>
          <div className="mt-5 space-y-4">
            {report.byProduct.map((product) => {
              const width = Math.max(6, Math.round((product.callCount / maxProductCalls) * 100))
              return (
                <div key={product.productId}>
                  <div className="flex items-center justify-between gap-3 text-xs"><span className="font-bold">{product.name}</span><strong>{product.callCount.toLocaleString('fa-IR')}</strong></div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--surface-muted)]"><div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${width}%` }} /></div>
                </div>
              )
            })}
          </div>
        </article>

        <article className="app-card p-5 sm:p-6">
          <p className="text-[11px] font-bold text-[var(--text-tertiary)]">SOURCE QUALITY</p>
          <h2 className="mt-1 text-lg font-black">پلن‌شده در برابر خارج از پلن</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <div className="rounded-2xl bg-[var(--success-soft)] p-4">
              <p className="text-xs text-[var(--text-secondary)]">Planned → Actual</p>
              <strong className="mt-2 block text-3xl font-black text-[var(--success)]">{report.plannedActuals.toLocaleString('fa-IR')}</strong>
            </div>
            <div className="rounded-2xl bg-[var(--warning-soft)] p-4">
              <p className="text-xs text-[var(--text-secondary)]">Unplanned Actual</p>
              <strong className="mt-2 block text-3xl font-black text-[var(--warning-strong)]">{report.unplannedActuals.toLocaleString('fa-IR')}</strong>
            </div>
          </div>
          <p className="mt-4 text-xs leading-6 text-[var(--text-tertiary)]">Actual خارج از پلن در گزارش واقعی حفظ می‌شود اما به‌عنوان Plan قبلی شمارش نمی‌شود؛ تفکیک داده برای Audit و Compliance از UI مستقل است.</p>
        </article>
      </div>

      <article className="app-card overflow-hidden">
        <div className="border-b border-[var(--border-subtle)] px-4 py-4 sm:px-5">
          <p className="text-[11px] font-bold text-[var(--text-tertiary)]">ACTUAL VISITS</p>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-lg font-black">رکوردهای گزارش</h2>
            <span className="text-xs font-bold text-[var(--text-secondary)]">{report.visits.length.toLocaleString('fa-IR')} رکورد یکتا</span>
          </div>
        </div>

        {report.visits.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-[var(--text-tertiary)]">در این بازه Actual Visit ثبت نشده است.</div>
        ) : (
          <div className="thin-scrollbar overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-right text-xs">
              <thead className="bg-[var(--surface-soft)] text-[var(--text-tertiary)]">
                <tr>
                  <th className="px-4 py-3 font-black">تاریخ</th>
                  <th className="px-4 py-3 font-black">روز</th>
                  <th className="px-4 py-3 font-black">زمان</th>
                  <th className="px-4 py-3 font-black">مشتری</th>
                  <th className="px-4 py-3 font-black">محصول</th>
                  <th className="px-4 py-3 font-black">Visit Report</th>
                  <th className="px-4 py-3 font-black">نوع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {report.visits.map((visit) => (
                  <tr key={visit.id} className="transition-colors hover:bg-[var(--surface-soft)]">
                    <td className="whitespace-nowrap px-4 py-3 font-bold">{formatPreviewReportDate(visit.visitDate)}</td>
                    <td className="whitespace-nowrap px-4 py-3">{formatPreviewReportWeekday(visit.visitDate)}</td>
                    <td dir="ltr" className="whitespace-nowrap px-4 py-3 font-bold">{visit.time}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-bold">{previewReportCustomerName(visit.customerId)}</td>
                    <td className="whitespace-nowrap px-4 py-3">{previewProductNames(visit.productCalls) || '—'}</td>
                    <td className="max-w-md px-4 py-3 leading-6 text-[var(--text-secondary)]">{visit.notes}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={[
                        'rounded-full px-2.5 py-1 text-[10px] font-black',
                        visit.source === 'planned'
                          ? 'bg-[var(--success-soft)] text-[var(--success)]'
                          : 'bg-[var(--warning-soft)] text-[var(--warning-strong)]',
                      ].join(' ')}>
                        {visit.source === 'planned' ? 'Planned' : 'Unplanned'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <p className="px-1 text-[11px] leading-6 text-[var(--text-tertiary)]">Preview از داده ساختگی استفاده می‌کند. در Runtime واقعی همین Projection روی `/visits` و Counterهای owner-scoped اجرا می‌شود و Daily/Weekly/Monthly رکورد مستقل تولید نمی‌کنند.</p>
    </section>
  )
}

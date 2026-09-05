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

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="ACTUAL REPORTING"
        title="گزارش‌ها"
        description="گزارش روزانه، هفتگی، ماهانه و سیکلی همگی از یک منبع Actual Visit ساخته می‌شوند؛ تغییر بازه فقط Projection را عوض می‌کند و رکورد تازه‌ای نمی‌سازد."
        actions={
          <button type="button" onClick={() => window.print()} className="min-h-11 rounded-2xl border border-[var(--border-subtle)] bg-white px-4 text-sm font-bold">چاپ گزارش</button>
        }
      />

      <div className="flex flex-col gap-3 rounded-[24px] border border-[var(--border-subtle)] bg-white p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="inline-grid grid-cols-4 rounded-2xl bg-[var(--surface-soft)] p-1 text-xs font-bold">
          {reportPeriods.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={period === item.key}
              onClick={() => setPeriod(item.key)}
              className={[
                'min-h-10 rounded-xl px-3 sm:px-4',
                period === item.key
                  ? 'bg-white text-[var(--accent-strong)] shadow-sm'
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
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Plan" value={report.planned.toLocaleString('fa-IR')} detail="پلن در بازه" />
        <MetricCard label="Actual" value={report.completed.toLocaleString('fa-IR')} detail="ویزیت تکمیل‌شده" emphasis />
        <MetricCard label="Plan / Actual" value={completionLabel} detail="نسبت اجرای بازه" />
        <MetricCard label="Unique Customers" value={report.uniqueCustomers.toLocaleString('fa-IR')} detail="مشتری یکتا" />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <article className="rounded-[26px] border border-[var(--border-subtle)] bg-white p-5 sm:p-6">
          <p className="text-xs font-bold text-[var(--text-tertiary)]">PRODUCT CALLS</p>
          <h2 className="mt-1.5 text-lg font-black">تجمیع محصول‌ها</h2>
          <div className="mt-5 divide-y divide-[var(--border-subtle)]">
            {report.byProduct.map((product) => (
              <div key={product.productId} className="flex items-center justify-between py-3 text-sm">
                <span>{product.name}</span>
                <strong>{product.callCount.toLocaleString('fa-IR')}</strong>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-between rounded-2xl bg-[var(--surface-soft)] px-4 py-3 text-sm">
            <span>جمع Product Call</span>
            <strong>{report.totalProductCalls.toLocaleString('fa-IR')}</strong>
          </div>
        </article>

        <article className="rounded-[26px] border border-[var(--border-subtle)] bg-white p-5 sm:p-6">
          <p className="text-xs font-bold text-[var(--text-tertiary)]">ACTUAL SOURCE</p>
          <h2 className="mt-1.5 text-lg font-black">پلن‌شده در برابر خارج از پلن</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-[var(--surface-soft)] p-4">
              <p className="text-xs text-[var(--text-secondary)]">Planned → Actual</p>
              <strong className="mt-2 block text-3xl font-black">{report.plannedActuals.toLocaleString('fa-IR')}</strong>
            </div>
            <div className="rounded-2xl bg-[var(--surface-soft)] p-4">
              <p className="text-xs text-[var(--text-secondary)]">Unplanned Actual</p>
              <strong className="mt-2 block text-3xl font-black">{report.unplannedActuals.toLocaleString('fa-IR')}</strong>
            </div>
          </div>
          <p className="mt-4 text-xs leading-6 text-[var(--text-tertiary)]">
            Actual خارج از پلن در گزارش واقعی باقی می‌ماند، اما به‌عنوان پلن قبلی شمرده نمی‌شود؛ این تفکیک برای Compliance بعدی حفظ شده است.
          </p>
        </article>
      </div>

      <article className="overflow-hidden rounded-[26px] border border-[var(--border-subtle)] bg-white">
        <div className="border-b border-[var(--border-subtle)] px-4 py-4 sm:px-5">
          <p className="text-xs font-bold text-[var(--text-tertiary)]">ACTUAL VISIT ROWS</p>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-lg font-black">رکوردهای گزارش</h2>
            <span className="text-xs font-bold text-[var(--text-secondary)]">{report.visits.length.toLocaleString('fa-IR')} رکورد یکتا</span>
          </div>
        </div>

        {report.visits.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-[var(--text-tertiary)]">در این بازه Actual Visit ثبت نشده است.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full border-collapse text-right text-xs">
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
                  <tr key={visit.id}>
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
                          : 'bg-amber-50 text-amber-800',
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

      <p className="px-1 text-[11px] leading-6 text-[var(--text-tertiary)]">
        Preview از داده ساختگی استفاده می‌کند. در Runtime واقعی همین Projection روی `/visits` و Counterهای owner-scoped اجرا می‌شود؛ Daily/Weekly/Monthly رکورد مستقل تولید نمی‌کنند.
      </p>
    </section>
  )
}

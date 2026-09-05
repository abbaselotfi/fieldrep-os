import { getDemoCustomer } from '../../data/demo-field-workspace'
import { activePreviewPlans, createPreviewPlanSeed } from '../planner/preview-plan'
import { previewVisitProducts } from '../visits/preview-visit'

export type PreviewReportPeriod = 'day' | 'week' | 'month' | 'cycle'

export interface PreviewReportProductCall {
  productId: string
  callCount: number
}

export interface PreviewReportVisit {
  id: string
  customerId: string
  visitDate: string
  time: string
  source: 'planned' | 'unplanned'
  notes: string
  productCalls: readonly PreviewReportProductCall[]
}

export interface PreviewReportResult {
  period: PreviewReportPeriod
  from: string
  to: string
  planned: number
  completed: number
  uniqueCustomers: number
  plannedActuals: number
  unplannedActuals: number
  totalProductCalls: number
  completionPercent: number | null
  byProduct: readonly { productId: string; name: string; callCount: number }[]
  visits: readonly PreviewReportVisit[]
}

const [toujeo, lantus, soliqua] = previewVisitProducts

export const previewReportVisits: readonly PreviewReportVisit[] = [
  { id: 'actual-01', customerId: 'doctor-arman-rezaei', visitDate: '2026-09-06', time: '09:00', source: 'planned', notes: 'مرور کنترل قند و ادامه درمان.', productCalls: [{ productId: toujeo!.id, callCount: 1 }] },
  { id: 'actual-02', customerId: 'doctor-nazanin-karimi', visitDate: '2026-09-06', time: '10:00', source: 'planned', notes: 'گفتگو درباره بیماران نیازمند basal insulin.', productCalls: [{ productId: toujeo!.id, callCount: 1 }, { productId: soliqua!.id, callCount: 1 }] },
  { id: 'actual-03', customerId: 'doctor-mehdi-sharifi', visitDate: '2026-09-06', time: '11:00', source: 'planned', notes: 'پیگیری بیمار و مرور زمان تزریق.', productCalls: [{ productId: lantus!.id, callCount: 1 }] },
  { id: 'actual-04', customerId: 'pharmacy-sepid', visitDate: '2026-09-06', time: '12:00', source: 'planned', notes: 'بررسی موجودی و الگوی مراجعه بیماران.', productCalls: [{ productId: toujeo!.id, callCount: 1 }] },
  { id: 'actual-05', customerId: 'doctor-sara-zamani', visitDate: '2026-09-06', time: '14:30', source: 'planned', notes: 'مرور بیماران CKD و دیابت.', productCalls: [{ productId: soliqua!.id, callCount: 1 }] },
  { id: 'actual-06', customerId: 'doctor-pouya-naderi', visitDate: '2026-09-06', time: '15:30', source: 'planned', notes: 'Follow-up کوتاه و هماهنگی مراجعه بعدی.', productCalls: [{ productId: toujeo!.id, callCount: 1 }] },
  { id: 'actual-07', customerId: 'doctor-elham-tavakoli', visitDate: '2026-09-06', time: '16:30', source: 'unplanned', notes: 'ویزیت خارج از پلن و معرفی کوتاه محصول.', productCalls: [{ productId: toujeo!.id, callCount: 1 }] },
  { id: 'actual-08', customerId: 'doctor-sara-zamani', visitDate: '2026-09-07', time: '09:15', source: 'planned', notes: 'پیگیری برنامه قبلی.', productCalls: [{ productId: toujeo!.id, callCount: 1 }] },
  { id: 'actual-09', customerId: 'doctor-arman-rezaei', visitDate: '2026-09-07', time: '11:30', source: 'planned', notes: 'جلسه کوتاه در لوکیشن دوم.', productCalls: [{ productId: soliqua!.id, callCount: 1 }] },
  { id: 'actual-10', customerId: 'doctor-nazanin-karimi', visitDate: '2026-09-08', time: '10:45', source: 'planned', notes: 'گفتگو درباره تیتر دارو و Follow-up.', productCalls: [{ productId: toujeo!.id, callCount: 1 }, { productId: soliqua!.id, callCount: 1 }] },
  { id: 'actual-11', customerId: 'clinic-pars', visitDate: '2026-09-09', time: '13:00', source: 'unplanned', notes: 'مراجعه به مرکز و هماهنگی برنامه آموزشی.', productCalls: [{ productId: lantus!.id, callCount: 1 }] },
  { id: 'actual-12', customerId: 'doctor-mehdi-sharifi', visitDate: '2026-09-12', time: '09:30', source: 'planned', notes: 'ویزیت شروع هفته بعد.', productCalls: [{ productId: toujeo!.id, callCount: 1 }] },
  { id: 'actual-13', customerId: 'doctor-elham-tavakoli', visitDate: '2026-08-30', time: '15:00', source: 'planned', notes: 'ویزیت ابتدای ماه.', productCalls: [{ productId: lantus!.id, callCount: 1 }] },
] as const

const periodBounds: Record<PreviewReportPeriod, { from: string; to: string }> = {
  day: { from: '2026-09-06', to: '2026-09-06' },
  week: { from: '2026-09-05', to: '2026-09-11' },
  month: { from: '2026-08-23', to: '2026-09-22' },
  cycle: { from: '2026-06-22', to: '2026-09-22' },
}

export function buildPreviewReport(period: PreviewReportPeriod): PreviewReportResult {
  const bounds = periodBounds[period]
  const visits = previewReportVisits
    .filter((visit) => visit.visitDate >= bounds.from && visit.visitDate <= bounds.to)
    .sort((left, right) => left.visitDate.localeCompare(right.visitDate) || left.time.localeCompare(right.time))

  const plans = activePreviewPlans(createPreviewPlanSeed()).filter(
    (entry) => entry.planDate >= bounds.from && entry.planDate <= bounds.to,
  )
  const productTotals = new Map<string, number>()
  for (const visit of visits) {
    for (const call of visit.productCalls) {
      productTotals.set(call.productId, (productTotals.get(call.productId) ?? 0) + call.callCount)
    }
  }

  const byProduct = previewVisitProducts.map((product) => ({
    productId: product.id,
    name: product.name,
    callCount: productTotals.get(product.id) ?? 0,
  }))

  return {
    period,
    from: bounds.from,
    to: bounds.to,
    planned: plans.length,
    completed: visits.length,
    uniqueCustomers: new Set(visits.map((visit) => visit.customerId)).size,
    plannedActuals: visits.filter((visit) => visit.source === 'planned').length,
    unplannedActuals: visits.filter((visit) => visit.source === 'unplanned').length,
    totalProductCalls: byProduct.reduce((sum, product) => sum + product.callCount, 0),
    completionPercent: plans.length === 0 ? null : (visits.length / plans.length) * 100,
    byProduct,
    visits,
  }
}

export function previewProductNames(calls: readonly PreviewReportProductCall[]): string {
  return calls
    .map((call) => previewVisitProducts.find((product) => product.id === call.productId)?.name ?? call.productId)
    .join('، ')
}

export function previewReportCustomerName(customerId: string): string {
  return getDemoCustomer(customerId).name
}

export function formatPreviewReportDate(canonicalDate: string): string {
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    calendar: 'persian',
    numberingSystem: 'persian',
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(`${canonicalDate}T00:00:00.000Z`))
}

export function formatPreviewReportWeekday(canonicalDate: string): string {
  return new Intl.DateTimeFormat('fa-IR', {
    timeZone: 'UTC',
    weekday: 'long',
  }).format(new Date(`${canonicalDate}T00:00:00.000Z`))
}

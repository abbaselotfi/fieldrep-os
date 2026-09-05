import { demoProducts } from '../../data/demo-field-workspace'

export interface PreviewVisitProduct {
  id: string
  name: string
}

export interface PreviewVisitProductCall {
  productId: string
  callCount: number
}

export interface PreviewVisitDraft {
  customerId: string
  planEntryId?: string
  visitDate: string
  time: string
  notes?: string
  productCounts: Readonly<Record<string, number>>
}

export interface PreviewVisitActual {
  id: string
  customerId: string
  planEntryId?: string
  visitDate: string
  occurredAt: number
  status: 'completed'
  source: 'planned' | 'unplanned'
  notes?: string
  productCalls: PreviewVisitProductCall[]
}

export const previewVisitProducts: readonly PreviewVisitProduct[] = demoProducts.map((name, index) => ({
  id: `preview-product-${index + 1}`,
  name,
}))

export function createPreviewVisitActual(
  draft: PreviewVisitDraft,
  id: string,
): PreviewVisitActual {
  if (draft.customerId.trim() === '') throw new Error('customer_required')
  if (!isCanonicalDate(draft.visitDate)) throw new Error('invalid_visit_date')
  if (!/^([01]\d|2[0-3]):[0-5]\d$/u.test(draft.time)) throw new Error('invalid_visit_time')

  const productCalls = normalizePreviewProductCalls(draft.productCounts)
  const occurredAt = Date.parse(`${draft.visitDate}T${draft.time}:00.000Z`)
  if (!Number.isFinite(occurredAt)) throw new Error('invalid_visit_time')

  return {
    id,
    customerId: draft.customerId,
    visitDate: draft.visitDate,
    occurredAt,
    status: 'completed',
    source: draft.planEntryId === undefined ? 'unplanned' : 'planned',
    productCalls,
    ...(draft.planEntryId === undefined ? {} : { planEntryId: draft.planEntryId }),
    ...(draft.notes === undefined || draft.notes.trim() === '' ? {} : { notes: draft.notes.trim() }),
  }
}

export function normalizePreviewProductCalls(
  counts: Readonly<Record<string, number>>,
): PreviewVisitProductCall[] {
  const knownProducts = new Set(previewVisitProducts.map((product) => product.id))
  const calls: PreviewVisitProductCall[] = []

  for (const [productId, count] of Object.entries(counts)) {
    if (!knownProducts.has(productId)) throw new Error('unknown_product')
    if (!Number.isInteger(count) || count < 0) throw new Error('invalid_product_call_count')
    if (count > 0) calls.push({ productId, callCount: count })
  }

  return calls.sort((left, right) => left.productId.localeCompare(right.productId))
}

function isCanonicalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false
  const parsed = Date.parse(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed) && new Date(parsed).toISOString().slice(0, 10) === value
}

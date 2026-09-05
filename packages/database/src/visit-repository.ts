import type {
  CustomerId,
  CustomerVisitCounters,
  LocationId,
  PlanEntryId,
  ProductId,
  ProductSummary,
  UserId,
  VisitActual,
  VisitId,
  VisitProductCall,
  WorkspaceId,
} from '@fieldrep/domain'

import type { WorkspaceAtomicDataStore } from './contracts'

interface ProductRow {
  id: string
  workspace_id: string
  code: string | null
  name: string
  status: ProductSummary['status']
  sort_order: number
}

interface VisitRow {
  id: string
  workspace_id: string
  owner_user_id: string
  customer_id: string
  plan_entry_id: string | null
  visit_date: string
  occurred_at: number
  status: VisitActual['status']
  source: VisitActual['source']
  notes: string | null
  location_id: string | null
}

interface VisitProductCallRow {
  product_id: string
  call_count: number
}

interface ProductCounterRow {
  product_id: string
  call_count: number
}

interface VisitCountRow {
  visit_count: number
}

export interface CreateCompletedVisitInput {
  id: VisitId
  ownerUserId: UserId
  customerId: CustomerId
  planEntryId?: PlanEntryId
  visitDate: string
  occurredAt: number
  notes?: string
  locationId?: LocationId
  productCalls: readonly VisitProductCall[]
}

export interface VisitActualRepository {
  listProducts(): Promise<ProductSummary[]>
  listVisits(ownerUserId: UserId, fromDate: string, toDate: string): Promise<VisitActual[]>
  getVisit(ownerUserId: UserId, visitId: VisitId): Promise<VisitActual | null>
  createCompletedVisit(input: CreateCompletedVisitInput): Promise<VisitActual>
  cancelVisit(ownerUserId: UserId, visitId: VisitId): Promise<boolean>
  getCustomerCounters(
    ownerUserId: UserId,
    customerId: CustomerId,
    fromDate: string,
    toDate: string,
  ): Promise<CustomerVisitCounters>
}

export class WorkspaceVisitActualRepository implements VisitActualRepository {
  constructor(
    private readonly store: WorkspaceAtomicDataStore,
    private readonly now: () => number = Date.now,
  ) {}

  async listProducts(): Promise<ProductSummary[]> {
    const rows = await this.store.queryAll<ProductRow>(
      `SELECT id, workspace_id, code, name, status, sort_order
       FROM products
       WHERE workspace_id = ? AND status = 'active'
       ORDER BY sort_order, name`,
      [this.store.workspaceId],
    )

    return rows.map(mapProduct)
  }

  async listVisits(ownerUserId: UserId, fromDate: string, toDate: string): Promise<VisitActual[]> {
    const rows = await this.store.queryAll<VisitRow>(
      `${VISIT_SELECT}
       WHERE workspace_id = ?
         AND owner_user_id = ?
         AND visit_date BETWEEN ? AND ?
         AND status = 'completed'
       ORDER BY visit_date, occurred_at, id`,
      [this.store.workspaceId, ownerUserId, fromDate, toDate],
    )

    return Promise.all(rows.map((row) => this.hydrateVisit(row)))
  }

  async getVisit(ownerUserId: UserId, visitId: VisitId): Promise<VisitActual | null> {
    const row = await this.store.queryFirst<VisitRow>(
      `${VISIT_SELECT}
       WHERE workspace_id = ?
         AND owner_user_id = ?
         AND id = ?
       LIMIT 1`,
      [this.store.workspaceId, ownerUserId, visitId],
    )

    return row === null ? null : this.hydrateVisit(row)
  }

  async createCompletedVisit(input: CreateCompletedVisitInput): Promise<VisitActual> {
    const productCalls = normalizeProductCalls(input.productCalls)
    const now = this.now()
    const source = input.planEntryId === undefined ? 'unplanned' : 'planned'
    const commands = [
      {
        query: `INSERT INTO visits (
          id, workspace_id, owner_user_id, customer_id, plan_entry_id,
          visit_date, occurred_at, status, source, notes, location_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?)`,
        values: [
          input.id,
          this.store.workspaceId,
          input.ownerUserId,
          input.customerId,
          input.planEntryId ?? null,
          input.visitDate,
          input.occurredAt,
          source,
          input.notes ?? null,
          input.locationId ?? null,
          now,
          now,
        ],
      },
      ...productCalls.map((call) => ({
        query: `INSERT INTO visit_product_calls (
          visit_id, workspace_id, product_id, call_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        values: [input.id, this.store.workspaceId, call.productId, call.callCount, now, now],
      })),
    ]

    const results = await this.store.executeBatch(commands)
    if (results.some((result) => !result.success)) {
      throw new Error('visit_create_batch_failed')
    }

    const created = await this.getVisit(input.ownerUserId, input.id)
    if (created === null) throw new Error('visit_create_readback_failed')
    return created
  }

  async cancelVisit(ownerUserId: UserId, visitId: VisitId): Promise<boolean> {
    const result = await this.store.execute(
      `UPDATE visits
       SET status = 'cancelled', updated_at = ?
       WHERE workspace_id = ?
         AND owner_user_id = ?
         AND id = ?
         AND status = 'completed'`,
      [this.now(), this.store.workspaceId, ownerUserId, visitId],
    )
    return result.success && result.changes > 0
  }

  async getCustomerCounters(
    ownerUserId: UserId,
    customerId: CustomerId,
    fromDate: string,
    toDate: string,
  ): Promise<CustomerVisitCounters> {
    const visitCount = await this.store.queryFirst<VisitCountRow>(
      `SELECT COUNT(*) AS visit_count
       FROM visits
       WHERE workspace_id = ?
         AND owner_user_id = ?
         AND customer_id = ?
         AND visit_date BETWEEN ? AND ?
         AND status = 'completed'`,
      [this.store.workspaceId, ownerUserId, customerId, fromDate, toDate],
    )

    const byProduct = await this.store.queryAll<ProductCounterRow>(
      `SELECT vpc.product_id, SUM(vpc.call_count) AS call_count
       FROM visit_product_calls vpc
       JOIN visits v ON v.id = vpc.visit_id AND v.workspace_id = vpc.workspace_id
       WHERE v.workspace_id = ?
         AND v.owner_user_id = ?
         AND v.customer_id = ?
         AND v.visit_date BETWEEN ? AND ?
         AND v.status = 'completed'
       GROUP BY vpc.product_id
       ORDER BY vpc.product_id`,
      [this.store.workspaceId, ownerUserId, customerId, fromDate, toDate],
    )

    const productCounters = byProduct.map((row) => ({
      productId: row.product_id as ProductId,
      callCount: Number(row.call_count),
    }))

    return {
      customerId,
      completedVisitRecords: Number(visitCount?.visit_count ?? 0),
      totalProductCalls: productCounters.reduce((sum, item) => sum + item.callCount, 0),
      byProduct: productCounters,
    }
  }

  private async hydrateVisit(row: VisitRow): Promise<VisitActual> {
    const productRows = await this.store.queryAll<VisitProductCallRow>(
      `SELECT product_id, call_count
       FROM visit_product_calls
       WHERE workspace_id = ? AND visit_id = ?
       ORDER BY product_id`,
      [this.store.workspaceId, row.id],
    )

    return {
      id: row.id as VisitId,
      workspaceId: row.workspace_id as WorkspaceId,
      ownerUserId: row.owner_user_id as UserId,
      customerId: row.customer_id as CustomerId,
      visitDate: row.visit_date,
      occurredAt: Number(row.occurred_at),
      status: row.status,
      source: row.source,
      productCalls: productRows.map((productRow) => ({
        productId: productRow.product_id as ProductId,
        callCount: Number(productRow.call_count),
      })),
      ...(row.plan_entry_id === null ? {} : { planEntryId: row.plan_entry_id as PlanEntryId }),
      ...(row.notes === null ? {} : { notes: row.notes }),
      ...(row.location_id === null ? {} : { locationId: row.location_id as LocationId }),
    }
  }
}

const VISIT_SELECT = `SELECT
  id,
  workspace_id,
  owner_user_id,
  customer_id,
  plan_entry_id,
  visit_date,
  occurred_at,
  status,
  source,
  notes,
  location_id
FROM visits`

function mapProduct(row: ProductRow): ProductSummary {
  return {
    id: row.id as ProductId,
    workspaceId: row.workspace_id as WorkspaceId,
    code: row.code,
    name: row.name,
    status: row.status,
    sortOrder: Number(row.sort_order),
  }
}

function normalizeProductCalls(calls: readonly VisitProductCall[]): VisitProductCall[] {
  const totals = new Map<ProductId, number>()
  for (const call of calls) {
    if (!Number.isInteger(call.callCount) || call.callCount <= 0) {
      throw new Error('invalid_product_call_count')
    }
    totals.set(call.productId, (totals.get(call.productId) ?? 0) + call.callCount)
  }

  return [...totals.entries()].map(([productId, callCount]) => ({ productId, callCount }))
}

import type {
  CustomerId,
  PlanEntry,
  PlanEntryId,
  PlanEntrySource,
  PlanningCycleId,
  RouteId,
  UserId,
  WorkspaceId,
} from '@fieldrep/domain'

import type { WorkspaceWritableDataStore } from './contracts'

interface PlanEntryRow {
  id: string
  workspace_id: string
  owner_user_id: string
  customer_id: string
  plan_date: string
  route_id: string | null
  status: PlanEntry['status']
  source: PlanEntrySource
}

export interface CreatePlanEntryInput {
  id: PlanEntryId
  ownerUserId: UserId
  planningCycleId: PlanningCycleId
  customerId: CustomerId
  planDate: string
  routeId?: RouteId
  source?: PlanEntrySource
}

export interface UpdatePlanEntryInput {
  planningCycleId?: PlanningCycleId
  customerId?: CustomerId
  planDate?: string
  routeId?: RouteId | null
}

export interface PlanEntryRepository {
  listEntries(
    ownerUserId: UserId,
    fromDate: string,
    toDate: string,
    planningCycleId?: PlanningCycleId,
  ): Promise<PlanEntry[]>
  getEntry(ownerUserId: UserId, planEntryId: PlanEntryId): Promise<PlanEntry | null>
  createEntry(input: CreatePlanEntryInput): Promise<PlanEntry>
  updateEntry(
    ownerUserId: UserId,
    planEntryId: PlanEntryId,
    patch: UpdatePlanEntryInput,
  ): Promise<PlanEntry | null>
  cancelEntry(ownerUserId: UserId, planEntryId: PlanEntryId): Promise<boolean>
}

export class WorkspacePlanEntryRepository implements PlanEntryRepository {
  constructor(
    private readonly store: WorkspaceWritableDataStore,
    private readonly now: () => number = Date.now,
  ) {}

  async listEntries(
    ownerUserId: UserId,
    fromDate: string,
    toDate: string,
    planningCycleId?: PlanningCycleId,
  ): Promise<PlanEntry[]> {
    const predicates = [
      'workspace_id = ?',
      'owner_user_id = ?',
      'plan_date BETWEEN ? AND ?',
      "status <> 'cancelled'",
    ]
    const values: unknown[] = [this.store.workspaceId, ownerUserId, fromDate, toDate]

    if (planningCycleId !== undefined) {
      predicates.push('planning_cycle_id = ?')
      values.push(planningCycleId)
    }

    const rows = await this.store.queryAll<PlanEntryRow>(
      `${PLAN_ENTRY_SELECT}
       WHERE ${predicates.join('\n         AND ')}
       ORDER BY plan_date, id`,
      values,
    )

    return rows.map(mapPlanEntry)
  }

  async getEntry(ownerUserId: UserId, planEntryId: PlanEntryId): Promise<PlanEntry | null> {
    const row = await this.store.queryFirst<PlanEntryRow>(
      `${PLAN_ENTRY_SELECT}
       WHERE workspace_id = ?
         AND owner_user_id = ?
         AND id = ?
       LIMIT 1`,
      [this.store.workspaceId, ownerUserId, planEntryId],
    )

    return row === null ? null : mapPlanEntry(row)
  }

  async createEntry(input: CreatePlanEntryInput): Promise<PlanEntry> {
    const now = this.now()
    await this.store.execute(
      `INSERT INTO plan_entries (
         id, workspace_id, owner_user_id, planning_cycle_id, customer_id,
         plan_date, route_id, status, source, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'planned', ?, ?, ?)`,
      [
        input.id,
        this.store.workspaceId,
        input.ownerUserId,
        input.planningCycleId,
        input.customerId,
        input.planDate,
        input.routeId ?? null,
        input.source ?? 'manual',
        now,
        now,
      ],
    )

    const created = await this.getEntry(input.ownerUserId, input.id)
    if (created === null) {
      throw new Error('plan_entry_create_readback_failed')
    }

    return created
  }

  async updateEntry(
    ownerUserId: UserId,
    planEntryId: PlanEntryId,
    patch: UpdatePlanEntryInput,
  ): Promise<PlanEntry | null> {
    const assignments: string[] = []
    const values: unknown[] = []

    if (patch.planningCycleId !== undefined) {
      assignments.push('planning_cycle_id = ?')
      values.push(patch.planningCycleId)
    }
    if (patch.customerId !== undefined) {
      assignments.push('customer_id = ?')
      values.push(patch.customerId)
    }
    if (patch.planDate !== undefined) {
      assignments.push('plan_date = ?')
      values.push(patch.planDate)
    }
    if (Object.hasOwn(patch, 'routeId')) {
      assignments.push('route_id = ?')
      values.push(patch.routeId ?? null)
    }

    if (assignments.length === 0) {
      return this.getEntry(ownerUserId, planEntryId)
    }

    assignments.push('updated_at = ?')
    values.push(this.now(), this.store.workspaceId, ownerUserId, planEntryId)

    const result = await this.store.execute(
      `UPDATE plan_entries
       SET ${assignments.join(', ')}
       WHERE workspace_id = ?
         AND owner_user_id = ?
         AND id = ?
         AND status = 'planned'`,
      values,
    )

    if (!result.success || result.changes === 0) return null
    return this.getEntry(ownerUserId, planEntryId)
  }

  async cancelEntry(ownerUserId: UserId, planEntryId: PlanEntryId): Promise<boolean> {
    const result = await this.store.execute(
      `UPDATE plan_entries
       SET status = 'cancelled', updated_at = ?
       WHERE workspace_id = ?
         AND owner_user_id = ?
         AND id = ?
         AND status = 'planned'`,
      [this.now(), this.store.workspaceId, ownerUserId, planEntryId],
    )

    return result.success && result.changes > 0
  }
}

const PLAN_ENTRY_SELECT = `SELECT
  id,
  workspace_id,
  owner_user_id,
  customer_id,
  plan_date,
  route_id,
  status,
  source
FROM plan_entries`

function mapPlanEntry(row: PlanEntryRow): PlanEntry {
  return {
    id: row.id as PlanEntryId,
    workspaceId: row.workspace_id as WorkspaceId,
    ownerUserId: row.owner_user_id as UserId,
    customerId: row.customer_id as CustomerId,
    planDate: row.plan_date,
    ...(row.route_id === null ? {} : { routeId: row.route_id as RouteId }),
    status: row.status,
    source: row.source,
  }
}

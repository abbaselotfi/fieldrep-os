import type {
  BusinessTrip,
  CalendarActivity,
  CustomerSummary,
  LeaveRequest,
  PlanEntry,
  ProductSummary,
  UserId,
  VisitActual,
  WorkspaceId,
} from '@fieldrep/domain'
import { Hono, type Context } from 'hono'
import { z } from 'zod'

import {
  attachAuthContext,
  requireWorkspacePermission,
  type AuthContextResolver,
  type AuthorizationEnv,
} from '../middleware/authorization'

/**
 * P4-A2 — authorized offline sync endpoints.
 *
 * `push` applies offline mutations with a server-side idempotency ledger
 * (OFFLINE-SYNC-SPEC §7): a retried operation with a known operationId
 * returns the stored result instead of applying the mutation twice.
 * `pull` returns authorized snapshot datasets the field user's device uses to
 * hydrate the partitioned IndexedDB cache. Both endpoints are fail-closed and
 * workspace/user scoped. Incremental server-version change feeds and
 * base-version conflict enforcement are P4-A4; this phase establishes the
 * ledger and the authorized transport.
 */

export type SyncEntityType = 'plan_entry' | 'visit' | 'leave_request' | 'business_trip'
export type SyncOperationType = 'create' | 'update' | 'delete' | 'transition'

export interface SyncOperationPush {
  operationId: string
  entityType: SyncEntityType
  entityId: string
  operationType: SyncOperationType
  baseVersion?: string | undefined
  clientOccurredAt?: number | undefined
  payload: Record<string, unknown>
}

export interface SyncWireResult {
  operationId: string
  result: 'applied' | 'conflict' | 'rejected'
  deduplicated: boolean
  serverState?: unknown
  code?: string
}

export interface SyncWorkspaceRepositories {
  sync: SyncIdempotencyRepository
  plans: PlanEntryRepository
  visits: VisitActualRepository
  calendar: CalendarRepository
  customers?: CustomerReadRepository
}

export interface SyncApiDependencies {
  authContextResolver: AuthContextResolver
  repositoryForWorkspace(workspaceId: WorkspaceId): Promise<SyncWorkspaceRepositories>
  now?(): number
}

// Local repository contracts — only the surface the sync route actually calls.
// Defined here (not imported from @fieldrep/database) because the worker package
// only depends on @fieldrep/domain, matching the pattern in plan-api/visit-api.
export interface PlanEntryRepository {
  listEntries(
    ownerUserId: UserId,
    fromDate: string,
    toDate: string,
    planningCycleId?: string,
  ): Promise<PlanEntry[]>
  createEntry(input: {
    id: string
    ownerUserId: UserId
    planningCycleId: string
    customerId: string
    planDate: string
    routeId?: string
    source?: PlanEntry['source']
  }): Promise<PlanEntry>
  updateEntry(
    ownerUserId: UserId,
    planEntryId: string,
    patch: {
      planningCycleId?: string
      customerId?: string
      planDate?: string
      routeId?: string | null
    },
  ): Promise<PlanEntry | null>
  cancelEntry(ownerUserId: UserId, planEntryId: string): Promise<boolean>
}

export interface VisitActualRepository {
  listVisits(ownerUserId: UserId, fromDate: string, toDate: string): Promise<VisitActual[]>
  listProducts(): Promise<ProductSummary[]>
  createCompletedVisit(input: {
    id: string
    ownerUserId: UserId
    customerId: string
    planEntryId?: string
    visitDate: string
    occurredAt: number
    notes?: string
    locationId?: string
    productCalls: ReadonlyArray<{ productId: string; callCount: number }>
  }): Promise<VisitActual>
  cancelVisit(ownerUserId: UserId, visitId: string): Promise<boolean>
}

export interface CalendarRepository {
  listActivities(filter: { fromMs: number; toMs: number }): Promise<CalendarActivity[]>
  createLeaveRequest(input: {
    id: string
    userId: UserId
    type: LeaveRequest['type']
    startsAt: string
    endsAt: string
    reason?: string | undefined
  }): Promise<LeaveRequest>
  createBusinessTrip(input: {
    id: string
    userId: UserId
    destination: { label: string; city?: string | undefined; province?: string | undefined }
    startsAt: string
    endsAt: string
    purpose?: string | undefined
    transport?: string | undefined
  }): Promise<BusinessTrip>
}

export interface CustomerReadRepository {
  listCustomers(viewerUserId: UserId): Promise<CustomerSummary[]>
}

export interface RecordedSyncOperation {
  operationId: string
  workspaceId: string
  userId: string
  entityType: string
  entityId: string
  operationType: string
  result: unknown
  appliedAt: number
}

export interface SyncIdempotencyRepository {
  getRecorded(operationId: string): Promise<RecordedSyncOperation | null>
  recordApplied(input: {
    operationId: string
    workspaceId: WorkspaceId
    userId: UserId
    entityType: SyncEntityType | string
    entityId: string
    operationType: SyncOperationType | string
    result: unknown
    clientOccurredAt?: number | undefined
    appliedAt: number
  }): Promise<void>
}

const canonicalDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine(isCanonicalDate)
const isoTimestampSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/u)

const operationSchema = z.object({
  operationId: z.string().min(1).max(160).regex(/^[0-9A-Za-z_-]+$/u),
  entityType: z.enum(['plan_entry', 'visit', 'leave_request', 'business_trip']),
  entityId: z.string().min(1).max(255),
  operationType: z.enum(['create', 'update', 'delete', 'transition']),
  baseVersion: z.string().max(40).optional(),
  clientOccurredAt: z.number().int().positive().optional(),
  payload: z.record(z.string(), z.unknown()),
})

const pushBodySchema = z.object({
  operations: z.array(operationSchema).min(1).max(50),
})

const planCreatePayloadSchema = z.object({
  id: z.string().min(1).optional(),
  planningCycleId: z.string().min(1),
  customerId: z.string().min(1),
  planDate: canonicalDateSchema,
  routeId: z.string().min(1).optional(),
  source: z.enum(['manual', 'suggested', 'imported']).optional(),
})

const planUpdatePayloadSchema = z
  .object({
    planningCycleId: z.string().min(1).optional(),
    customerId: z.string().min(1).optional(),
    planDate: canonicalDateSchema.optional(),
    routeId: z.string().min(1).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0)

const visitCreatePayloadSchema = z.object({
  id: z.string().min(1).optional(),
  customerId: z.string().min(1),
  planEntryId: z.string().min(1).optional(),
  visitDate: canonicalDateSchema,
  occurredAt: z.number().int().positive(),
  notes: z.string().trim().max(5000).optional(),
  locationId: z.string().min(1).optional(),
  productCalls: z
    .array(z.object({ productId: z.string().min(1), callCount: z.number().int().min(1).max(100) }))
    .max(20)
    .default([]),
})

const leaveCreatePayloadSchema = z.object({
  id: z.string().min(1).optional(),
  type: z.enum(['annual', 'sick', 'hourly', 'emergency', 'other']),
  startsAt: isoTimestampSchema,
  endsAt: isoTimestampSchema,
  reason: z.string().max(500).optional(),
})

const tripCreatePayloadSchema = z.object({
  id: z.string().min(1).optional(),
  destination: z.object({
    label: z.string().min(1),
    city: z.string().optional(),
    province: z.string().optional(),
  }),
  startsAt: isoTimestampSchema,
  endsAt: isoTimestampSchema,
  purpose: z.string().max(500).optional(),
  transport: z.string().max(200).optional(),
})

type ApplyOutcome =
  | { result: 'applied'; serverState: unknown }
  | { result: 'conflict'; code: string; serverState?: unknown }
  | { result: 'rejected'; code: string }

export function createSyncApi(dependencies: SyncApiDependencies) {
  const app = new Hono<AuthorizationEnv>()

  app.use('/workspaces/*', attachAuthContext(dependencies.authContextResolver))

  app.post(
    '/workspaces/:workspaceId/sync/operations',
    requireWorkspacePermission('sync.push.own'),
    async (c) => {
      const raw = await readJson(c.req.raw)
      const parsed = pushBodySchema.safeParse(raw)
      if (!parsed.success) {
        return c.json({ error: 'invalid_sync_batch' }, 400)
      }

      const workspaceId = c.req.param('workspaceId') as WorkspaceId
      const authContext = c.get('authContext')
      const repository = await dependencies.repositoryForWorkspace(workspaceId)
      const nowMs = (dependencies.now ?? Date.now)()

      const results: SyncWireResult[] = []
      for (const operation of parsed.data.operations) {
        results.push(
          await handleOperation(c, repository, operation, authContext.userId, workspaceId, nowMs),
        )
      }

      return c.json({ results })
    },
  )

  app.get(
    '/workspaces/:workspaceId/sync/changes',
    requireWorkspacePermission('sync.pull.own'),
    async (c) => {
      const workspaceId = c.req.param('workspaceId') as WorkspaceId
      const authContext = c.get('authContext')
      const repository = await dependencies.repositoryForWorkspace(workspaceId)
      const requested = (c.req.query('datasets') ?? 'customers,plans,visits,products,calendar')
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value !== '')

            // Optional incremental cursor (OFFLINE-SYNC-SPEC §14). When provided,
      // only records updated after the cursor are returned. When absent (or
      // for datasets without a cursor-aware repository method), a full
      // snapshot is returned — clients may issue one full pull then switch
      // to incremental fetches.
      const cursor = c.req.query('cursor')
      const serverTime = new Date((dependencies.now ?? Date.now)()).toISOString()

      const datasets: Record<string, { records: { entityId: string; record: unknown }[]; count: number }> = {}
      for (const dataset of requested) {
        const snapshot = await buildDatasetChanges(repository, dataset, authContext.userId, cursor)
        if (snapshot !== null) {
          datasets[dataset] = snapshot
        }
      }

      return c.json({
        serverTime,
        datasets,
      })
    },
  )

  return app
}

async function handleOperation(
  c: Context<AuthorizationEnv>,
  repository: SyncWorkspaceRepositories,
  operation: SyncOperationPush,
  userId: UserId,
  workspaceId: WorkspaceId,
  nowMsValue: number,
): Promise<SyncWireResult> {
  // Idempotency: replay the stored result for a known operationId (SPEC §7).
  const recorded = await repository.sync.getRecorded(operation.operationId)
  if (recorded !== null) {
    if (recorded.userId !== userId || recorded.workspaceId !== workspaceId) {
      // A known operationId claimed by a different tenant is a boundary breach:
      // never answer from cache.
      return {
        operationId: operation.operationId,
        result: 'rejected',
        deduplicated: false,
        code: 'operation_binding_mismatch',
      }
    }
    return {
      operationId: operation.operationId,
      result: 'applied',
      deduplicated: true,
      serverState: recorded.result,
    }
  }

  const outcome = await applyOperation(repository, operation, userId)
  if (outcome.result === 'applied') {
    await repository.sync.recordApplied({
      operationId: operation.operationId,
      workspaceId,
      userId,
      entityType: operation.entityType,
      entityId: operation.entityId,
      operationType: operation.operationType,
      result: outcome.serverState,
      clientOccurredAt: operation.clientOccurredAt,
      appliedAt: nowMsValue,
    })
  }

  return {
    operationId: operation.operationId,
    result: outcome.result,
    deduplicated: false,
    ...(outcome.result === 'applied' ? { serverState: outcome.serverState } : {}),
    ...('serverState' in outcome && outcome.result !== 'applied' && outcome.serverState !== undefined
      ? { serverState: outcome.serverState }
      : {}),
    ...(outcome.result !== 'applied' ? { code: outcome.code } : {}),
  }
}

async function applyOperation(
  repository: SyncWorkspaceRepositories,
  operation: SyncOperationPush,
  userId: UserId,
): Promise<ApplyOutcome> {
  switch (operation.entityType) {
    case 'plan_entry':
      return applyPlanEntryOperation(repository.plans, operation, userId)
    case 'visit':
      return applyVisitOperation(repository.visits, operation, userId)
    case 'leave_request':
      return applyLeaveRequestOperation(repository.calendar, operation, userId)
    case 'business_trip':
      return applyBusinessTripOperation(repository.calendar, operation, userId)
  }
}

async function applyPlanEntryOperation(
  plans: PlanEntryRepository,
  operation: SyncOperationPush,
  userId: UserId,
): Promise<ApplyOutcome> {
  if (operation.operationType === 'create') {
    const parsed = planCreatePayloadSchema.safeParse(operation.payload)
    if (!parsed.success) return { result: 'rejected', code: 'invalid_plan_entry_payload' }
    if (parsed.data.id !== undefined && parsed.data.id !== operation.entityId) {
      return { result: 'rejected', code: 'entity_id_mismatch' }
    }

    try {
      const entry = await plans.createEntry({
        id: operation.entityId,
        ownerUserId: userId,
        planningCycleId: parsed.data.planningCycleId,
        customerId: parsed.data.customerId,
        planDate: parsed.data.planDate,
        ...(parsed.data.routeId === undefined ? {} : { routeId: parsed.data.routeId }),
        ...(parsed.data.source === undefined ? {} : { source: parsed.data.source }),
      })
      return { result: 'applied', serverState: entry }
    } catch (error) {
      return mapPlanError(error)
    }
  }

  if (operation.operationType === 'update') {
    const parsed = planUpdatePayloadSchema.safeParse(operation.payload)
    if (!parsed.success) return { result: 'rejected', code: 'invalid_plan_entry_payload' }

    const patch: {
      planningCycleId?: string
      customerId?: string
      planDate?: string
      routeId?: string | null
    } = {}
    if (parsed.data.planningCycleId !== undefined) patch.planningCycleId = parsed.data.planningCycleId
    if (parsed.data.customerId !== undefined) patch.customerId = parsed.data.customerId
    if (parsed.data.planDate !== undefined) patch.planDate = parsed.data.planDate
    if (Object.hasOwn(parsed.data, 'routeId')) patch.routeId = parsed.data.routeId ?? null

    try {
      const entry = await plans.updateEntry(userId, operation.entityId, patch)
      return entry === null
        ? { result: 'conflict', code: 'plan_entry_not_found', serverState: { entityId: operation.entityId } }
        : { result: 'applied', serverState: entry }
    } catch (error) {
      return mapPlanError(error)
    }
  }

  if (operation.operationType === 'delete') {
    try {
      const cancelled = await plans.cancelEntry(userId, operation.entityId)
      return cancelled
        ? { result: 'applied', serverState: { id: operation.entityId, status: 'cancelled' } }
        : { result: 'conflict', code: 'plan_entry_not_found', serverState: { entityId: operation.entityId } }
    } catch (error) {
      return mapPlanError(error)
    }
  }

  return { result: 'rejected', code: 'unsupported_operation' }
}

async function applyVisitOperation(
  visits: VisitActualRepository,
  operation: SyncOperationPush,
  userId: UserId,
): Promise<ApplyOutcome> {
  if (operation.operationType === 'create') {
    const parsed = visitCreatePayloadSchema.safeParse(operation.payload)
    if (!parsed.success) return { result: 'rejected', code: 'invalid_visit_report_payload' }
    if (parsed.data.id !== undefined && parsed.data.id !== operation.entityId) {
      return { result: 'rejected', code: 'entity_id_mismatch' }
    }

    try {
      const visit = await visits.createCompletedVisit({
        id: operation.entityId,
        ownerUserId: userId,
        customerId: parsed.data.customerId,
        visitDate: parsed.data.visitDate,
        occurredAt: parsed.data.occurredAt,
        productCalls: parsed.data.productCalls,
        ...(parsed.data.planEntryId === undefined ? {} : { planEntryId: parsed.data.planEntryId }),
        ...(parsed.data.notes === undefined || parsed.data.notes === '' ? {} : { notes: parsed.data.notes }),
        ...(parsed.data.locationId === undefined ? {} : { locationId: parsed.data.locationId }),
      })
      return { result: 'applied', serverState: visit }
    } catch (error) {
      return mapVisitError(error)
    }
  }

  if (operation.operationType === 'transition' || operation.operationType === 'delete') {
    try {
      const cancelled = await visits.cancelVisit(userId, operation.entityId)
      return cancelled
        ? { result: 'applied', serverState: { id: operation.entityId, status: 'cancelled' } }
        : { result: 'conflict', code: 'visit_not_found', serverState: { entityId: operation.entityId } }
    } catch (error) {
      return mapVisitError(error)
    }
  }

  return { result: 'rejected', code: 'unsupported_operation' }
}

async function applyLeaveRequestOperation(
  calendar: CalendarRepository,
  operation: SyncOperationPush,
  userId: UserId,
): Promise<ApplyOutcome> {
  if (operation.operationType !== 'create') {
    return { result: 'rejected', code: 'unsupported_operation' }
  }

  const parsed = leaveCreatePayloadSchema.safeParse(operation.payload)
  if (!parsed.success) return { result: 'rejected', code: 'invalid_leave_request_payload' }
  if (parsed.data.id !== undefined && parsed.data.id !== operation.entityId) {
    return { result: 'rejected', code: 'entity_id_mismatch' }
  }

  try {
    const leave = await calendar.createLeaveRequest({
      id: operation.entityId,
      userId,
      type: parsed.data.type,
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
      ...(parsed.data.reason === undefined ? {} : { reason: parsed.data.reason }),
    })
    return { result: 'applied', serverState: leave }
  } catch (error) {
    return mapCalendarError(error)
  }
}

async function applyBusinessTripOperation(
  calendar: CalendarRepository,
  operation: SyncOperationPush,
  userId: UserId,
): Promise<ApplyOutcome> {
  if (operation.operationType !== 'create') {
    return { result: 'rejected', code: 'unsupported_operation' }
  }

  const parsed = tripCreatePayloadSchema.safeParse(operation.payload)
  if (!parsed.success) return { result: 'rejected', code: 'invalid_trip_payload' }
  if (parsed.data.id !== undefined && parsed.data.id !== operation.entityId) {
    return { result: 'rejected', code: 'entity_id_mismatch' }
  }

  try {
    const trip = await calendar.createBusinessTrip({
      id: operation.entityId,
      userId,
      destination: parsed.data.destination,
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
      ...(parsed.data.purpose === undefined ? {} : { purpose: parsed.data.purpose }),
      ...(parsed.data.transport === undefined ? {} : { transport: parsed.data.transport }),
    })
    return { result: 'applied', serverState: trip }
  } catch (error) {
    return mapCalendarError(error)
  }
}
const PULL_DATASETS = new Set(['customers', 'plans', 'visits', 'products', 'calendar'])
const WIDE_FROM = '2000-01-01'
const WIDE_TO = '2100-12-31'

/**
 * Build a dataset snapshot, optionally scoped to records updated after the
 * given cursor (OFFLINE-SYNC-SPEC §14 incremental delta). For datasets without
 * a cursor-aware repository method (customers, products, calendar), a full
 * snapshot is returned — these reference sets are small and infrequently
 * changed by field users.
 */
async function buildDatasetChanges(
  repository: SyncWorkspaceRepositories,
  dataset: string,
  userId: UserId,
  cursor?: string,
): Promise<{ records: { entityId: string; record: unknown }[]; count: number } | null> {
  if (!PULL_DATASETS.has(dataset)) return null

  const from = cursor ?? WIDE_FROM
  let records: { entityId: string; record: unknown }[] = []

  if (dataset === 'plans') {
    const entries = await repository.plans.listEntries(userId, from, WIDE_TO)
    records = entries.map((entry) => ({ entityId: entry.id, record: entry }))
  } else if (dataset === 'visits') {
    const visits = await repository.visits.listVisits(userId, from, WIDE_TO)
    records = visits.map((visit) => ({ entityId: visit.id, record: visit }))
  } else if (dataset === 'products') {
    const products = await repository.visits.listProducts()
    records = products.map((product) => ({ entityId: product.id, record: product }))
  } else if (dataset === 'customers') {
    if (repository.customers !== undefined) {
      const customers = await repository.customers.listCustomers(userId)
      records = customers.map((customer) => ({ entityId: customer.id, record: customer }))
    }
  } else if (dataset === 'calendar') {
    const all = await repository.calendar.listActivities({ fromMs: 0, toMs: 8_640_000_000_000 })
    records = visibleActivitiesFor(all, userId).map((activity) => ({ entityId: activity.id, record: activity }))
  }

  return { records, count: records.length }
}

function visibleActivitiesFor(activities: readonly CalendarActivity[], userId: string) {
  return activities.filter(
    (activity) =>
      activity.scope === 'workspace' ||
      (activity.scope === 'user' && activity.ownerUserId === userId) ||
      (activity.scope === 'selected_users' && activity.targetUserIds.includes(userId)),
  )
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

function isCanonicalDate(value: string): boolean {
  const parsed = Date.parse(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed) && new Date(parsed).toISOString().slice(0, 10) === value
}

function mapPlanError(error: unknown): ApplyOutcome {
  const message = error instanceof Error ? error.message : String(error)

  if (message.includes('plan_cycle_mismatch')) return { result: 'rejected', code: 'outside_planning_cycle' }
  if (message.includes('plan_customer_scope_mismatch')) return { result: 'rejected', code: 'customer_not_found' }
  if (message.includes('plan_route_workspace_mismatch')) return { result: 'rejected', code: 'invalid_route' }
  if (
    message.includes('plan_entries_same_day_active_unique_idx') ||
    message.includes('UNIQUE constraint failed: plan_entries')
  ) {
    return { result: 'rejected', code: 'duplicate_same_day' }
  }
  return { result: 'rejected', code: 'plan_write_failed' }
}

function mapVisitError(error: unknown): ApplyOutcome {
  const message = error instanceof Error ? error.message : String(error)

  if (message.includes('visit_customer_scope_mismatch')) return { result: 'rejected', code: 'customer_not_found' }
  if (message.includes('visit_plan_scope_mismatch')) return { result: 'rejected', code: 'invalid_plan_link' }
  if (message.includes('visit_location_scope_mismatch')) return { result: 'rejected', code: 'invalid_location' }
  if (message.includes('visit_product_scope_mismatch')) return { result: 'rejected', code: 'invalid_product' }
  if (message.includes('invalid_product_call_count')) return { result: 'rejected', code: 'invalid_product_call_count' }
  if (
    message.includes('visits_plan_entry_active_unique_idx') ||
    message.includes('UNIQUE constraint failed: visits')
  ) {
    return { result: 'rejected', code: 'plan_already_completed' }
  }
  return { result: 'rejected', code: 'visit_write_failed' }
}

function mapCalendarError(error: unknown): ApplyOutcome {
  const message = error instanceof Error ? error.message : String(error)

  if (message.includes('UNIQUE constraint failed')) return { result: 'rejected', code: 'duplicate_identifier' }
  if (message.includes('workspace_mismatch') || message.includes('FOREIGN KEY constraint failed')) {
    return { result: 'rejected', code: 'invalid_reference' }
  }
  if (message.includes('leave_overlap')) return { result: 'rejected', code: 'overlapping_leave' }
  return { result: 'rejected', code: 'calendar_write_failed' }
}
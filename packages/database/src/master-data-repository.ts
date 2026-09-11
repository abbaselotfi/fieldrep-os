import type {
  CustomerId,
  CustomerStatus,
  CustomerType,
  ProductId,
  RouteId,
  UserId,
  WorkspaceId,
} from '@fieldrep/domain'

import type { WorkspaceAtomicDataStore, WorkspaceWriteCommand } from './contracts'

/**
 * Master-data administration repository (P9-A3).
 *
 * Workspace-scoped upsert/archive over migration-0002/0005 tables
 * (`routes`, `products`, `customers`, `customer_doctor_profiles`).
 *
 * Rules:
 *  - `archive*` soft-deletes (`status = 'archived'`) — no physical delete, so
 *    historical visits/plans keep their FK references intact;
 *  - upserts are idempotent by natural key (route code, product name, customer
 *    display_name per workspace) and create with explicit actor audit fields;
 *  - customer doctor upsert keeps the doctor profile in sync when the customer
 *    type is `doctor`.
 */

export interface UpsertRouteInput {
  id: RouteId
  code: string | null
  name: string
}

export interface UpsertProductInput {
  id: ProductId
  code: string | null
  name: string
  sortOrder: number
}

export interface UpsertCustomerInput {
  id: CustomerId
  type: CustomerType
  displayName: string
  doctorProfile?: {
    specialty: string | null
    classKey: string | null
    requiredFrequency: number
  }
}

export interface MasterDataRepository {
  listRoutes(): Promise<readonly { id: string; code: string | null; name: string; status: string }[]>
  upsertRoute(input: UpsertRouteInput, actorUserId: UserId): Promise<void>
  archiveRoute(id: RouteId, actorUserId: UserId): Promise<boolean>
  listProducts(): Promise<readonly { id: string; code: string | null; name: string; sortOrder: number; status: string }[]>
  upsertProduct(input: UpsertProductInput, actorUserId: UserId): Promise<void>
  archiveProduct(id: ProductId, actorUserId: UserId): Promise<boolean>
  listCustomers(): Promise<readonly { id: string; type: string; displayName: string; status: string }[]>
  upsertCustomer(input: UpsertCustomerInput, actorUserId: UserId): Promise<void>
  archiveCustomer(id: CustomerId, actorUserId: UserId): Promise<boolean>
}

export class WorkspaceMasterDataRepository implements MasterDataRepository {
  constructor(
    private readonly store: WorkspaceAtomicDataStore,
    private readonly now: () => number = Date.now,
  ) {}

  async listRoutes(): Promise<readonly { id: string; code: string | null; name: string; status: string }[]> {
    const rows = await this.store.queryAll<{
      id: string
      code: string | null
      name: string
      status: string
    }>(
      `SELECT id, code, name, status
       FROM routes
       WHERE workspace_id = ?
       ORDER BY name, id`,
      [this.store.workspaceId],
    )
    return rows
  }

  async upsertRoute(input: UpsertRouteInput, actorUserId: UserId): Promise<void> {
    const now = this.now()
    const commands: WorkspaceWriteCommand[] = [
      {
        query: `INSERT INTO routes (id, workspace_id, code, name, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'active', ?, ?)
         ON CONFLICT(workspace_id, code) DO UPDATE SET
           name = excluded.name,
           status = CASE WHEN routes.status = 'archived' THEN 'active' ELSE routes.status END,
           updated_at = excluded.updated_at`,
        values: [input.id, this.store.workspaceId, input.code ?? null, input.name, now, now],
      },
    ]
    await this.store.executeBatch(commands)
  }

  async archiveRoute(id: RouteId, _actorUserId: UserId): Promise<boolean> {
    const result = await this.store.execute(
      `UPDATE routes
       SET status = 'archived', updated_at = ?
       WHERE workspace_id = ? AND id = ? AND status <> 'archived'`,
      [this.now(), this.store.workspaceId, id],
    )
    return result.success && result.changes > 0
  }

  async listProducts(): Promise<readonly { id: string; code: string | null; name: string; sortOrder: number; status: string }[]> {
    const rows = await this.store.queryAll<{
      id: string
      code: string | null
      name: string
      sort_order: number
      status: string
    }>(
      `SELECT id, code, name, sort_order, status
       FROM products
       WHERE workspace_id = ?
       ORDER BY sort_order, id`,
      [this.store.workspaceId],
    )
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      sortOrder: row.sort_order,
      status: row.status,
    }))
  }

  async upsertProduct(input: UpsertProductInput, actorUserId: UserId): Promise<void> {
    const now = this.now()
    const commands: WorkspaceWriteCommand[] = [
      {
        query: `INSERT INTO products (id, workspace_id, code, name, sort_order, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
         ON CONFLICT(workspace_id, code) DO UPDATE SET
           name = excluded.name,
           sort_order = excluded.sort_order,
           status = CASE WHEN products.status = 'archived' THEN 'active' ELSE products.status END,
           updated_at = excluded.updated_at`,
        values: [input.id, this.store.workspaceId, input.code ?? null, input.name, input.sortOrder, now, now],
      },
    ]
    await this.store.executeBatch(commands)
  }

  async archiveProduct(id: ProductId, _actorUserId: UserId): Promise<boolean> {
    const result = await this.store.execute(
      `UPDATE products
       SET status = 'archived', updated_at = ?
       WHERE workspace_id = ? AND id = ? AND status <> 'archived'`,
      [this.now(), this.store.workspaceId, id],
    )
    return result.success && result.changes > 0
  }

  async listCustomers(): Promise<readonly { id: string; type: string; displayName: string; status: string }[]> {
    const rows = await this.store.queryAll<{
      id: string
      customer_type: string
      display_name: string
      status: string
    }>(
      `SELECT id, customer_type, display_name, status
       FROM customers
       WHERE workspace_id = ?
       ORDER BY display_name, id`,
      [this.store.workspaceId],
    )
    return rows.map((row) => ({
      id: row.id,
      type: row.customer_type,
      displayName: row.display_name,
      status: row.status,
    }))
  }

  async upsertCustomer(input: UpsertCustomerInput, actorUserId: UserId): Promise<void> {
    const now = this.now()
    const commands: WorkspaceWriteCommand[] = [
      {
        query: `INSERT INTO customers (
           id, workspace_id, customer_type, display_name, status, record_scope,
           source, created_by_user_id, created_at, updated_at
         ) VALUES (?, ?, ?, ?, 'active', 'workspace', 'company', ?, ?, ?)
         ON CONFLICT(workspace_id, display_name) DO UPDATE SET
           customer_type = excluded.customer_type,
           status = CASE WHEN customers.status = 'archived' THEN 'active' ELSE customers.status END,
           updated_at = excluded.updated_at`,
        values: [input.id, this.store.workspaceId, input.type, input.displayName, actorUserId, now, now],
      },
    ]
    if (input.type === 'doctor' && input.doctorProfile !== undefined) {
      commands.push({
        query: `INSERT INTO customer_doctor_profiles (
           customer_id, workspace_id, specialty, class_key, required_frequency, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(customer_id) DO UPDATE SET
           specialty = excluded.specialty,
           class_key = excluded.class_key,
           required_frequency = excluded.required_frequency,
           updated_at = excluded.updated_at`,
        values: [
          input.id,
          this.store.workspaceId,
          input.doctorProfile.specialty ?? null,
          input.doctorProfile.classKey ?? null,
          input.doctorProfile.requiredFrequency,
          now,
        ],
      })
    }
    await this.store.executeBatch(commands)
  }

  async archiveCustomer(id: CustomerId, _actorUserId: UserId): Promise<boolean> {
    const result = await this.store.execute(
      `UPDATE customers
       SET status = 'archived', updated_at = ?
       WHERE workspace_id = ? AND id = ? AND status <> 'archived'`,
      [this.now(), this.store.workspaceId, id],
    )
    return result.success && result.changes > 0
  }
}

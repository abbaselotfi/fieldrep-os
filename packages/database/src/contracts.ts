import type { WorkspaceId } from '@fieldrep/domain'

export interface WorkspaceDataStore {
  readonly workspaceId: WorkspaceId
  readonly schemaVersion: number
  health(): Promise<boolean>
}

export interface WorkspaceDataRouter {
  get(workspaceId: WorkspaceId): Promise<WorkspaceDataStore>
}

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike
  first<T = Record<string, unknown>>(): Promise<T | null>
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike
}

export type D1BindingRegistry = Readonly<Record<string, D1DatabaseLike | undefined>>

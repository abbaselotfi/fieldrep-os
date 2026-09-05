import type { WorkspaceId } from '@fieldrep/domain'

export interface WorkspaceDataStore {
  readonly workspaceId: WorkspaceId
  readonly schemaVersion: number
  health(): Promise<boolean>
  queryFirst<T = Record<string, unknown>>(query: string, values?: readonly unknown[]): Promise<T | null>
  queryAll<T = Record<string, unknown>>(query: string, values?: readonly unknown[]): Promise<T[]>
}

export interface WorkspaceWriteResult {
  success: boolean
  changes: number
}

export interface WorkspaceWriteCommand {
  query: string
  values?: readonly unknown[]
}

export interface WorkspaceWritableDataStore extends WorkspaceDataStore {
  execute(query: string, values?: readonly unknown[]): Promise<WorkspaceWriteResult>
}

export interface WorkspaceAtomicDataStore extends WorkspaceWritableDataStore {
  executeBatch(commands: readonly WorkspaceWriteCommand[]): Promise<WorkspaceWriteResult[]>
}

export interface WorkspaceDataRouter {
  get(workspaceId: WorkspaceId): Promise<WorkspaceDataStore>
}

export interface D1ResultLike<T = Record<string, unknown>> {
  results: T[]
}

export interface D1RunResultLike {
  success: boolean
  meta?: {
    changes?: number
  }
}

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<D1ResultLike<T>>
  run?(): Promise<D1RunResultLike>
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike
  batch?(statements: D1PreparedStatementLike[]): Promise<D1RunResultLike[]>
}

export type D1BindingRegistry = Readonly<Record<string, D1DatabaseLike | undefined>>

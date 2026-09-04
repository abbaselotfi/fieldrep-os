import type { WorkspaceId } from '@fieldrep/domain'

export interface WorkspaceDataStore {
  readonly workspaceId: WorkspaceId
  health(): Promise<boolean>
}

export interface WorkspaceDataRouter {
  get(workspaceId: WorkspaceId): Promise<WorkspaceDataStore>
}

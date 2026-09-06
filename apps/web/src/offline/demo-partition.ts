import type { OfflinePartition } from './types'

/**
 * Demo partition used while the web shell runs on demo data (no real session).
 * When production authentication lands (P1 remote/Auth wiring), this constant is
 * replaced by the authenticated `userId + workspaceId`; the store keeps the
 * same partition-isolation guarantees either way.
 */
export const demoOfflinePartition: OfflinePartition = {
  userId: 'demo-user-1',
  workspaceId: 'demo-workspace-1',
}
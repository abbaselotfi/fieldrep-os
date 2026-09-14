import type { UserId } from './identity'

/**
 * Admin audit & reporting contracts (P9-A5).
 *
 * Filter model for reading `workspace_audit_events` (migration-0001) plus a
 * deterministic summary projection for admin reports. Pure functions — no
 * storage access here.
 */

export interface AuditEventFilter {
  actorUserId?: UserId | undefined
  entityType?: string | undefined
  entityId?: string | undefined
  actionKey?: string | undefined
  fromMs?: number | undefined
  toMs?: number | undefined
  limit: number
}

export interface AuditEvent {
  id: string
  actorUserId: string | null
  actionKey: string
  entityType: string
  entityId: string | null
  metadata: Record<string, unknown> | null
  occurredAt: number
}

export interface AuditActionSummary {
  actionKey: string
  entityType: string
  count: number
  lastOccurredAt: number
}

export function buildAuditActionSummary(events: readonly AuditEvent[]): AuditActionSummary[] {
  const byKey = new Map<string, AuditActionSummary>()
  for (const event of events) {
    const key = `${event.actionKey}|${event.entityType}`
    const existing = byKey.get(key)
    if (existing === undefined) {
      byKey.set(key, {
        actionKey: event.actionKey,
        entityType: event.entityType,
        count: 1,
        lastOccurredAt: event.occurredAt,
      })
    } else {
      existing.count += 1
      if (event.occurredAt > existing.lastOccurredAt) existing.lastOccurredAt = event.occurredAt
    }
  }
  return [...byKey.values()].sort((a, b) => {
    const byCount = b.count - a.count
    return byCount !== 0 ? byCount : a.actionKey.localeCompare(b.actionKey)
  })
}
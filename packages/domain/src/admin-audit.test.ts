import { describe, expect, it } from 'vitest'

import { buildAuditActionSummary, type AuditEvent } from './admin-audit'

function event(id: string, actionKey: string, entityType: string, at: number): AuditEvent {
  return {
    id,
    actorUserId: 'user-1',
    actionKey,
    entityType,
    entityId: null,
    metadata: null,
    occurredAt: at,
  }
}

describe('buildAuditActionSummary', () => {
  it('aggregates counts per action+entity pair', () => {
    const summary = buildAuditActionSummary([
      event('a1', 'plan.create', 'plan', 1000),
      event('a2', 'plan.create', 'plan', 2000),
      event('a3', 'visit.create', 'visit', 1500),
    ])
    expect(summary).toHaveLength(2)
    const plan = summary.find((s) => s.actionKey === 'plan.create')!
    expect(plan.count).toBe(2)
    expect(plan.lastOccurredAt).toBe(2000)
  })

  it('sorts by count descending then action key', () => {
    const summary = buildAuditActionSummary([
      event('a1', 'visit.create', 'visit', 1000),
      event('a2', 'visit.create', 'visit', 1000),
      event('a3', 'plan.create', 'plan', 1000),
    ])
    expect(summary[0]!.actionKey).toBe('visit.create')
    expect(summary[0]!.count).toBeGreaterThan(summary[1]!.count)
  })
})
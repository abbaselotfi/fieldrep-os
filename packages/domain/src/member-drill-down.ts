/**
 * Member drill-down projection (P8-A2 — Supervisor Workspace).
 *
 * A per-member, per-customer coverage table over facts the caller already
 * resolved with team-scoped permissions (`plans.read.team` /
 * `reports.read.team`). Filtering happened upstream; this module only
 * projects. Small module on purpose — one responsibility: coverage rows.
 */
export interface MemberDrillDownFact {
  userId: string
  customerId: string
  customerName: string
  requiredFrequency: number
  completedVisits: number
  plannedVisits: number
}

export interface MemberDrillDownRow {
  customerId: string
  customerName: string
  requiredFrequency: number
  completedVisits: number
  plannedVisits: number
  /** completed / required; 1 when nothing was required. */
  coverageRatio: number
  remaining: number
}

export interface MemberDrillDownSummary {
  userId: string
  rowCount: number
  customersCovered: number
  customersRemaining: number
  rows: MemberDrillDownRow[]
}

/** Coverage ratio with the not-required edge case pinned to full coverage. */
function coverageRatio(completed: number, required: number): number {
  if (required <= 0) return 1
  return completed / required
}

export function buildMemberDrillDown(
  userId: string,
  facts: readonly MemberDrillDownFact[],
): MemberDrillDownSummary {
  const rows = facts
    .filter((fact) => fact.userId === userId)
    .map((fact) => ({
      customerId: fact.customerId,
      customerName: fact.customerName,
      requiredFrequency: fact.requiredFrequency,
      completedVisits: fact.completedVisits,
      plannedVisits: fact.plannedVisits,
      coverageRatio: coverageRatio(fact.completedVisits, fact.requiredFrequency),
      remaining: Math.max(0, fact.requiredFrequency - fact.completedVisits),
    }))
    // Deterministic dashboard order.
    .sort((a, b) => (a.customerId < b.customerId ? -1 : a.customerId > b.customerId ? 1 : 0))

  const customersCovered = rows.filter((row) => row.remaining === 0).length

  return {
    userId,
    rowCount: rows.length,
    customersCovered,
    customersRemaining: rows.length - customersCovered,
    rows,
  }
}

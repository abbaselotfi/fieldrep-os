/**
 * Team progress aggregation (P8 — Supervisor Workspace).
 *
 * Pure, deterministic rollup over per-member facts the caller already
 * resolved with team-scoped permissions (`plans.read.team` /
 * `reports.read.team`). The supervisor sees only members their scope grants
 * cover — filtering happened upstream; this module only aggregates.
 */
export interface TeamMemberProgress {
  userId: string
  planTotal: number
  planCompleted: number
  visitCompleted: number
  visitCancelled: number
}

export interface TeamMemberProgressRow extends TeamMemberProgress {
  /** completed / total plans; 0 when the member has no plans yet. */
  planCompletionRatio: number
}

export interface TeamProgressSummary {
  memberCount: number
  planTotal: number
  planCompleted: number
  visitCompleted: number
  visitCancelled: number
  /** team-wide completed / total plans; 0 when the team has no plans. */
  planCompletionRatio: number
  members: TeamMemberProgressRow[]
}

function ratio(part: number, total: number): number {
  return total <= 0 ? 0 : part / total
}

export function buildTeamProgressSummary(
  members: readonly TeamMemberProgress[],
): TeamProgressSummary {
  const rows = members
    .map((member) => ({
      ...member,
      planCompletionRatio: ratio(member.planCompleted, member.planTotal),
    }))
    // Deterministic order (stable for dashboards and exports).
    .sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0))

  const planTotal = rows.reduce((sum, row) => sum + row.planTotal, 0)
  const planCompleted = rows.reduce((sum, row) => sum + row.planCompleted, 0)
  const visitCompleted = rows.reduce((sum, row) => sum + row.visitCompleted, 0)
  const visitCancelled = rows.reduce((sum, row) => sum + row.visitCancelled, 0)

  return {
    memberCount: rows.length,
    planTotal,
    planCompleted,
    visitCompleted,
    visitCancelled,
    planCompletionRatio: ratio(planCompleted, planTotal),
    members: rows,
  }
}
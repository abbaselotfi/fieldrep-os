import type { VisitVerificationStatus } from './visit-verification'

/**
 * Visit-verification summary (P8 — Supervisor Workspace).
 *
 * Aggregates verification outcomes the supervisor is allowed to read
 * (`reports.read.team` scoping happened upstream) into per-user and team
 * counts so coverage quality is visible at a glance.
 */
export interface VerificationStatusCounts {
  verified: number
  nearby: number
  unverified: number
  outside: number
  total: number
}

export interface VerificationEntry {
  userId: string
  status: VisitVerificationStatus
}

export interface UserVerificationSummary extends VerificationStatusCounts {
  userId: string
  /** Share of evaluations inside the verified radius; 0 when no entries. */
  verifiedRatio: number
}

export interface TeamVerificationSummary {
  team: VerificationStatusCounts
  /** Share of all evaluations inside the verified radius; 0 when none. */
  verifiedRatio: number
  byUser: UserVerificationSummary[]
}

function emptyCounts(): VerificationStatusCounts {
  return { verified: 0, nearby: 0, unverified: 0, outside: 0, total: 0 }
}

function addStatus(counts: VerificationStatusCounts, status: VisitVerificationStatus): void {
  counts[status] += 1
  counts.total += 1
}

export function summarizeVerifications(entries: readonly VerificationEntry[]): TeamVerificationSummary {
  const team = emptyCounts()
  const perUser = new Map<string, VerificationStatusCounts>()

  for (const entry of entries) {
    addStatus(team, entry.status)
    let counts = perUser.get(entry.userId)
    if (counts === undefined) {
      counts = emptyCounts()
      perUser.set(entry.userId, counts)
    }
    addStatus(counts, entry.status)
  }

  const byUser = [...perUser.entries()]
    .map(([userId, counts]) => ({
      userId,
      ...counts,
      verifiedRatio: counts.total === 0 ? 0 : counts.verified / counts.total,
    }))
    // Deterministic dashboard order.
    .sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0))

  return {
    team,
    verifiedRatio: team.total === 0 ? 0 : team.verified / team.total,
    byUser,
  }
}
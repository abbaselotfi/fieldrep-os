/**
 * Member coverage facts for one team member (P8-A2 drill-down).
 *
 * Same deterministic domain aggregator the worker serves on
 * `/supervisor/members/:id/coverage`; the demo facts below stand in for the
 * live team-subtree facts filtered by `authorizedTeamMembers` upstream
 * until the page wires to the real endpoint.
 */
export type DemoMemberCoverageFact = {
  userId: string
  customerId: string
  customerName: string
  requiredFrequency: number
  completedVisits: number
  plannedVisits: number
}

export const demoMemberCoverageFacts: readonly DemoMemberCoverageFact[] = [
  { userId: 'demo-u1', customerId: 'c1', customerName: 'دکتر الف', requiredFrequency: 3, completedVisits: 3, plannedVisits: 0 },
  { userId: 'demo-u1', customerId: 'c2', customerName: 'دکتر ب', requiredFrequency: 2, completedVisits: 1, plannedVisits: 1 },
  { userId: 'demo-u2', customerId: 'c3', customerName: 'دکتر ج', requiredFrequency: 2, completedVisits: 1, plannedVisits: 0 },
  { userId: 'demo-u2', customerId: 'c4', customerName: 'دکتر د', requiredFrequency: 1, completedVisits: 0, plannedVisits: 1 },
  { userId: 'demo-u3', customerId: 'c5', customerName: 'دکتر هـ', requiredFrequency: 4, completedVisits: 1, plannedVisits: 1 },
]

/** Persian drill-down labels for coverage ratios (P8-A2). */
export function describeCoverageBand(coverageRatio: number): 'پوشش کامل' | 'نیمه‌تمام' | 'عقب‌افتاده' {
  if (coverageRatio >= 1) return 'پوشش کامل'
  if (coverageRatio >= 0.5) return 'نیمه‌تمام'
  return 'عقب‌افتاده'
}

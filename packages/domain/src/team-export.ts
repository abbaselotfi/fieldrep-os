/**
 * Permission-scoped team export (P8-A3 — Supervisor Workspace).
 *
 * Exports only what the supervisor endpoint already resolved: rows from the
 * caller's authorized team subtree, never whole-workspace dumps. The CSV
 * serializer here is deterministic (sorted rows, fixed header order) so the
 * same fact set always produces byte-identical output — auditable and
 * diff-friendly. One responsibility, one small module.
 */
export interface TeamExportRow {
  userId: string
  customerId: string
  customerName: string
  requiredFrequency: number
  completedVisits: number
  plannedVisits: number
  coverageRatio: number
  remaining: number
}

const EXPORT_HEADER = [
  'userId',
  'customerId',
  'customerName',
  'requiredFrequency',
  'completedVisits',
  'plannedVisits',
  'coverageRatio',
  'remaining',
] as const

/** CSV-escape one cell: quote when the value carries a separator. */
function escapeCell(value: string | number): string {
  const text = String(value)
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function serializeTeamCoverageCsv(rows: readonly TeamExportRow[]): string {
  const ordered = [...rows].sort((a, b) =>
    a.userId === b.userId
      ? a.customerId < b.customerId ? -1 : a.customerId > b.customerId ? 1 : 0
      : a.userId < b.userId ? -1 : 1,
  )
  const lines = [
    EXPORT_HEADER.join(','),
    ...ordered.map((row) =>
      [
        escapeCell(row.userId),
        escapeCell(row.customerId),
        escapeCell(row.customerName),
        row.requiredFrequency,
        row.completedVisits,
        row.plannedVisits,
        row.coverageRatio,
        row.remaining,
      ].join(','),
    ),
  ]
  return `${lines.join('\n')}\n`
}

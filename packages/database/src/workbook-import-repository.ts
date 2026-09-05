import type {
  UserId,
  WorkbookImportIssue,
  WorkbookImportPreview,
} from '@fieldrep/domain'

import type { WorkspaceAtomicDataStore, WorkspaceWriteCommand } from './contracts'

export interface PersistWorkbookImportPreviewInput {
  importId: string
  createdByUserId: UserId
  preview: WorkbookImportPreview
  rawObjectKey?: string
}

export interface PersistedWorkbookImportPreview {
  importId: string
  sourceSha256: string
  rowCount: number
  warnings: number
  errors: number
  canApply: boolean
}

export class WorkspaceWorkbookImportRepository {
  constructor(
    private readonly store: WorkspaceAtomicDataStore,
    private readonly now: () => number = Date.now,
  ) {}

  async findImportIdByFingerprint(sourceSha256: string): Promise<string | null> {
    const row = await this.store.queryFirst<{ id: string }>(
      `SELECT id
       FROM workbook_imports
       WHERE workspace_id = ? AND source_sha256 = ?
       LIMIT 1`,
      [this.store.workspaceId, sourceSha256],
    )
    return row?.id ?? null
  }

  async persistPreview(input: PersistWorkbookImportPreviewInput): Promise<PersistedWorkbookImportPreview> {
    const existing = await this.findImportIdByFingerprint(input.preview.sourceSha256)
    if (existing !== null) throw new Error(`workbook_import_duplicate:${existing}`)

    const now = this.now()
    const commands: WorkspaceWriteCommand[] = [
      {
        query: `INSERT INTO workbook_imports (
          id, workspace_id, created_by_user_id, source_name, source_sha256,
          parser_version, raw_object_key, status, summary_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'previewed', ?, ?, ?)`,
        values: [
          input.importId,
          this.store.workspaceId,
          input.createdByUserId,
          input.preview.sourceName,
          input.preview.sourceSha256,
          input.preview.parserVersion,
          input.rawObjectKey ?? null,
          JSON.stringify(input.preview.summary),
          now,
          now,
        ],
      },
      ...previewRows(input.importId, this.store.workspaceId, input.preview, now),
    ]

    const results = await this.store.executeBatch(commands)
    if (results.length !== commands.length || results.some((result) => !result.success)) {
      throw new Error('workbook_import_preview_persist_failed')
    }

    return {
      importId: input.importId,
      sourceSha256: input.preview.sourceSha256,
      rowCount: commands.length - 1,
      warnings: input.preview.summary.warnings,
      errors: input.preview.summary.errors,
      canApply: input.preview.summary.canApply,
    }
  }
}

function previewRows(
  importId: string,
  workspaceId: string,
  preview: WorkbookImportPreview,
  now: number,
): WorkspaceWriteCommand[] {
  const commands: WorkspaceWriteCommand[] = []

  const add = (
    rowKey: string,
    sheetName: string,
    rowNumber: number,
    entityKind: 'route' | 'customer' | 'location' | 'product' | 'plan' | 'visit' | 'metadata',
    naturalKey: string | null,
    payload: unknown,
    issues: readonly WorkbookImportIssue[] = [],
  ) => {
    commands.push({
      query: `INSERT INTO workbook_import_rows (
        import_id, workspace_id, row_key, sheet_name, row_number,
        entity_kind, action, natural_key, payload_json, issues_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      values: [
        importId,
        workspaceId,
        rowKey,
        sheetName,
        rowNumber,
        entityKind,
        issues.some((issue) => issue.severity === 'error')
          ? 'error'
          : issues.length > 0
            ? 'warning'
            : 'create',
        naturalKey,
        JSON.stringify(payload),
        JSON.stringify(issues),
        now,
      ],
    })
  }

  for (const route of preview.routes) {
    add(`route:${route.naturalKey}`, 'Physision', 1, 'route', route.naturalKey, route)
  }
  for (const customer of preview.customers) {
    const issues = preview.issues.filter(
      (issue) => issue.sheetName === 'Physision' && issue.rowNumber === customer.sourceRow,
    )
    add(`customer:${customer.sourceRow}`, 'Physision', customer.sourceRow, 'customer', customer.naturalKey, customer, issues)
    if (customer.address !== null) {
      add(`location:${customer.sourceRow}`, 'Physision', customer.sourceRow, 'location', customer.naturalKey, {
        customerNaturalKey: customer.naturalKey,
        address: customer.address,
        label: 'Primary',
      })
    }
  }
  for (const product of preview.products) {
    add(`product:${product.naturalKey}`, 'Physision', 1, 'product', product.naturalKey, product)
  }
  for (const visit of preview.visits) {
    const issues = preview.issues.filter(
      (issue) => issue.sheetName === 'Report' && issue.rowNumber === visit.sourceRow,
    )
    add(`visit:${visit.sourceRow}`, 'Report', visit.sourceRow, 'visit', visit.naturalKey, visit, issues)
  }
  for (const plan of preview.plans) {
    const issues = preview.issues.filter(
      (issue) => issue.sheetName === 'Calendar' && issue.rowNumber === plan.sourceRow,
    )
    add(`plan:${plan.sourceRow}`, 'Calendar', plan.sourceRow, 'plan', plan.naturalKey, plan, issues)
  }

  const orphanIssues = preview.issues.filter((issue) => {
    if (issue.sheetName === 'Physision') return !preview.customers.some((customer) => customer.sourceRow === issue.rowNumber)
    if (issue.sheetName === 'Report') return !preview.visits.some((visit) => visit.sourceRow === issue.rowNumber)
    if (issue.sheetName === 'Calendar') return !preview.plans.some((plan) => plan.sourceRow === issue.rowNumber)
    return true
  })
  orphanIssues.forEach((issue, index) => {
    add(`issue:${issue.sheetName}:${issue.rowNumber}:${index}`, issue.sheetName, issue.rowNumber, 'metadata', null, {}, [issue])
  })

  return commands
}

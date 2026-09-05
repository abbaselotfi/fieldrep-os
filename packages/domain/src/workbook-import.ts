export type WorkbookImportSeverity = 'warning' | 'error'

export type WorkbookImportIssueCode =
  | 'missing_name'
  | 'invalid_frequency'
  | 'invalid_class'
  | 'missing_route'
  | 'duplicate_physician_row'
  | 'invalid_report_date'
  | 'unknown_report_customer'
  | 'visited_report_mismatch'
  | 'achievement_recomputed'
  | 'product_counter_untraceable'

export interface WorkbookImportIssue {
  code: WorkbookImportIssueCode
  severity: WorkbookImportSeverity
  sheetName: string
  rowNumber: number
  field?: string
  message: string
}

export interface WorkbookPhysicianRow {
  rowNumber: number
  name: string
  specialty?: string
  classKey?: string
  route?: string
  address?: string
  frequency?: number
  visited?: number
  achievementPercent?: number
  productCounters?: Readonly<Record<string, number>>
}

export interface WorkbookReportRow {
  rowNumber: number
  visitDate: string
  customerName: string
  productNames: readonly string[]
  reportText?: string
}

export interface WorkbookPlanRow {
  rowNumber: number
  sourceCell?: string
  planDate: string
  customerName: string
  route?: string
  productNames?: readonly string[]
}

export interface WorkbookExtractedSnapshot {
  sourceName: string
  sourceSha256: string
  parserVersion: string
  physicianRows: readonly WorkbookPhysicianRow[]
  reportRows: readonly WorkbookReportRow[]
  planRows: readonly WorkbookPlanRow[]
}

export interface WorkbookNormalizedRoute {
  naturalKey: string
  name: string
}

export interface WorkbookNormalizedCustomer {
  naturalKey: string
  displayName: string
  specialty: string | null
  classKey: string | null
  requiredFrequency: number
  routeNaturalKey: string | null
  address: string | null
  sourceRow: number
}

export interface WorkbookNormalizedProduct {
  naturalKey: string
  name: string
}

export interface WorkbookNormalizedVisit {
  naturalKey: string
  visitDate: string
  customerNaturalKey: string
  productNaturalKeys: string[]
  reportText: string | null
  sourceRow: number
}

export interface WorkbookNormalizedPlan {
  naturalKey: string
  planDate: string
  customerNaturalKey: string
  routeNaturalKey: string | null
  productNaturalKeys: string[]
  sourceRow: number
  sourceCell: string | null
}

export interface WorkbookImportPreview {
  sourceName: string
  sourceSha256: string
  parserVersion: string
  routes: WorkbookNormalizedRoute[]
  customers: WorkbookNormalizedCustomer[]
  products: WorkbookNormalizedProduct[]
  visits: WorkbookNormalizedVisit[]
  plans: WorkbookNormalizedPlan[]
  issues: WorkbookImportIssue[]
  summary: {
    routes: number
    customers: number
    products: number
    visits: number
    plans: number
    warnings: number
    errors: number
    canApply: boolean
  }
}

export function previewWorkbookImport(snapshot: WorkbookExtractedSnapshot): WorkbookImportPreview {
  assertSha256(snapshot.sourceSha256)
  const issues: WorkbookImportIssue[] = []
  const routes = new Map<string, WorkbookNormalizedRoute>()
  const customers = new Map<string, WorkbookNormalizedCustomer>()
  const products = new Map<string, WorkbookNormalizedProduct>()

  for (const row of snapshot.physicianRows) {
    const name = normalizeText(row.name)
    if (name === '') {
      issues.push(issue('missing_name', 'error', 'Physision', row.rowNumber, 'name', 'Physician name is required.'))
      continue
    }

    const customerNaturalKey = naturalKey(name)
    if (customers.has(customerNaturalKey)) {
      issues.push(issue('duplicate_physician_row', 'warning', 'Physision', row.rowNumber, 'name', `Duplicate physician row for ${name}; first row wins.`))
      continue
    }

    const frequency = row.frequency ?? 0
    if (!Number.isInteger(frequency) || frequency < 0) {
      issues.push(issue('invalid_frequency', 'error', 'Physision', row.rowNumber, 'frequency', 'Frequency must be a non-negative integer.'))
      continue
    }

    // Class is workspace-defined reference data, not a platform enum. The source workbook
    // legitimately contains values such as D/E and B/C (0.5), so import preserves any
    // non-empty class label instead of coercing it to A/B/C.
    const classKey = normalizeOptional(row.classKey)

    const routeName = normalizeOptional(row.route)
    const routeNaturalKey = routeName === null ? null : naturalKey(routeName)
    if (routeName === null) {
      issues.push(issue('missing_route', 'warning', 'Physision', row.rowNumber, 'route', 'No route found; customer can still be imported without a route.'))
    } else if (!routes.has(routeNaturalKey!)) {
      routes.set(routeNaturalKey!, { naturalKey: routeNaturalKey!, name: routeName })
    }

    customers.set(customerNaturalKey, {
      naturalKey: customerNaturalKey,
      displayName: name,
      specialty: normalizeOptional(row.specialty),
      classKey,
      requiredFrequency: frequency,
      routeNaturalKey,
      address: normalizeOptional(row.address),
      sourceRow: row.rowNumber,
    })

    for (const [productNameRaw, count] of Object.entries(row.productCounters ?? {})) {
      const productName = normalizeText(productNameRaw)
      if (productName === '') continue
      const productKey = naturalKey(productName)
      if (!products.has(productKey)) products.set(productKey, { naturalKey: productKey, name: productName })
      if (Number.isFinite(count) && count > 0) {
        issues.push(issue('product_counter_untraceable', 'warning', 'Physision', row.rowNumber, productName, `Workbook product counter (${count}) is retained only for reconciliation; actual visits are imported from Report rows, never fabricated from counters.`))
      }
    }
  }

  const visits: WorkbookNormalizedVisit[] = []
  const importedVisitCountByCustomer = new Map<string, number>()
  for (const row of snapshot.reportRows) {
    if (!isCanonicalDate(row.visitDate)) {
      issues.push(issue('invalid_report_date', 'error', 'Report', row.rowNumber, 'visitDate', `Invalid canonical report date: ${row.visitDate}`))
      continue
    }

    const customerName = normalizeText(row.customerName)
    const customerNaturalKey = naturalKey(customerName)
    if (!customers.has(customerNaturalKey)) {
      issues.push(issue('unknown_report_customer', 'error', 'Report', row.rowNumber, 'customerName', `Report customer is not present in Physision: ${customerName}`))
      continue
    }

    const productNaturalKeys = uniqueNormalized(row.productNames).map((name) => {
      const key = naturalKey(name)
      if (!products.has(key)) products.set(key, { naturalKey: key, name })
      return key
    })

    const visitKey = `report:${row.rowNumber}:${row.visitDate}:${customerNaturalKey}`
    visits.push({
      naturalKey: visitKey,
      visitDate: row.visitDate,
      customerNaturalKey,
      productNaturalKeys,
      reportText: normalizeOptional(row.reportText),
      sourceRow: row.rowNumber,
    })
    importedVisitCountByCustomer.set(customerNaturalKey, (importedVisitCountByCustomer.get(customerNaturalKey) ?? 0) + 1)
  }

  for (const row of snapshot.physicianRows) {
    const name = normalizeText(row.name)
    if (name === '') continue
    const key = naturalKey(name)
    const customer = customers.get(key)
    if (customer === undefined) continue
    if (row.visited !== undefined && Number.isFinite(row.visited)) {
      const importedVisits = importedVisitCountByCustomer.get(key) ?? 0
      if (row.visited !== importedVisits) {
        issues.push(issue('visited_report_mismatch', 'warning', 'Physision', row.rowNumber, 'visited', `Workbook Visited=${row.visited}, but ${importedVisits} traceable completed Report row(s) were found. FieldRep OS will derive Visited from imported Actual Visits.`))
      }
    }
    if (row.achievementPercent !== undefined) {
      issues.push(issue('achievement_recomputed', 'warning', 'Physision', row.rowNumber, 'achievementPercent', 'Workbook Achievement is not imported as authoritative data; FieldRep OS recalculates it from Actual Visits / Frequency.'))
    }
  }

  const plans: WorkbookNormalizedPlan[] = []
  for (const row of snapshot.planRows) {
    if (!isCanonicalDate(row.planDate)) {
      issues.push(issue('invalid_report_date', 'error', 'Calendar', row.rowNumber, 'planDate', `Invalid canonical plan date: ${row.planDate}`))
      continue
    }
    const customerName = normalizeText(row.customerName)
    const customerNaturalKey = naturalKey(customerName)
    if (!customers.has(customerNaturalKey)) {
      issues.push(issue('unknown_report_customer', 'error', 'Calendar', row.rowNumber, 'customerName', `Plan customer is not present in Physision: ${customerName}`))
      continue
    }
    const routeName = normalizeOptional(row.route)
    const routeNaturalKey = routeName === null ? null : naturalKey(routeName)
    if (routeName !== null && !routes.has(routeNaturalKey!)) {
      routes.set(routeNaturalKey!, { naturalKey: routeNaturalKey!, name: routeName })
    }
    const productNaturalKeys = uniqueNormalized(row.productNames ?? []).map((name) => {
      const key = naturalKey(name)
      if (!products.has(key)) products.set(key, { naturalKey: key, name })
      return key
    })
    const sourceCoordinate = normalizeOptional(row.sourceCell)
    plans.push({
      naturalKey: `calendar:${sourceCoordinate ?? row.rowNumber}:${row.planDate}:${customerNaturalKey}`,
      planDate: row.planDate,
      customerNaturalKey,
      routeNaturalKey,
      productNaturalKeys,
      sourceRow: row.rowNumber,
      sourceCell: sourceCoordinate,
    })
  }

  const warnings = issues.filter((item) => item.severity === 'warning').length
  const errors = issues.filter((item) => item.severity === 'error').length

  return {
    sourceName: snapshot.sourceName,
    sourceSha256: snapshot.sourceSha256,
    parserVersion: snapshot.parserVersion,
    routes: [...routes.values()].sort((a, b) => a.name.localeCompare(b.name)),
    customers: [...customers.values()].sort((a, b) => a.displayName.localeCompare(b.displayName)),
    products: [...products.values()].sort((a, b) => a.name.localeCompare(b.name)),
    visits,
    plans,
    issues,
    summary: {
      routes: routes.size,
      customers: customers.size,
      products: products.size,
      visits: visits.length,
      plans: plans.length,
      warnings,
      errors,
      canApply: errors === 0,
    },
  }
}

function issue(code: WorkbookImportIssueCode, severity: WorkbookImportSeverity, sheetName: string, rowNumber: number, field: string, message: string): WorkbookImportIssue {
  return { code, severity, sheetName, rowNumber, field, message }
}

function normalizeText(value: string | undefined): string {
  return normalizePersian(value ?? '').trim().replace(/\s+/gu, ' ')
}

function normalizeOptional(value: string | undefined): string | null {
  const normalized = normalizeText(value)
  return normalized === '' ? null : normalized
}

function naturalKey(value: string): string {
  return normalizeText(value).toLocaleLowerCase('fa-IR')
}

function uniqueNormalized(values: readonly string[]): string[] {
  return [...new Set(values.map(normalizeText).filter((value) => value !== ''))]
}

function normalizePersian(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[يى]/gu, 'ی')
    .replace(/ك/gu, 'ک')
    .replace(/[\u200c\u200d]/gu, ' ')
}

function isCanonicalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false
  const parsed = Date.parse(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed) && new Date(parsed).toISOString().slice(0, 10) === value
}

function assertSha256(value: string): void {
  if (!/^[0-9a-f]{64}$/u.test(value)) throw new RangeError('sourceSha256 must be lowercase SHA-256 hex')
}

import { jalaliDateToCanonical } from './planning-cycle'
import type {
  WorkbookExtractedSnapshot,
  WorkbookPhysicianRow,
  WorkbookReportRow,
} from './workbook-import'

export type LegacyCellValue = string | number | boolean | null

export interface LegacyExtractedRow {
  rowNumber: number
  cells: readonly LegacyCellValue[]
}

export interface LegacyWorkbookTabularSnapshot {
  sourceName: string
  sourceSha256: string
  parserVersion: string
  sheets: Readonly<Record<string, readonly LegacyExtractedRow[] | undefined>>
}

export interface LegacyWorkbookAdapterResult {
  snapshot: WorkbookExtractedSnapshot
  diagnostics: string[]
}

const PHYSICIAN_HEADERS = {
  name: ['name', 'physician', 'doctor', 'نام', 'نام پزشک', 'پزشک'],
  specialty: ['specialty', 'speciality', 'تخصص'],
  classKey: ['class', 'کلاس'],
  route: ['route', 'path', 'area', 'مسیر', 'منطقه'],
  address: ['address', 'آدرس', 'ادرس'],
  frequency: ['frequency', 'freq', 'فرکانس', 'تعداد ویزیت'],
  visited: ['visited', 'visit', 'ویزیت شده', 'تعداد ویزیت انجام شده'],
  achievement: ['achievement', 'ach%', 'achievement %', 'درصد تحقق', 'تحقق'],
} as const

const REPORT_HEADERS = {
  date: ['date', 'visit date', 'تاریخ', 'تاریخ ویزیت'],
  customer: ['name', 'doctor', 'physician', 'customer', 'نام پزشک', 'پزشک', 'مشتری'],
  product: ['product', 'products', 'drug', 'drugs', 'محصول', 'محصولات', 'دارو'],
  report: ['report', 'visit report', 'note', 'notes', 'گزارش', 'گزارش ویزیت', 'یادداشت'],
} as const

export function adaptLegacyWorkbookTabular(
  input: LegacyWorkbookTabularSnapshot,
): LegacyWorkbookAdapterResult {
  const diagnostics: string[] = []
  const physicianSheet = findSheet(input.sheets, ['Physision', 'Physician', 'Physicians'])
  const reportSheet = findSheet(input.sheets, ['Report', 'Reports'])

  if (physicianSheet === null) diagnostics.push('missing_sheet:Physision')
  if (reportSheet === null) diagnostics.push('missing_sheet:Report')

  const physicianRows = physicianSheet === null
    ? []
    : adaptPhysicianRows(physicianSheet.rows, diagnostics)
  const reportRows = reportSheet === null
    ? []
    : adaptReportRows(reportSheet.rows, diagnostics)

  if (findSheet(input.sheets, ['Calendar']) !== null) {
    diagnostics.push('calendar_present:plan_cell_mapping_requires_verified_workbook_layout')
  }

  return {
    snapshot: {
      sourceName: input.sourceName,
      sourceSha256: input.sourceSha256,
      parserVersion: input.parserVersion,
      physicianRows,
      reportRows,
      planRows: [],
    },
    diagnostics,
  }
}

function adaptPhysicianRows(rows: readonly LegacyExtractedRow[], diagnostics: string[]): WorkbookPhysicianRow[] {
  const header = locateHeader(rows, PHYSICIAN_HEADERS.name)
  if (header === null) {
    diagnostics.push('missing_header:Physision:name')
    return []
  }

  const indexes = {
    name: requiredHeaderIndex(header.cells, PHYSICIAN_HEADERS.name),
    specialty: optionalHeaderIndex(header.cells, PHYSICIAN_HEADERS.specialty),
    classKey: optionalHeaderIndex(header.cells, PHYSICIAN_HEADERS.classKey),
    route: optionalHeaderIndex(header.cells, PHYSICIAN_HEADERS.route),
    address: optionalHeaderIndex(header.cells, PHYSICIAN_HEADERS.address),
    frequency: optionalHeaderIndex(header.cells, PHYSICIAN_HEADERS.frequency),
    visited: optionalHeaderIndex(header.cells, PHYSICIAN_HEADERS.visited),
    achievement: optionalHeaderIndex(header.cells, PHYSICIAN_HEADERS.achievement),
  }

  const knownIndexes = new Set(Object.values(indexes).filter((value): value is number => value !== null))
  const productColumns = header.cells
    .map((cell, index) => ({ name: text(cell), index }))
    .filter(({ name, index }) => name !== '' && !knownIndexes.has(index) && looksLikeProductHeader(name))

  const result: WorkbookPhysicianRow[] = []
  for (const row of rows) {
    if (row.rowNumber <= header.rowNumber) continue
    const name = text(row.cells[indexes.name])
    if (name === '' && row.cells.every((cell) => text(cell) === '')) continue

    const item: WorkbookPhysicianRow = { rowNumber: row.rowNumber, name }
    setString(item, 'specialty', valueAt(row, indexes.specialty))
    setString(item, 'classKey', valueAt(row, indexes.classKey))
    setString(item, 'route', valueAt(row, indexes.route))
    setString(item, 'address', valueAt(row, indexes.address))
    setNumber(item, 'frequency', valueAt(row, indexes.frequency))
    setNumber(item, 'visited', valueAt(row, indexes.visited))
    const achievement = percentNumber(valueAt(row, indexes.achievement))
    if (achievement !== null) item.achievementPercent = achievement

    const productCounters: Record<string, number> = {}
    for (const product of productColumns) {
      const count = number(row.cells[product.index])
      if (count !== null) productCounters[product.name] = count
    }
    if (Object.keys(productCounters).length > 0) item.productCounters = productCounters
    result.push(item)
  }
  return result
}

function adaptReportRows(rows: readonly LegacyExtractedRow[], diagnostics: string[]): WorkbookReportRow[] {
  const header = locateHeader(rows, REPORT_HEADERS.date)
  if (header === null) {
    diagnostics.push('missing_header:Report:date')
    return []
  }

  const dateIndex = requiredHeaderIndex(header.cells, REPORT_HEADERS.date)
  const customerIndex = optionalHeaderIndex(header.cells, REPORT_HEADERS.customer)
  const productIndex = optionalHeaderIndex(header.cells, REPORT_HEADERS.product)
  const reportIndex = optionalHeaderIndex(header.cells, REPORT_HEADERS.report)
  if (customerIndex === null) {
    diagnostics.push('missing_header:Report:customer')
    return []
  }

  const result: WorkbookReportRow[] = []
  for (const row of rows) {
    if (row.rowNumber <= header.rowNumber) continue
    const customerName = text(row.cells[customerIndex])
    const rawDate = row.cells[dateIndex]
    if (customerName === '' && text(rawDate) === '') continue

    const visitDate = canonicalDate(rawDate)
    if (visitDate === null) {
      diagnostics.push(`unparsed_report_date:row=${row.rowNumber}:value=${text(rawDate)}`)
      result.push({ rowNumber: row.rowNumber, visitDate: text(rawDate), customerName, productNames: productNames(valueAt(row, productIndex)) })
      continue
    }

    const item: WorkbookReportRow = {
      rowNumber: row.rowNumber,
      visitDate,
      customerName,
      productNames: productNames(valueAt(row, productIndex)),
    }
    const reportText = text(valueAt(row, reportIndex))
    if (reportText !== '') item.reportText = reportText
    result.push(item)
  }
  return result
}

function findSheet(
  sheets: LegacyWorkbookTabularSnapshot['sheets'],
  aliases: readonly string[],
): { name: string; rows: readonly LegacyExtractedRow[] } | null {
  const normalizedAliases = new Set(aliases.map(normalizeHeader))
  for (const [name, rows] of Object.entries(sheets)) {
    if (rows !== undefined && normalizedAliases.has(normalizeHeader(name))) return { name, rows }
  }
  return null
}

function locateHeader(rows: readonly LegacyExtractedRow[], aliases: readonly string[]): LegacyExtractedRow | null {
  for (const row of rows.slice(0, 20)) {
    if (optionalHeaderIndex(row.cells, aliases) !== null) return row
  }
  return null
}

function requiredHeaderIndex(cells: readonly LegacyCellValue[], aliases: readonly string[]): number {
  const index = optionalHeaderIndex(cells, aliases)
  if (index === null) throw new Error(`required header not found: ${aliases[0]}`)
  return index
}

function optionalHeaderIndex(cells: readonly LegacyCellValue[], aliases: readonly string[]): number | null {
  const normalizedAliases = new Set(aliases.map(normalizeHeader))
  const index = cells.findIndex((cell) => normalizedAliases.has(normalizeHeader(text(cell))))
  return index < 0 ? null : index
}

function valueAt(row: LegacyExtractedRow, index: number | null): LegacyCellValue {
  return index === null ? null : (row.cells[index] ?? null)
}

function normalizeHeader(value: string): string {
  return value.trim().toLocaleLowerCase('fa-IR').replace(/[\s_\-]+/gu, ' ')
}

function text(value: LegacyCellValue | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value).trim().replace(/\s+/gu, ' ')
}

function number(value: LegacyCellValue | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const normalized = text(value).replace(/[٪%]/gu, '').replace(/,/gu, '')
  if (normalized === '') return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function percentNumber(value: LegacyCellValue): number | null {
  const parsed = number(value)
  if (parsed === null) return null
  return parsed >= 0 && parsed <= 1 ? parsed * 100 : parsed
}

function canonicalDate(value: LegacyCellValue | undefined): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const excelEpoch = Date.UTC(1899, 11, 30)
    return new Date(excelEpoch + Math.floor(value) * 86_400_000).toISOString().slice(0, 10)
  }

  const raw = text(value)
  if (/^\d{4}-\d{2}-\d{2}$/u.test(raw)) {
    const parsed = Date.parse(`${raw}T00:00:00.000Z`)
    if (!Number.isNaN(parsed) && new Date(parsed).toISOString().slice(0, 10) === raw) return raw
  }

  const jalali = raw.match(/^(1[34]\d{2})[\/-](0?[1-9]|1[0-2])[\/-](0?[1-9]|[12]\d|3[01])$/u)
  if (jalali) {
    try {
      return jalaliDateToCanonical({ year: Number(jalali[1]), month: Number(jalali[2]), day: Number(jalali[3]) })
    } catch {
      return null
    }
  }
  return null
}

function productNames(value: LegacyCellValue): string[] {
  return [...new Set(text(value).split(/[،,;/|]+/u).map((item) => item.trim()).filter(Boolean))]
}

function looksLikeProductHeader(value: string): boolean {
  const normalized = normalizeHeader(value)
  if (/^(drug|product)\s*\d+$/u.test(normalized)) return true
  return ['toujeo', 'lantus', 'soliqua'].includes(normalized)
}

function setString<K extends 'specialty' | 'classKey' | 'route' | 'address'>(
  target: WorkbookPhysicianRow,
  key: K,
  value: LegacyCellValue,
): void {
  const normalized = text(value)
  if (normalized !== '') target[key] = normalized
}

function setNumber<K extends 'frequency' | 'visited'>(
  target: WorkbookPhysicianRow,
  key: K,
  value: LegacyCellValue,
): void {
  const normalized = number(value)
  if (normalized !== null) target[key] = normalized
}

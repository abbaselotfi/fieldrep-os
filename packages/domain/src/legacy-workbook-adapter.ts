import { jalaliDateToCanonical } from './planning-cycle'
import type {
  WorkbookExtractedSnapshot,
  WorkbookPhysicianRow,
  WorkbookPlanRow,
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
  legacyAlias: ['column1', 'combined name', 'name class', 'نام و کلاس', 'نام پزشک و کلاس'],
  name: ['name', 'physician', 'doctor', 'نام', 'نام پزشک', 'پزشک'],
  specialty: ['specialty', 'speciality', 'تخصص'],
  classKey: ['class', 'کلاس'],
  route: ['route', 'path', 'area', 'مسیر', 'منطقه'],
  address: ['address', 'آدرس', 'ادرس'],
  frequency: ['frequency', 'freq', 'فرکانس', 'تعداد ویزیت'],
  visited: ['visited', 'visit', 'ویزیت شده', 'تعداد ویزیت انجام شده'],
  achievement: [
    'achievement',
    'achivment',
    'ach%',
    'achievement %',
    '% achievement',
    '% achivment',
    'درصد تحقق',
    'تحقق',
  ],
} as const

const REPORT_HEADERS = {
  date: ['date', 'visit date', 'تاریخ', 'تاریخ ویزیت'],
  customer: ['name', 'doctor', 'physician', 'customer', 'نام پزشک', 'پزشک', 'مشتری'],
  product: ['product', 'products', 'drug', 'drugs', 'محصول', 'محصولات', 'دارو'],
  report: ['report', 'visit report', 'note', 'notes', 'گزارش', 'گزارش ویزیت', 'یادداشت'],
} as const

const WEEKDAY_HEADERS = [
  'شنبه',
  'یکشنبه',
  'دوشنبه',
  'سه شنبه',
  'چهارشنبه',
  'پنج شنبه',
  'جمعه',
] as const

const DAY_COLUMN_PAIRS = [
  [0, 1],
  [2, 3],
  [4, 5],
  [6, 7],
  [8, 9],
  [10, 11],
  [12, 13],
] as const

const LEGACY_DOCTOR_ROWS_PER_SESSION = 7

export function adaptLegacyWorkbookTabular(
  input: LegacyWorkbookTabularSnapshot,
): LegacyWorkbookAdapterResult {
  const diagnostics: string[] = []
  const physicianSheet = findSheet(input.sheets, ['Physision', 'Physician', 'Physicians'])
  const reportSheet = findSheet(input.sheets, ['Report', 'Reports'])
  const calendarSheet = findSheet(input.sheets, ['Calendar'])

  if (physicianSheet === null) diagnostics.push('missing_sheet:Physision')
  if (reportSheet === null) diagnostics.push('missing_sheet:Report')
  if (calendarSheet === null) diagnostics.push('missing_sheet:Calendar')

  const physicianRows =
    physicianSheet === null ? [] : adaptPhysicianRows(physicianSheet.rows, diagnostics)
  const customerNames = new Set(
    physicianRows
      .flatMap((row) => [row.name, ...(row.legacyAliases ?? [])])
      .map(comparable),
  )
  const routeNames = new Set(
    physicianRows
      .map((row) => row.route)
      .filter((route): route is string => route !== undefined)
      .map(comparable),
  )
  const reportRows =
    reportSheet === null
      ? []
      : adaptReportRows(reportSheet.rows, diagnostics, customerNames, routeNames)
  const planRows =
    calendarSheet === null ? [] : adaptCalendarRows(calendarSheet.rows, diagnostics)

  return {
    snapshot: {
      sourceName: input.sourceName,
      sourceSha256: input.sourceSha256,
      parserVersion: input.parserVersion,
      physicianRows,
      reportRows,
      planRows,
    },
    diagnostics,
  }
}

function adaptPhysicianRows(
  rows: readonly LegacyExtractedRow[],
  diagnostics: string[],
): WorkbookPhysicianRow[] {
  const header = locateHeader(rows, PHYSICIAN_HEADERS.name)
  if (header === null) {
    diagnostics.push('missing_header:Physision:name')
    return []
  }

  const indexes = {
    legacyAlias: optionalHeaderIndex(header.cells, PHYSICIAN_HEADERS.legacyAlias),
    name: requiredHeaderIndex(header.cells, PHYSICIAN_HEADERS.name),
    specialty: optionalHeaderIndex(header.cells, PHYSICIAN_HEADERS.specialty),
    classKey: optionalHeaderIndex(header.cells, PHYSICIAN_HEADERS.classKey),
    route: optionalHeaderIndex(header.cells, PHYSICIAN_HEADERS.route),
    address: optionalHeaderIndex(header.cells, PHYSICIAN_HEADERS.address),
    frequency: optionalHeaderIndex(header.cells, PHYSICIAN_HEADERS.frequency),
    visited: optionalHeaderIndex(header.cells, PHYSICIAN_HEADERS.visited),
    achievement: optionalHeaderIndex(header.cells, PHYSICIAN_HEADERS.achievement),
  }

  const knownIndexes = new Set(
    Object.values(indexes).filter((value): value is number => value !== null),
  )
  const productColumns = header.cells
    .map((cell, index) => ({ name: text(cell), index }))
    .filter(
      ({ name, index }) =>
        name !== '' && !knownIndexes.has(index) && looksLikeProductHeader(name),
    )

  const result: WorkbookPhysicianRow[] = []
  for (const row of rows) {
    if (row.rowNumber <= header.rowNumber) continue
    const name = text(row.cells[indexes.name])
    if (name === '' && row.cells.every((cell) => text(cell) === '')) continue

    const item: WorkbookPhysicianRow = { rowNumber: row.rowNumber, name }
    const legacyAlias = text(valueAt(row, indexes.legacyAlias))
    if (legacyAlias !== '' && comparable(legacyAlias) !== comparable(name)) {
      item.legacyAliases = [legacyAlias]
    }
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

    if (isLegacyHolidaySentinel(item)) {
      diagnostics.push(`holiday_sentinel_physician_skipped:row=${row.rowNumber}`)
      continue
    }

    result.push(item)
  }
  return result
}

function adaptReportRows(
  rows: readonly LegacyExtractedRow[],
  diagnostics: string[],
  customerNames: ReadonlySet<string>,
  routeNames: ReadonlySet<string>,
): WorkbookReportRow[] {
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
  let activeVisitDate: string | null = null

  for (const row of rows) {
    if (row.rowNumber <= header.rowNumber) continue

    const rawDate = valueAt(row, dateIndex)
    if (text(rawDate) !== '') {
      activeVisitDate = canonicalDate(rawDate)
      if (activeVisitDate === null) {
        diagnostics.push(`unparsed_report_date:row=${row.rowNumber}:value=${text(rawDate)}`)
      }
    }

    const customerName = text(row.cells[customerIndex])
    if (customerName === '') continue

    const comparableCustomer = comparable(customerName)
    if (routeNames.has(comparableCustomer) || comparableCustomer === comparable('تعطیل')) {
      diagnostics.push(
        `report_route_marker_skipped:row=${row.rowNumber}:value=${customerName}`,
      )
      continue
    }
    if (isHolidaySentinelName(customerName)) {
      diagnostics.push(`report_holiday_sentinel_skipped:row=${row.rowNumber}`)
      continue
    }

    if (activeVisitDate === null) {
      diagnostics.push(`report_row_without_date:row=${row.rowNumber}`)
      result.push({
        rowNumber: row.rowNumber,
        visitDate: '',
        customerName,
        productNames: productNames(valueAt(row, productIndex)),
      })
      continue
    }

    if (!customerNames.has(comparableCustomer)) {
      diagnostics.push(`report_unknown_customer:row=${row.rowNumber}:value=${customerName}`)
    }

    const item: WorkbookReportRow = {
      rowNumber: row.rowNumber,
      visitDate: activeVisitDate,
      customerName,
      productNames: productNames(valueAt(row, productIndex)),
    }
    const reportText = text(valueAt(row, reportIndex))
    if (reportText !== '') item.reportText = reportText
    result.push(item)
  }
  return result
}

function adaptCalendarRows(
  rows: readonly LegacyExtractedRow[],
  diagnostics: string[],
): WorkbookPlanRow[] {
  const byNumber = new Map(rows.map((row) => [row.rowNumber, row]))
  const result: WorkbookPlanRow[] = []
  let verifiedWeekBlocks = 0

  for (const headerRow of rows) {
    if (!isWeekdayHeaderRow(headerRow)) continue

    const dateRow = byNumber.get(headerRow.rowNumber + 1)
    if (dateRow === undefined || !containsJalaliDate(dateRow)) continue

    verifiedWeekBlocks += 1
    const routeRow = byNumber.get(headerRow.rowNumber + 2)
    const countRow = byNumber.get(headerRow.rowNumber + 10)

    for (const [leftColumn, rightColumn] of DAY_COLUMN_PAIRS) {
      const rawDate = dateRow.cells[leftColumn] ?? dateRow.cells[rightColumn]
      if (text(rawDate) === '') continue
      const planDate = canonicalDate(rawDate)
      if (planDate === null) {
        diagnostics.push(
          `unparsed_calendar_date:row=${dateRow.rowNumber}:value=${text(rawDate)}`,
        )
        continue
      }

      let observedWorkbookDayCount = 0
      for (const columnIndex of [leftColumn, rightColumn]) {
        const route = routeRow === undefined ? '' : text(routeRow.cells[columnIndex])

        for (let offset = 1; offset <= LEGACY_DOCTOR_ROWS_PER_SESSION; offset += 1) {
          const doctorRow = byNumber.get(headerRow.rowNumber + 2 + offset)
          if (doctorRow === undefined) continue
          const customerName = text(doctorRow.cells[columnIndex])
          if (customerName === '') continue
          observedWorkbookDayCount += 1

          if (isHolidaySentinelName(customerName)) {
            diagnostics.push(
              `calendar_holiday_sentinel_skipped:cell=${columnName(columnIndex)}${doctorRow.rowNumber}`,
            )
            continue
          }

          const item: WorkbookPlanRow = {
            rowNumber: doctorRow.rowNumber,
            sourceCell: `${columnName(columnIndex)}${doctorRow.rowNumber}`,
            planDate,
            customerName,
          }
          if (route !== '' && comparable(route) !== comparable('تعطیل')) item.route = route
          result.push(item)
        }
      }

      const expectedCount = countRow === undefined ? null : number(countRow.cells[leftColumn])
      if (expectedCount !== null && expectedCount !== observedWorkbookDayCount) {
        diagnostics.push(
          `calendar_daily_count_mismatch:date=${planDate}:expected=${expectedCount}:observed=${observedWorkbookDayCount}`,
        )
      }
    }
  }

  if (verifiedWeekBlocks === 0) {
    diagnostics.push('calendar_layout_unrecognized')
  } else {
    diagnostics.push(`calendar_layout_verified:week_blocks=${verifiedWeekBlocks}`)
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

function locateHeader(
  rows: readonly LegacyExtractedRow[],
  aliases: readonly string[],
): LegacyExtractedRow | null {
  for (const row of rows.slice(0, 20)) {
    if (optionalHeaderIndex(row.cells, aliases) !== null) return row
  }
  return null
}

function requiredHeaderIndex(
  cells: readonly LegacyCellValue[],
  aliases: readonly string[],
): number {
  const index = optionalHeaderIndex(cells, aliases)
  if (index === null) throw new Error(`required header not found: ${aliases[0]}`)
  return index
}

function optionalHeaderIndex(
  cells: readonly LegacyCellValue[],
  aliases: readonly string[],
): number | null {
  const normalizedAliases = new Set(aliases.map(normalizeHeader))
  const index = cells.findIndex((cell) => normalizedAliases.has(normalizeHeader(text(cell))))
  return index < 0 ? null : index
}

function valueAt(row: LegacyExtractedRow, index: number | null): LegacyCellValue {
  return index === null ? null : (row.cells[index] ?? null)
}

function normalizeHeader(value: string): string {
  return comparable(value).replace(/[\s_\-]+/gu, ' ')
}

function comparable(value: string): string {
  return normalizePersian(value).toLocaleLowerCase('fa-IR').replace(/\s+/gu, ' ').trim()
}

function normalizePersian(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[يى]/gu, 'ی')
    .replace(/ك/gu, 'ک')
    .replace(/[\u200c\u200d]/gu, ' ')
}

function text(value: LegacyCellValue | undefined): string {
  if (value === null || value === undefined) return ''
  return normalizePersian(String(value)).trim().replace(/\s+/gu, ' ')
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

  const jalali = raw.match(
    /^(1[34]\d{2})[\/-](0?[1-9]|1[0-2])[\/-](0?[1-9]|[12]\d|3[01])$/u,
  )
  if (jalali) {
    try {
      return jalaliDateToCanonical({
        year: Number(jalali[1]),
        month: Number(jalali[2]),
        day: Number(jalali[3]),
      })
    } catch {
      return null
    }
  }
  return null
}

function productNames(value: LegacyCellValue): string[] {
  return [
    ...new Set(
      text(value)
        .split(/[،,;/|]+/u)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ]
}

function looksLikeProductHeader(value: string): boolean {
  const normalized = normalizeHeader(value)
  if (/^(drug|product)\s*\d+$/u.test(normalized)) return true
  return ['toujeo', 'lantus', 'soliqua'].includes(normalized)
}

function isLegacyHolidaySentinel(row: WorkbookPhysicianRow): boolean {
  return (
    isHolidaySentinelName(row.name) ||
    comparable(row.specialty ?? '') === comparable('تعطیل') ||
    comparable(row.route ?? '') === comparable('تعطیل')
  )
}

function isHolidaySentinelName(value: string): boolean {
  const normalized = comparable(value)
  return normalized === comparable('تعطیل x') || normalized === comparable('تعطیل')
}

function isWeekdayHeaderRow(row: LegacyExtractedRow): boolean {
  return DAY_COLUMN_PAIRS.every(([leftColumn], index) => {
    return comparable(text(row.cells[leftColumn])) === comparable(WEEKDAY_HEADERS[index]!)
  })
}

function containsJalaliDate(row: LegacyExtractedRow): boolean {
  return DAY_COLUMN_PAIRS.some(([leftColumn, rightColumn]) => {
    const value = text(row.cells[leftColumn] ?? row.cells[rightColumn])
    return /^1[34]\d{2}[\/-]\d{1,2}[\/-]\d{1,2}$/u.test(value)
  })
}

function columnName(index: number): string {
  let value = index + 1
  let result = ''
  while (value > 0) {
    value -= 1
    result = String.fromCharCode(65 + (value % 26)) + result
    value = Math.floor(value / 26)
  }
  return result
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

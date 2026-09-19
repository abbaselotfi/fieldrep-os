import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * Release-readiness gate (P12-A4).
 *
 * Fails closed: every REQUIRED evidence item must be present and pass. A
 * missing item is reported as missing evidence (never silently skipped), and
 * the process exits non-zero when the verdict is blocked — so a release
 * cannot be cut on partial evidence.
 */

const root = resolve(import.meta.dirname, '..')

const checks = []

function record(id, required, status, detail = null) {
  checks.push({ id, required, status, detail })
}

function check(id, required, fn) {
  try {
    const result = fn()
    record(id, required, result.status ?? 'passed', result.detail ?? null)
  } catch (error) {
    record(id, required, 'failed', error instanceof Error ? error.message : String(error))
  }
}

function requireFile(relativePath) {
  const absolute = join(root, relativePath)
  if (!existsSync(absolute)) throw new Error(`missing evidence file: ${relativePath}`)
  if (statSync(absolute).size === 0) throw new Error(`empty evidence file: ${relativePath}`)
  return { status: 'passed', detail: relativePath }
}

function migrationCount(directory) {
  const absolute = join(root, 'migrations', directory)
  if (!existsSync(absolute)) throw new Error(`missing migrations directory: ${directory}`)
  const files = readdirSync(absolute).filter((name) => /^\d+.*\.sql$/u.test(name))
  if (files.length === 0) throw new Error(`no migrations found for ${directory}`)
  return files.length
}

function walk(directory, extensions) {
  const out = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const absolute = join(directory, entry.name)
    if (entry.isDirectory()) out.push(...walk(absolute, extensions))
    else if (extensions.some((ext) => entry.name.endsWith(ext))) out.push(absolute)
  }
  return out
}

// --- Required gates -------------------------------------------------------

check('migration_validator', true, () => {
  execFileSync(process.execPath, [join(root, 'scripts', 'validate-migrations.mjs')], {
    stdio: 'pipe',
    cwd: root,
  })
  return {
    status: 'passed',
    detail: `control ${migrationCount('control')} + workspace ${migrationCount('workspace')}`,
  }
})

check('no_focused_tests', true, () => {
  const files = [
    ...walk(join(root, 'apps'), ['.ts']),
    ...walk(join(root, 'packages'), ['.ts']),
  ]
  const focused = files.filter((file) => /\.(only|skip)\(/u.test(readFileSync(file, 'utf8')))
  if (focused.length > 0) {
    throw new Error(`focused/skipped tests would shrink the suite: ${focused.length} file(s)`)
  }
  return { status: 'passed', detail: `${files.length} test/source files scanned` }
})

check('roadmap_p12_complete', true, () => {
  const roadmap = readFileSync(join(root, 'docs', 'ROADMAP.md'), 'utf8')
  const pending = roadmap.match(/\| P1[12]-A\d \|[^|]*\| PENDING \|/gu)
  if (pending !== null && pending.length > 0) {
    throw new Error(`${pending.length} P11/P12 step(s) still PENDING`)
  }
  if (!roadmap.includes('**P11 status:** COMPLETE')) {
    throw new Error('ROADMAP does not record P11 as COMPLETE')
  }
  return { status: 'passed', detail: 'no P11/P12 step left pending' }
})

check('release_runbook', true, () => requireFile('docs/RELEASE-RUNBOOK.md'))
check('performance_budgets', true, () => requireFile('docs/PERFORMANCE-BUDGETS.md'))
check('security_threat_model', true, () => requireFile('docs/SECURITY-THREAT-MODEL.md'))
check('data_model', true, () => requireFile('docs/DATA-MODEL.md'))

// Optional (informational) evidence — a skipped optional never blocks.
check('accessibility_notes', false, () => {
  const candidate = 'docs/ACCESSIBILITY.md'
  return existsSync(join(root, candidate))
    ? { status: 'passed', detail: candidate }
    : { status: 'skipped', detail: 'no accessibility notes yet' }
})

// --- Fail-closed verdict --------------------------------------------------

const blockers = checks.filter((c) => c.required && c.status === 'failed')
const missingEvidence = checks.filter((c) => c.required && c.status === 'skipped')
const passed = checks.filter((c) => c.status === 'passed').length

for (const item of checks) {
  const mark = item.status === 'passed' ? '✓' : item.status === 'skipped' ? '·' : '✗'
  const suffix = item.detail === null ? '' : ` — ${item.detail}`
  console.log(`${mark} ${item.id} [${item.required ? 'required' : 'optional'}]${suffix}`)
}

console.log(
  `\nrelease readiness: ${blockers.length === 0 && missingEvidence.length === 0 ? 'READY' : 'BLOCKED'} (${passed}/${checks.length} checks passed)`,
)

if (blockers.length > 0) console.error(`blockers: ${blockers.map((c) => c.id).join(', ')}`)
if (missingEvidence.length > 0) {
  console.error(`missing evidence: ${missingEvidence.map((c) => c.id).join(', ')}`)
}

if (blockers.length > 0 || missingEvidence.length > 0) process.exitCode = 1
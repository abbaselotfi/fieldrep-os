import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * P4-A5 — offline test/security gate.
 *
 * OFFLINE-SYNC-SPEC §25 lists eight scenarios that MUST be proven before the
 * offline phase can close. This gate fails closed on two levels:
 *   1. static invariants — the security-relevant properties the scenarios rely
 *      on (idempotency ledger, tenant/user binding, fail-closed authorization,
 *      partition isolation, no implicit local wipe, conflict contract, engine
 *      outside the Service Worker);
 *   2. scenario coverage — every one of the eight scenarios must carry an
 *      explicit `P4-A5 scenario N` marker in the offline/sync suites, so a
 *      scenario can never be silently dropped.
 * Finally it runs the offline + sync suites.
 */

const root = resolve(import.meta.dirname, '..')
const failures = []
const notes = []

function read(relativePath) {
  const absolute = join(root, relativePath)
  if (!existsSync(absolute)) {
    throw new Error(`missing file: ${relativePath}`)
  }
  return readFileSync(absolute, 'utf8')
}

function invariant(id, relativePath, pattern, description) {
  const source = read(relativePath)
  if (!pattern.test(source)) {
    failures.push(`${id}: ${description} (expected ${pattern} in ${relativePath})`)
    return
  }
  notes.push(`✓ ${id} — ${description}`)
}

function invariantAbsent(id, relativePath, pattern, description) {
  const source = read(relativePath)
  if (pattern.test(source)) {
    failures.push(`${id}: ${description} (forbidden ${pattern} in ${relativePath})`)
    return
  }
  notes.push(`✓ ${id} — ${description}`)
}

// --- 1. Static security invariants ---------------------------------------

const syncApi = 'apps/worker/src/routes/sync-api.ts'
invariant('push_authorization', syncApi, /requireWorkspacePermission\('sync\.push\.own'\)/u, 'sync push requires sync.push.own')
invariant('pull_authorization', syncApi, /requireWorkspacePermission\('sync\.pull\.own'\)/u, 'sync pull requires sync.pull.own')
invariant(
  'tenant_binding',
  syncApi,
  /operation_binding_mismatch/u,
  'a replayed operationId claimed by another workspace/user is rejected (never answered from cache)',
)
invariant(
  'conflict_contract',
  syncApi,
  /result: 'conflict'/u,
  'conflicts are modeled as a first-class result, not blind last-write-wins',
)

const syncRepository = 'packages/database/src/sync-repository.ts'
invariant(
  'idempotency_ledger',
  syncRepository,
  /ON CONFLICT\(operation_id\) DO NOTHING/u,
  'the ledger refuses to overwrite an applied operation id',
)
invariant(
  'workspace_scoped_reads',
  syncRepository,
  /WHERE workspace_id = \? AND operation_id = \?/u,
  'ledger reads are workspace-scoped (tenant isolation)',
)
invariant(
  'user_scoped_listing',
  syncRepository,
  /WHERE workspace_id = \? AND user_id = \?/u,
  'ledger listing is user-scoped inside the workspace',
)

const localDb = 'apps/web/src/offline/local-db.ts'
invariant('partition_namespace', localDb, /LOCAL_STORE_VERSION/u, 'local storage is versioned per user+workspace+store version')
invariant(
  'no_implicit_wipe',
  localDb,
  /LocalSchemaMismatchError/u,
  'a local schema mismatch throws instead of clearing data',
)
invariantAbsent(
  'no_delete_object_store',
  localDb,
  /deleteObjectStore/u,
  'no routine IndexedDB store deletion (never "clear all" as upgrade technique)',
)

const syncService = 'apps/web/src/offline/sync-service.ts'
invariant('engine_outside_sw', syncService, /async pushPending\(/u, 'the sync engine runs in app code, not only in the Service Worker')
invariant(
  'conflict_resolutions',
  syncService,
  /'keep_server'/u,
  'the client exposes explicit conflict resolution options',
)

// --- 2. Scenario coverage map (SPEC §25) ---------------------------------

const SCENARIOS = [
  { n: 1, suite: 'apps/worker/src/routes/sync-api.test.ts', title: 'plan created offline → one server entry' },
  { n: 2, suite: 'apps/worker/src/routes/sync-api.test.ts', title: 'visit retried after lost response → one server visit' },
  { n: 3, suite: 'apps/web/src/offline/sync-service.test.ts', title: 'same plan edited on two clients → conflict' },
  { n: 4, suite: 'apps/web/src/offline/local-db.test.ts', title: 'logout isolation between user partitions' },
  { n: 5, suite: 'apps/worker/src/routes/sync-api.test.ts', title: 'authorization revoked/rejected → push refused' },
  { n: 6, suite: 'apps/web/src/offline/local-db.test.ts', title: 'PWA update with pending operations → work survives' },
  { n: 7, suite: 'apps/web/src/offline/sync-service.test.ts', title: 'offline location evidence keeps capture time' },
  { n: 8, suite: 'apps/worker/src/routes/sync-api.test.ts', title: 'derived totals reconcile with server visits' },
]

const suitesWithMarkers = [
  'apps/worker/src/routes/sync-api.test.ts',
  'apps/web/src/offline/sync-service.test.ts',
  'apps/web/src/offline/local-db.test.ts',
]
const markerSources = suitesWithMarkers.map((suite) => ({ suite, source: read(suite) }))

for (const scenario of SCENARIOS) {
  const marker = new RegExp(`P4-A5 scenario ${scenario.n}\\b`, 'u')
  const owners = markerSources.filter((entry) => marker.test(entry.source)).map((entry) => entry.suite)
  if (owners.length === 0) {
    failures.push(`scenario_${scenario.n}: no "P4-A5 scenario ${scenario.n}" marker found (${scenario.title})`)
    continue
  }
  if (!owners.includes(scenario.suite)) {
    failures.push(
      `scenario_${scenario.n}: expected the marker in ${scenario.suite}, found it in ${owners.join(', ')}`,
    )
    continue
  }
  const extra = owners.filter((suite) => suite !== scenario.suite)
  notes.push(
    `✓ scenario ${scenario.n} — ${scenario.title} (${scenario.suite}${extra.length === 0 ? '' : ` + ${extra.length} extra`})`,
  )
}

// --- 3. Run the offline + sync suites ------------------------------------

try {
  execFileSync(
    process.execPath,
    [
      join(root, 'node_modules', 'vitest', 'vitest.mjs'),
      'run',
      'apps/web/src/offline/local-db.test.ts',
      'apps/web/src/offline/sync-service.test.ts',
      'apps/web/src/offline/http-sync.test.ts',
      'apps/worker/src/routes/sync-api.test.ts',
      'packages/database/src/sync-repository.test.ts',
    ],
    { stdio: 'pipe', cwd: root },
  )
  notes.push('✓ offline + sync suites passed (5 files)')
} catch (error) {
  const stdout = error?.stdout?.toString?.() ?? ''
  const tail = stdout.split('\n').filter((line) => line.trim() !== '').slice(-6).join('\n')
  failures.push(`suites_failed: offline/sync suites failed\n${tail}`)
}

// --- Verdict -------------------------------------------------------------

for (const note of notes) console.log(note)
console.log(`\nP4-A5 offline gate: ${failures.length === 0 ? 'PASS' : 'FAIL'}`)
if (failures.length > 0) {
  for (const failure of failures) console.error(`✗ ${failure}`)
  process.exitCode = 1
}

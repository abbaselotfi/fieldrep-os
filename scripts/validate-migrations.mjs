import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const root = resolve(import.meta.dirname, '..')

function migrationFiles(directory) {
  return readdirSync(directory)
    .filter((name) => /^\d+.*\.sql$/u.test(name))
    .sort((left, right) => left.localeCompare(right))
}

function applyMigrations(name, requiredTables, verify) {
  const directory = join(root, 'migrations', name)
  const files = migrationFiles(directory)

  if (files.length === 0) {
    throw new Error(`No migrations found for ${name}`)
  }

  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON;')

  try {
    for (const file of files) {
      const sql = readFileSync(join(directory, file), 'utf8')
      db.exec(sql)
    }

    const tableRows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all()
    const tables = new Set(tableRows.map((row) => String(row.name)))

    for (const table of requiredTables) {
      if (!tables.has(table)) {
        throw new Error(`${name}: missing required table ${table}`)
      }
    }

    const foreignKeyProblems = db.prepare('PRAGMA foreign_key_check').all()
    if (foreignKeyProblems.length > 0) {
      throw new Error(`${name}: foreign_key_check failed: ${JSON.stringify(foreignKeyProblems)}`)
    }

    const integrity = db.prepare('PRAGMA integrity_check').get()
    if (integrity?.integrity_check !== 'ok') {
      throw new Error(`${name}: integrity_check failed: ${JSON.stringify(integrity)}`)
    }

    verify(db)
    console.log(`✓ ${name}: ${files.length} migration(s) validated`)
  } finally {
    db.close()
  }
}

function expectConstraint(fn, label) {
  let failed = false
  try {
    fn()
  } catch {
    failed = true
  }

  if (!failed) {
    throw new Error(`Expected constraint failure: ${label}`)
  }
}

applyMigrations(
  'control',
  [
    'user',
    'session',
    'account',
    'verification',
    'companies',
    'workspaces',
    'memberships',
    'roles',
    'permissions',
    'scope_grants',
    'feature_entitlements',
    'workspace_data_routes',
    'platform_audit_events',
  ],
  (db) => {
    const now = 1_780_000_000_000
    db.prepare(
      'INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('user-1', 'Test User', 'test@example.com', 1, now, now)
    db.prepare(
      'INSERT INTO companies (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ).run('company-a', 'Company A', 'company-a', now, now)
    db.prepare(
      'INSERT INTO companies (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ).run('company-b', 'Company B', 'company-b', now, now)
    db.prepare(
      'INSERT INTO workspaces (id, company_id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('workspace-a', 'company-a', 'Diabetes', 'diabetes', now, now)

    expectConstraint(
      () =>
        db
          .prepare(
            'INSERT INTO memberships (id, user_id, company_id, workspace_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          )
          .run('membership-bad', 'user-1', 'company-b', 'workspace-a', 'active', now, now),
      'membership cannot claim a workspace from another company',
    )
  },
)

applyMigrations(
  'workspace',
  [
    'workspace_identity',
    'workspace_settings',
    'workspace_member_refs',
    'organization_units',
    'organization_memberships',
    'workspace_audit_events',
  ],
  (db) => {
    const now = 1_780_000_000_000
    db.prepare(
      'INSERT INTO workspace_identity (singleton_key, workspace_id, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ).run('workspace', 'workspace-a', 1, now, now)

    expectConstraint(
      () =>
        db
          .prepare(
            'INSERT INTO workspace_identity (singleton_key, workspace_id, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
          )
          .run('workspace', 'workspace-b', 1, now, now),
      'workspace database must have exactly one identity row',
    )

    expectConstraint(
      () =>
        db
          .prepare(
            'INSERT INTO workspace_settings (workspace_id, setting_key, value_json, updated_at) VALUES (?, ?, ?, ?)',
          )
          .run('workspace-b', 'calendar', '{}', now),
      'workspace-local rows cannot use another workspace id',
    )
  },
)

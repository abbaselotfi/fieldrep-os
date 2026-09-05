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
    'routes',
    'customers',
    'customer_doctor_profiles',
    'customer_route_assignments',
    'customer_locations',
    'planning_cycles',
  ],
  (db) => {
    const now = 1_780_000_000_000
    db.prepare(
      'INSERT INTO workspace_identity (singleton_key, workspace_id, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ).run('workspace', 'workspace-a', 3, now, now)

    expectConstraint(
      () =>
        db
          .prepare(
            'INSERT INTO workspace_identity (singleton_key, workspace_id, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
          )
          .run('workspace', 'workspace-b', 3, now, now),
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

    db.prepare(
      'INSERT INTO routes (id, workspace_id, code, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('route-1', 'workspace-a', 'R8', 'Area 8', now, now)
    db.prepare(
      `INSERT INTO customers
        (id, workspace_id, customer_type, display_name, record_scope, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('doctor-1', 'workspace-a', 'doctor', 'Doctor One', 'workspace', 'company', now, now)
    db.prepare(
      `INSERT INTO customer_doctor_profiles
        (customer_id, workspace_id, specialty, class_key, required_frequency, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('doctor-1', 'workspace-a', 'Internal Medicine', 'A', 6, now)
    db.prepare(
      `INSERT INTO customer_route_assignments
        (id, workspace_id, customer_id, route_id, is_primary, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run('assignment-1', 'workspace-a', 'doctor-1', 'route-1', 1, now, now)
    db.prepare(
      `INSERT INTO customer_locations
        (id, workspace_id, customer_id, label, city, latitude, longitude, is_primary, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('location-1', 'workspace-a', 'doctor-1', 'Office', 'Mashhad', 36.29, 59.59, 1, now, now)

    expectConstraint(
      () =>
        db
          .prepare(
            `INSERT INTO customers
              (id, workspace_id, customer_type, display_name, record_scope, source, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run('private-without-owner', 'workspace-a', 'doctor', 'Bad Private', 'user', 'user', now, now),
      'user-private customer requires owner_user_id',
    )

    expectConstraint(
      () =>
        db
          .prepare(
            `INSERT INTO customers
              (id, workspace_id, customer_type, display_name, record_scope, source, owner_user_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run('workspace-with-owner', 'workspace-a', 'doctor', 'Bad Shared', 'workspace', 'company', 'user-1', now, now),
      'workspace customer cannot carry a private owner',
    )

    db.prepare(
      `INSERT INTO customers
        (id, workspace_id, customer_type, display_name, record_scope, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('pharmacy-1', 'workspace-a', 'pharmacy', 'Pharmacy One', 'workspace', 'company', now, now)

    expectConstraint(
      () =>
        db
          .prepare(
            `INSERT INTO customer_doctor_profiles
              (customer_id, workspace_id, specialty, class_key, required_frequency, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run('pharmacy-1', 'workspace-a', 'Not Doctor', 'A', 1, now),
      'doctor profile cannot be attached to a non-doctor customer',
    )

    expectConstraint(
      () =>
        db
          .prepare(
            `INSERT INTO customer_locations
              (id, workspace_id, customer_id, label, latitude, longitude, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run('bad-location', 'workspace-a', 'doctor-1', 'Bad GPS', 120, 59.59, now, now),
      'latitude must stay in valid coordinate range',
    )

    const doctor = db.prepare(
      `SELECT c.display_name, dp.required_frequency, r.name AS route_name, l.label AS location_label
       FROM customers c
       JOIN customer_doctor_profiles dp ON dp.customer_id = c.id
       JOIN customer_route_assignments cra ON cra.customer_id = c.id AND cra.is_primary = 1
       JOIN routes r ON r.id = cra.route_id
       JOIN customer_locations l ON l.customer_id = c.id AND l.is_primary = 1
       WHERE c.id = ?`,
    ).get('doctor-1')

    if (
      doctor?.display_name !== 'Doctor One' ||
      doctor?.required_frequency !== 6 ||
      doctor?.route_name !== 'Area 8' ||
      doctor?.location_label !== 'Office'
    ) {
      throw new Error(`workspace: customer reference seed did not reconcile: ${JSON.stringify(doctor)}`)
    }

    db.prepare(
      `INSERT INTO planning_cycles
        (id, workspace_id, cycle_kind, label, jalali_year, jalali_quarter, starts_on, ends_on, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'cycle-1405-q2',
      'workspace-a',
      'jalali_quarter',
      '1405 Q2',
      1405,
      2,
      '2026-06-22',
      '2026-09-22',
      'active',
      now,
      now,
    )

    expectConstraint(
      () =>
        db
          .prepare(
            `INSERT INTO planning_cycles
              (id, workspace_id, cycle_kind, label, jalali_year, jalali_quarter, starts_on, ends_on, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run('cycle-duplicate', 'workspace-a', 'jalali_quarter', 'Duplicate', 1405, 2, '2026-06-22', '2026-09-22', 'draft', now, now),
      'non-archived Jalali quarter must be unique per workspace',
    )

    expectConstraint(
      () =>
        db
          .prepare(
            `INSERT INTO planning_cycles
              (id, workspace_id, cycle_kind, label, starts_on, ends_on, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run('cycle-second-active', 'workspace-a', 'custom', 'Second active', '2026-10-01', '2026-10-31', 'active', now, now),
      'workspace can have only one active planning cycle',
    )

    expectConstraint(
      () =>
        db
          .prepare(
            `INSERT INTO planning_cycles
              (id, workspace_id, cycle_kind, label, starts_on, ends_on, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run('cycle-invalid-range', 'workspace-a', 'custom', 'Invalid range', '2026-11-30', '2026-11-01', 'draft', now, now),
      'planning cycle end date cannot precede start date',
    )
  },
)

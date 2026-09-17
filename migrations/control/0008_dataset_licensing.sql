PRAGMA foreign_keys = ON;

-- Dataset licensing, export control & assignment enforcement (P11-A4) —
-- DATA-MODEL.md §6.2/§6.5, PERMISSION-MATRIX §11 (Example F: export requires a
-- governed catalog entry + an audited action). A dataset without an explicit
-- license keeps fail-closed provenance defaults; every export is ledgered.

CREATE TABLE dataset_licenses (
  dataset_id TEXT PRIMARY KEY NOT NULL,
  license_reference TEXT,
  export_allowed INTEGER NOT NULL DEFAULT 0 CHECK (export_allowed IN (0, 1)),
  redistribution_allowed INTEGER NOT NULL DEFAULT 0 CHECK (redistribution_allowed IN (0, 1)),
  max_export_records INTEGER CHECK (max_export_records IS NULL OR max_export_records >= 0),
  territory TEXT,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
  -- Redistribution is a strictly stronger right than export.
  CHECK (redistribution_allowed = 0 OR export_allowed = 1)
);

CREATE TABLE dataset_exports (
  id TEXT PRIMARY KEY NOT NULL,
  dataset_id TEXT NOT NULL,
  dataset_version_id TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('csv', 'xlsx', 'json', 'ndjson')),
  record_count INTEGER NOT NULL CHECK (record_count >= 0),
  reason TEXT,
  requested_by TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rejected')),
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
  FOREIGN KEY (dataset_version_id) REFERENCES dataset_versions(id) ON DELETE RESTRICT,
  -- A decided export always carries its decision timestamp.
  CHECK (status = 'pending' OR completed_at IS NOT NULL)
);

CREATE INDEX dataset_exports_dataset_idx ON dataset_exports(dataset_id, created_at);

-- Assignment-scoped export governance: a revoked/expired assignment may keep
-- its snapshot rights but never grant redistribution outside the license.
ALTER TABLE dataset_assignments ADD COLUMN export_allowed INTEGER NOT NULL DEFAULT 1
  CHECK (export_allowed IN (0, 1));

CREATE INDEX dataset_assignments_export_idx
ON dataset_assignments(recipient_company_id, export_allowed);
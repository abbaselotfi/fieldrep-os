PRAGMA foreign_keys = ON;

-- Dataset catalog (P11-A1) — DATA-MODEL.md §6 entities.
-- Datasets are control-plane entities (identity/tenancy/licensing live here).
CREATE TABLE datasets (
  id TEXT PRIMARY KEY NOT NULL,
  owner_type TEXT NOT NULL DEFAULT 'platform' CHECK (owner_type IN ('platform', 'company', 'workspace')),
  owner_id TEXT,
  name TEXT NOT NULL,
  dataset_type TEXT NOT NULL CHECK (dataset_type IN ('practitioners', 'pharmacies', 'hospitals', 'clinics', 'mixed')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  source_type TEXT NOT NULL CHECK (source_type IN ('import', 'purchase', 'curated', 'internal', 'partner')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX datasets_status_idx ON datasets(status, dataset_type);

CREATE TABLE dataset_sources (
  id TEXT PRIMARY KEY NOT NULL,
  dataset_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('import', 'purchase', 'curated', 'internal', 'partner')),
  source_name TEXT NOT NULL,
  source_reference TEXT,
  license_reference TEXT,
  metadata_json TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
);

CREATE INDEX dataset_sources_dataset_idx ON dataset_sources(dataset_id);

CREATE TABLE dataset_versions (
  id TEXT PRIMARY KEY NOT NULL,
  dataset_id TEXT NOT NULL,
  version_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'superseded')),
  record_count INTEGER NOT NULL DEFAULT 0 CHECK (record_count >= 0),
  created_by TEXT,
  source_import_id TEXT,
  created_at INTEGER NOT NULL,
  published_at INTEGER,
  FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
  UNIQUE (dataset_id, version_label)
);

CREATE INDEX dataset_versions_dataset_idx ON dataset_versions(dataset_id, status);

CREATE TABLE dataset_imports (
  id TEXT PRIMARY KEY NOT NULL,
  dataset_id TEXT NOT NULL,
  source_file_reference TEXT,
  original_filename TEXT NOT NULL,
  imported_by TEXT,
  imported_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'normalized', 'failed')),
  row_count INTEGER NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  valid_count INTEGER NOT NULL DEFAULT 0 CHECK (valid_count >= 0),
  invalid_count INTEGER NOT NULL DEFAULT 0 CHECK (invalid_count >= 0),
  manifest_json TEXT,
  FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
);

CREATE INDEX dataset_imports_dataset_idx ON dataset_imports(dataset_id, imported_at);

CREATE TABLE dataset_assignments (
  id TEXT PRIMARY KEY NOT NULL,
  dataset_id TEXT NOT NULL,
  dataset_version_id TEXT,
  recipient_company_id TEXT NOT NULL,
  recipient_workspace_id TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('snapshot', 'live')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'expired', 'revoked')),
  valid_from INTEGER,
  valid_until INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
  FOREIGN KEY (dataset_version_id) REFERENCES dataset_versions(id) ON DELETE SET NULL,
  FOREIGN KEY (recipient_company_id) REFERENCES companies(id) ON DELETE RESTRICT,
  FOREIGN KEY (recipient_workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL,
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from),
  CHECK (mode <> 'snapshot' OR dataset_version_id IS NOT NULL),
  CHECK (mode <> 'live' OR dataset_version_id IS NULL)
);

CREATE INDEX dataset_assignments_recipient_idx
ON dataset_assignments(recipient_company_id, recipient_workspace_id, status);
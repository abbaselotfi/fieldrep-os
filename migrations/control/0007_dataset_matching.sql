PRAGMA foreign_keys = ON;

-- Practitioner source records + dataset build lineage (P11-A3) —
-- DATA-MODEL.md §6.7 / §6.3. Every imported record that may represent a
-- practitioner is tracked with its match status; linking to the canonical
-- registry (§6.6) requires an explicit review decision, and a decided record
-- is immutable audit evidence. Builds derive target versions from published
-- source versions (split or refresh) with the definition as provenance.
CREATE TABLE practitioner_source_records (
  id TEXT PRIMARY KEY NOT NULL,
  dataset_id TEXT NOT NULL,
  dataset_version_id TEXT NOT NULL,
  source_record_ref TEXT NOT NULL,
  match_key TEXT,
  full_name TEXT,
  national_id TEXT,
  phone TEXT,
  license_id TEXT,
  match_status TEXT NOT NULL DEFAULT 'unmatched' CHECK (match_status IN ('unmatched', 'candidate', 'matched', 'confirmed_unmatched')),
  practitioner_id TEXT,
  decided_by TEXT,
  decided_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
  FOREIGN KEY (dataset_version_id) REFERENCES dataset_versions(id) ON DELETE CASCADE,
  UNIQUE (dataset_version_id, source_record_ref),
  CHECK (match_status <> 'matched' OR practitioner_id IS NOT NULL),
  CHECK (decided_at IS NULL OR match_status IN ('matched', 'confirmed_unmatched'))
);

CREATE INDEX practitioner_source_records_key_idx
ON practitioner_source_records(match_key, match_status);

CREATE INDEX practitioner_source_records_version_idx
ON practitioner_source_records(dataset_version_id, match_status);

CREATE TABLE dataset_builds (
  id TEXT PRIMARY KEY NOT NULL,
  source_dataset_id TEXT NOT NULL,
  source_version_id TEXT NOT NULL,
  target_dataset_id TEXT NOT NULL,
  target_version_id TEXT NOT NULL,
  definition_json TEXT NOT NULL,
  record_count INTEGER NOT NULL CHECK (record_count >= 0),
  created_by TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (source_dataset_id) REFERENCES datasets(id) ON DELETE RESTRICT,
  FOREIGN KEY (source_version_id) REFERENCES dataset_versions(id) ON DELETE RESTRICT,
  FOREIGN KEY (target_dataset_id) REFERENCES datasets(id) ON DELETE RESTRICT,
  FOREIGN KEY (target_version_id) REFERENCES dataset_versions(id) ON DELETE RESTRICT,
  UNIQUE (target_version_id)
);

CREATE INDEX dataset_builds_source_idx ON dataset_builds(source_version_id);
PRAGMA foreign_keys = ON;

-- Dataset import duplicate-review ledger (P11-A2) — DATA-MODEL.md §6.4.
-- Normalization groups records that share a Persian-folded matching key into
-- reviewable candidates; the reviewer decision is terminal (audit evidence).
CREATE TABLE dataset_duplicate_candidates (
  id TEXT PRIMARY KEY NOT NULL,
  dataset_id TEXT NOT NULL,
  import_id TEXT NOT NULL,
  match_key TEXT NOT NULL,
  record_refs_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'merged', 'kept_both', 'discarded')),
  decided_by TEXT,
  decided_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
  FOREIGN KEY (import_id) REFERENCES dataset_imports(id) ON DELETE CASCADE,
  UNIQUE (import_id, match_key),
  CHECK (decided_at IS NULL OR status <> 'pending')
);

CREATE INDEX dataset_duplicate_candidates_key_idx
ON dataset_duplicate_candidates(dataset_id, match_key, status);
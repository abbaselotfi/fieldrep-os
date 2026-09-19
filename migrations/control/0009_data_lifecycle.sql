PRAGMA foreign_keys = ON;

-- Data lifecycle & recovery ledger (P12-A3) — SECURITY-THREAT-MODEL §29.
-- Suspension, archival, retention expiration, legal hold and final deletion
-- are separate, ledgered concepts (never a casual hard-delete cascade), and
-- backup recoverability only counts once a restore drill measured its RPO/RTO.

CREATE TABLE company_retention_policies (
  company_id TEXT PRIMARY KEY NOT NULL,
  purge_after_days INTEGER NOT NULL CHECK (purge_after_days >= 30),
  updated_by TEXT,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE lifecycle_events (
  id TEXT PRIMARY KEY NOT NULL,
  company_id TEXT NOT NULL,
  workspace_id TEXT,
  action TEXT NOT NULL CHECK (action IN ('suspend', 'resume', 'archive', 'restore', 'request_purge', 'complete_purge', 'place_legal_hold', 'release_legal_hold')),
  performed_by TEXT,
  reason TEXT,
  at_ms INTEGER NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
);

CREATE INDEX lifecycle_events_company_idx ON lifecycle_events(company_id, at_ms);

CREATE TABLE backup_drills (
  id TEXT PRIMARY KEY NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('control_plane', 'workspace')),
  target_id TEXT,
  backup_reference TEXT NOT NULL,
  started_at_ms INTEGER NOT NULL,
  completed_at_ms INTEGER,
  result TEXT CHECK (result IN ('passed', 'failed')),
  verified_by TEXT,
  rpo_minutes INTEGER CHECK (rpo_minutes IS NULL OR rpo_minutes >= 0),
  rto_minutes INTEGER CHECK (rto_minutes IS NULL OR rto_minutes >= 0),
  notes TEXT,
  -- A decided drill always closes with a timestamp, never without one.
  CHECK ((result IS NULL) = (completed_at_ms IS NULL))
);

CREATE INDEX backup_drills_scope_idx ON backup_drills(scope, target_id, started_at_ms);
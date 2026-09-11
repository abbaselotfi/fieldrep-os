PRAGMA foreign_keys = ON;

-- Platform administration (P10-A1) — company limits.
-- companies/workspaces already exist in 0001; this adds the limits ledger.
CREATE TABLE platform_limits (
  company_id TEXT PRIMARY KEY NOT NULL,
  max_workspaces INTEGER NOT NULL DEFAULT 5 CHECK (max_workspaces > 0),
  max_users_per_workspace INTEGER NOT NULL DEFAULT 50 CHECK (max_users_per_workspace > 0),
  max_storage_mb INTEGER NOT NULL DEFAULT 1000 CHECK (max_storage_mb > 0),
  max_imports_per_cycle INTEGER NOT NULL DEFAULT 10 CHECK (max_imports_per_cycle > 0),
  updated_by_user_id TEXT,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);
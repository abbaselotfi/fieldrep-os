PRAGMA foreign_keys = ON;

CREATE TABLE planning_cycles (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  cycle_kind TEXT NOT NULL DEFAULT 'jalali_quarter' CHECK (cycle_kind IN ('jalali_quarter', 'custom')),
  label TEXT NOT NULL,
  jalali_year INTEGER,
  jalali_quarter INTEGER,
  starts_on TEXT NOT NULL CHECK (length(starts_on) = 10),
  ends_on TEXT NOT NULL CHECK (length(ends_on) = 10),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed', 'archived')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE,
  CHECK (starts_on <= ends_on),
  CHECK (
    (cycle_kind = 'jalali_quarter'
      AND jalali_year BETWEEN 1300 AND 1600
      AND jalali_quarter BETWEEN 1 AND 4)
    OR
    (cycle_kind = 'custom'
      AND jalali_quarter IS NULL)
  )
);

CREATE INDEX planning_cycles_workspace_dates_idx
  ON planning_cycles(workspace_id, starts_on, ends_on, status);

CREATE UNIQUE INDEX planning_cycles_unique_jalali_quarter_idx
  ON planning_cycles(workspace_id, jalali_year, jalali_quarter)
  WHERE cycle_kind = 'jalali_quarter' AND status <> 'archived';

CREATE UNIQUE INDEX planning_cycles_one_active_idx
  ON planning_cycles(workspace_id)
  WHERE status = 'active';

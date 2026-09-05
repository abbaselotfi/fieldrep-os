PRAGMA foreign_keys = ON;

CREATE TABLE workbook_imports (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_sha256 TEXT NOT NULL CHECK (
    length(source_sha256) = 64
    AND source_sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  parser_version TEXT NOT NULL,
  raw_object_key TEXT,
  status TEXT NOT NULL DEFAULT 'previewed' CHECK (
    status IN ('previewed', 'approved', 'applying', 'applied', 'rejected', 'failed')
  ),
  summary_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  applied_at INTEGER,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE,
  UNIQUE (workspace_id, source_sha256)
);

CREATE INDEX workbook_imports_workspace_status_idx
  ON workbook_imports(workspace_id, status, created_at);

CREATE TABLE workbook_import_rows (
  import_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  row_key TEXT NOT NULL,
  sheet_name TEXT NOT NULL,
  row_number INTEGER NOT NULL CHECK (row_number >= 1),
  entity_kind TEXT NOT NULL CHECK (
    entity_kind IN ('route', 'customer', 'location', 'product', 'plan', 'visit', 'metadata')
  ),
  action TEXT NOT NULL CHECK (
    action IN ('create', 'update', 'skip', 'warning', 'error')
  ),
  natural_key TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  issues_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (import_id, row_key),
  FOREIGN KEY (import_id) REFERENCES workbook_imports(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE
);

CREATE INDEX workbook_import_rows_workspace_import_idx
  ON workbook_import_rows(workspace_id, import_id, sheet_name, row_number);
CREATE INDEX workbook_import_rows_action_idx
  ON workbook_import_rows(workspace_id, import_id, action, entity_kind);

CREATE TRIGGER workbook_import_rows_workspace_guard_insert
BEFORE INSERT ON workbook_import_rows
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM workbook_imports wi
  WHERE wi.id = NEW.import_id
    AND wi.workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'workbook_import_workspace_mismatch');
END;

CREATE TRIGGER workbook_import_rows_workspace_guard_update
BEFORE UPDATE OF import_id, workspace_id ON workbook_import_rows
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM workbook_imports wi
  WHERE wi.id = NEW.import_id
    AND wi.workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'workbook_import_workspace_mismatch');
END;

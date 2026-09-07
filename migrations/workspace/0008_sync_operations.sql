PRAGMA foreign_keys = ON;

-- P4-A2: offline sync idempotency ledger.
--
-- OFFLINE-SYNC-SPEC §7: the sync endpoint treats operation_id as an
-- idempotency key. When the server already applied an operation and the
-- client retries (network response lost), the server returns the stored
-- result instead of applying the mutation a second time.
--
-- The ledger is workspace-local and every row is bound to the user that
-- pushed it. A duplicate operation_id claimed by a different user/workspace
-- is a tenant-boundary violation and MUST be rejected, never answered from
-- the cache.
CREATE TABLE sync_operations (
  operation_id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation_type TEXT NOT NULL CHECK (
    operation_type IN ('create', 'update', 'delete', 'transition')
  ),
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  status TEXT NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'failed')),
  client_occurred_at INTEGER,
  applied_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE
);

CREATE INDEX sync_operations_workspace_user_idx
  ON sync_operations(workspace_id, user_id, applied_at);
CREATE INDEX sync_operations_entity_idx
  ON sync_operations(workspace_id, entity_type, entity_id);
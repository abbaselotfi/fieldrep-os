CREATE TABLE support_access_grants (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  requested_by_user_id TEXT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'denied', 'revoked', 'expired')),
  requested_at INTEGER NOT NULL,
  decided_at INTEGER,
  decided_by_user_id TEXT,
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX support_access_grants_workspace_idx
ON support_access_grants(workspace_id, requested_at);

CREATE INDEX support_access_grants_status_idx
ON support_access_grants(status, requested_at);
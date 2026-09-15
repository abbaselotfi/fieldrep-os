PRAGMA foreign_keys = ON;

-- Platform global settings (P10-A4).
-- Feature entitlements already exist in 0001 (feature_entitlements); this adds
-- the platform-level settings ledger keyed by settings scope.
CREATE TABLE platform_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value_json TEXT NOT NULL,
  updated_by_user_id TEXT,
  updated_at INTEGER NOT NULL
);
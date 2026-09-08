PRAGMA foreign_keys = ON;

-- P5-A1: visit location evidence (GPS/GeoCapture).
--
-- Stores the device-captured location fix attached to a visit report.
-- Client capture data (coordinates, accuracy, capture mode, captured_at)
-- is preserved verbatim; server_received_at records when the evidence
-- actually reached the server so auditors can distinguish online pushes
-- from delayed offline sync pushes (Sanofi-style evidence chain).
CREATE TABLE visit_location_evidence (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  visit_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  latitude REAL NOT NULL CHECK (latitude >= -90 AND latitude <= 90),
  longitude REAL NOT NULL CHECK (longitude >= -180 AND longitude <= 180),
  accuracy_m REAL CHECK (accuracy_m IS NULL OR accuracy_m >= 0),
  altitude_m REAL,
  capture_mode TEXT NOT NULL CHECK (capture_mode IN ('gps', 'network', 'manual', 'offline')),
  captured_at INTEGER NOT NULL,
  client_occurred_at TEXT NOT NULL,
  server_received_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE,
  FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE CASCADE,
  UNIQUE (visit_id)
);

CREATE INDEX visit_location_evidence_owner_idx
  ON visit_location_evidence(workspace_id, owner_user_id, captured_at);
PRAGMA foreign_keys = ON;

-- P6-A2: visit verification result.
--
-- The outcome of the application-owned geofence evaluation (MAPS-LOCATION-SPEC
-- §24) over the stored location evidence. One result per visit; re-evaluation
-- replaces the previous row so supervisors always see the latest decision
-- with its explainable reason codes.
CREATE TABLE visit_verification_results (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  visit_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('verified', 'nearby', 'unverified', 'outside')),
  distance_m REAL,
  accuracy_m REAL,
  policy_radius_m REAL NOT NULL,
  reasons_json TEXT NOT NULL CHECK (json_valid(reasons_json)),
  evaluated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE,
  FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE CASCADE,
  UNIQUE (visit_id)
);

CREATE INDEX visit_verification_status_idx
  ON visit_verification_results(workspace_id, owner_user_id, status, evaluated_at);
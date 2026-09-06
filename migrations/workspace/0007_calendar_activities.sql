PRAGMA foreign_keys = ON;

-- P3-A1: operational calendar & activity persistence.
-- Visits are NOT stored here; they stay in plan_entries/visits so that visit
-- KPIs (Frequency/Visited/Achievement) keep a single authoritative source.
-- Holidays are annual versioned datasets (official-calendar), not rows here.

CREATE TABLE workspace_working_calendar (
  workspace_id TEXT PRIMARY KEY NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Tehran',
  -- Persian weekday indexes: 0=Saturday .. 6=Friday. Default = Sat..Thu.
  working_weekdays_json TEXT NOT NULL DEFAULT '[0,1,2,3,4,5]',
  updated_by_user_id TEXT,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE,
  CHECK (json_valid(working_weekdays_json))
);

CREATE TABLE calendar_activities (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('internal_meeting', 'company_program', 'doctor_program', 'custom_activity')),
  title TEXT NOT NULL,
  description TEXT,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('workspace', 'organization_unit', 'selected_users', 'user')),
  organization_unit_id TEXT,
  owner_user_id TEXT,
  location_id TEXT,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  all_day INTEGER NOT NULL DEFAULT 0 CHECK (all_day IN (0, 1)),
  blocks_planning INTEGER NOT NULL DEFAULT 0 CHECK (blocks_planning IN (0, 1)),
  counts_as_working_activity INTEGER NOT NULL DEFAULT 1 CHECK (counts_as_working_activity IN (0, 1)),
  appears_in_report INTEGER NOT NULL DEFAULT 1 CHECK (appears_in_report IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('draft', 'confirmed', 'cancelled')),
  created_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE,
  CHECK (ends_at >= starts_at),
  CHECK (scope_type <> 'organization_unit' OR organization_unit_id IS NOT NULL),
  CHECK (scope_type <> 'user' OR owner_user_id IS NOT NULL)
);

CREATE INDEX calendar_activities_workspace_range_idx ON calendar_activities(workspace_id, starts_at, ends_at);
CREATE INDEX calendar_activities_type_status_idx ON calendar_activities(workspace_id, activity_type, status);
CREATE INDEX calendar_activities_owner_idx ON calendar_activities(workspace_id, owner_user_id);

CREATE TABLE calendar_activity_targets (
  activity_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (activity_id, user_id),
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE,
  FOREIGN KEY (activity_id) REFERENCES calendar_activities(id) ON DELETE CASCADE
);

CREATE INDEX calendar_activity_targets_user_idx ON calendar_activity_targets(workspace_id, user_id);

CREATE TRIGGER calendar_activity_targets_workspace_match_insert
BEFORE INSERT ON calendar_activity_targets
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM calendar_activities
  WHERE id = NEW.activity_id AND workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'calendar_activity_target_workspace_mismatch');
END;

CREATE TRIGGER calendar_activity_targets_workspace_match_update
BEFORE UPDATE OF workspace_id, activity_id ON calendar_activity_targets
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM calendar_activities
  WHERE id = NEW.activity_id AND workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'calendar_activity_target_workspace_mismatch');
END;

CREATE TABLE leave_requests (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  leave_type TEXT NOT NULL CHECK (leave_type IN ('annual', 'sick', 'hourly', 'emergency', 'other')),
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'requested', 'approved', 'rejected', 'cancelled')),
  reason TEXT,
  decided_by_user_id TEXT,
  decided_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE,
  CHECK (ends_at >= starts_at),
  CHECK (decided_at IS NULL OR decided_by_user_id IS NOT NULL)
);

CREATE INDEX leave_requests_workspace_user_idx ON leave_requests(workspace_id, user_id, starts_at);
CREATE INDEX leave_requests_workspace_status_idx ON leave_requests(workspace_id, status, starts_at);

CREATE TABLE business_trips (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  origin_json TEXT CHECK (origin_json IS NULL OR json_valid(origin_json)),
  destination_json TEXT NOT NULL CHECK (json_valid(destination_json)),
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  purpose TEXT,
  transport TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'ongoing', 'completed', 'cancelled')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE,
  CHECK (ends_at >= starts_at)
);

CREATE INDEX business_trips_workspace_user_idx ON business_trips(workspace_id, user_id, starts_at);
CREATE INDEX business_trips_workspace_status_idx ON business_trips(workspace_id, status, starts_at);

-- Company-level closures are stored as projections; the authoritative
-- company calendar policy remains a control-plane concern (P9/P10).
CREATE TABLE calendar_closures (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  closure_level TEXT NOT NULL CHECK (closure_level IN ('company', 'workspace')),
  canonical_date TEXT NOT NULL CHECK (canonical_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  label TEXT NOT NULL,
  created_by_user_id TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE,
  UNIQUE (workspace_id, closure_level, canonical_date)
);

CREATE INDEX calendar_closures_workspace_date_idx ON calendar_closures(workspace_id, canonical_date);

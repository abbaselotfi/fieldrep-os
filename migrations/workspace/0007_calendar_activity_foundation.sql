PRAGMA foreign_keys = ON;

-- Generic non-visit activities are authoritative here. More specialized P3
-- entities (leave, trips, etc.) keep their own tables and project into
-- calendar_events rather than becoming visit records.
CREATE TABLE activities (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  owner_user_id TEXT,
  activity_type TEXT NOT NULL CHECK (
    activity_type IN ('internal_meeting', 'company_program', 'doctor_program', 'custom_activity')
  ),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description TEXT,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  local_start_date TEXT NOT NULL CHECK (
    length(local_start_date) = 10
    AND local_start_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  local_end_date TEXT NOT NULL CHECK (
    length(local_end_date) = 10
    AND local_end_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  all_day INTEGER NOT NULL DEFAULT 0 CHECK (all_day IN (0, 1)),
  scope_type TEXT NOT NULL CHECK (
    scope_type IN ('platform', 'company', 'workspace', 'organization_unit', 'selected_users', 'user')
  ),
  scope_id TEXT,
  blocks_planning INTEGER NOT NULL DEFAULT 0 CHECK (blocks_planning IN (0, 1)),
  counts_as_working_activity INTEGER NOT NULL DEFAULT 1 CHECK (counts_as_working_activity IN (0, 1)),
  appears_in_report INTEGER NOT NULL DEFAULT 1 CHECK (appears_in_report IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (
    status IN ('draft', 'scheduled', 'completed', 'cancelled')
  ),
  location_text TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE,
  CHECK (ends_at >= starts_at),
  CHECK (local_end_date >= local_start_date),
  CHECK (
    (scope_type IN ('platform', 'selected_users') AND scope_id IS NULL)
    OR (scope_type IN ('company', 'workspace', 'organization_unit', 'user') AND scope_id IS NOT NULL)
  ),
  CHECK (scope_type <> 'workspace' OR scope_id = workspace_id),
  CHECK (scope_type <> 'user' OR owner_user_id IS NULL OR scope_id = owner_user_id)
);

CREATE INDEX activities_workspace_date_idx
  ON activities(workspace_id, local_start_date, local_end_date, status);
CREATE INDEX activities_owner_date_idx
  ON activities(workspace_id, owner_user_id, local_start_date, status);
CREATE INDEX activities_scope_idx
  ON activities(workspace_id, scope_type, scope_id, local_start_date);

-- Unified operational timeline projection/index. KPI/reporting code must continue
-- to query authoritative domain sources (especially visits), never this table.
CREATE TABLE calendar_events (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'visit', 'pharmacy_visit', 'leave', 'business_trip',
      'internal_meeting', 'company_program', 'doctor_program',
      'public_holiday', 'company_closure', 'workspace_closure', 'custom_activity'
    )
  ),
  source_entity_type TEXT NOT NULL CHECK (
    source_entity_type IN (
      'visit', 'plan_entry', 'activity', 'leave_request', 'business_trip',
      'company_program', 'doctor_program', 'official_calendar', 'calendar_override'
    )
  ),
  source_entity_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  local_start_date TEXT NOT NULL CHECK (
    length(local_start_date) = 10
    AND local_start_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  local_end_date TEXT NOT NULL CHECK (
    length(local_end_date) = 10
    AND local_end_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  all_day INTEGER NOT NULL DEFAULT 0 CHECK (all_day IN (0, 1)),
  scope_type TEXT NOT NULL CHECK (
    scope_type IN ('platform', 'company', 'workspace', 'organization_unit', 'selected_users', 'user')
  ),
  scope_id TEXT,
  blocks_planning INTEGER NOT NULL DEFAULT 0 CHECK (blocks_planning IN (0, 1)),
  counts_as_working_activity INTEGER NOT NULL DEFAULT 0 CHECK (counts_as_working_activity IN (0, 1)),
  counts_as_visit INTEGER NOT NULL DEFAULT 0 CHECK (counts_as_visit IN (0, 1)),
  appears_in_report INTEGER NOT NULL DEFAULT 0 CHECK (appears_in_report IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (
    status IN ('draft', 'scheduled', 'active', 'completed', 'cancelled')
  ),
  location_text TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE,
  UNIQUE (workspace_id, source_entity_type, source_entity_id),
  CHECK (ends_at >= starts_at),
  CHECK (local_end_date >= local_start_date),
  CHECK (
    (scope_type IN ('platform', 'selected_users') AND scope_id IS NULL)
    OR (scope_type IN ('company', 'workspace', 'organization_unit', 'user') AND scope_id IS NOT NULL)
  ),
  CHECK (scope_type <> 'workspace' OR scope_id = workspace_id),
  -- A Calendar row can describe KPI semantics but can never manufacture them.
  -- Only a projection whose authoritative source is an Actual Visit may carry
  -- counts_as_visit=1. Planned visits and non-visit activities must stay zero.
  CHECK (
    counts_as_visit = 0
    OR (
      source_entity_type = 'visit'
      AND event_type IN ('visit', 'pharmacy_visit')
    )
  )
);

CREATE INDEX calendar_events_workspace_date_idx
  ON calendar_events(workspace_id, local_start_date, local_end_date, status);
CREATE INDEX calendar_events_scope_date_idx
  ON calendar_events(workspace_id, scope_type, scope_id, local_start_date, status);
CREATE INDEX calendar_events_source_idx
  ON calendar_events(workspace_id, source_entity_type, source_entity_id);
CREATE INDEX calendar_events_type_date_idx
  ON calendar_events(workspace_id, event_type, local_start_date, status);

CREATE TABLE calendar_event_attendees (
  event_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  attendance_role TEXT NOT NULL DEFAULT 'attendee' CHECK (
    attendance_role IN ('owner', 'attendee', 'required', 'optional', 'speaker')
  ),
  response_status TEXT NOT NULL DEFAULT 'none' CHECK (
    response_status IN ('none', 'accepted', 'declined', 'tentative')
  ),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (event_id, user_id),
  FOREIGN KEY (event_id) REFERENCES calendar_events(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE
);

CREATE INDEX calendar_event_attendees_user_idx
  ON calendar_event_attendees(workspace_id, user_id, event_id);

CREATE TRIGGER activities_org_scope_guard_insert
BEFORE INSERT ON activities
FOR EACH ROW
WHEN NEW.scope_type = 'organization_unit' AND NOT EXISTS (
  SELECT 1 FROM organization_units ou
  WHERE ou.id = NEW.scope_id AND ou.workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'activity_organization_scope_mismatch');
END;

CREATE TRIGGER activities_org_scope_guard_update
BEFORE UPDATE OF workspace_id, scope_type, scope_id ON activities
FOR EACH ROW
WHEN NEW.scope_type = 'organization_unit' AND NOT EXISTS (
  SELECT 1 FROM organization_units ou
  WHERE ou.id = NEW.scope_id AND ou.workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'activity_organization_scope_mismatch');
END;

CREATE TRIGGER calendar_events_org_scope_guard_insert
BEFORE INSERT ON calendar_events
FOR EACH ROW
WHEN NEW.scope_type = 'organization_unit' AND NOT EXISTS (
  SELECT 1 FROM organization_units ou
  WHERE ou.id = NEW.scope_id AND ou.workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'calendar_event_organization_scope_mismatch');
END;

CREATE TRIGGER calendar_events_org_scope_guard_update
BEFORE UPDATE OF workspace_id, scope_type, scope_id ON calendar_events
FOR EACH ROW
WHEN NEW.scope_type = 'organization_unit' AND NOT EXISTS (
  SELECT 1 FROM organization_units ou
  WHERE ou.id = NEW.scope_id AND ou.workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'calendar_event_organization_scope_mismatch');
END;

CREATE TRIGGER calendar_events_activity_source_guard_insert
BEFORE INSERT ON calendar_events
FOR EACH ROW
WHEN NEW.source_entity_type = 'activity' AND NOT EXISTS (
  SELECT 1 FROM activities a
  WHERE a.id = NEW.source_entity_id
    AND a.workspace_id = NEW.workspace_id
    AND a.activity_type = NEW.event_type
)
BEGIN
  SELECT RAISE(ABORT, 'calendar_event_activity_source_mismatch');
END;

CREATE TRIGGER calendar_events_activity_source_guard_update
BEFORE UPDATE OF workspace_id, event_type, source_entity_type, source_entity_id ON calendar_events
FOR EACH ROW
WHEN NEW.source_entity_type = 'activity' AND NOT EXISTS (
  SELECT 1 FROM activities a
  WHERE a.id = NEW.source_entity_id
    AND a.workspace_id = NEW.workspace_id
    AND a.activity_type = NEW.event_type
)
BEGIN
  SELECT RAISE(ABORT, 'calendar_event_activity_source_mismatch');
END;

CREATE TRIGGER calendar_event_attendees_workspace_guard_insert
BEFORE INSERT ON calendar_event_attendees
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM calendar_events ce
  WHERE ce.id = NEW.event_id AND ce.workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'calendar_event_attendee_workspace_mismatch');
END;

CREATE TRIGGER calendar_event_attendees_workspace_guard_update
BEFORE UPDATE OF event_id, workspace_id ON calendar_event_attendees
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM calendar_events ce
  WHERE ce.id = NEW.event_id AND ce.workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'calendar_event_attendee_workspace_mismatch');
END;

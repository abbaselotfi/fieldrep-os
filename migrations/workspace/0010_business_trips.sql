PRAGMA foreign_keys = ON;

CREATE TABLE business_trips (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  origin_city TEXT NOT NULL CHECK (length(trim(origin_city)) > 0),
  origin_province TEXT,
  purpose TEXT NOT NULL CHECK (length(trim(purpose)) > 0),
  transport TEXT NOT NULL CHECK (transport IN ('car', 'train', 'airplane', 'bus', 'taxi', 'other')),
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
  blocks_planning INTEGER NOT NULL DEFAULT 0 CHECK (blocks_planning IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'requested', 'approved', 'rejected', 'cancelled', 'completed')
  ),
  decided_by_user_id TEXT,
  decided_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE,
  CHECK (ends_at >= starts_at),
  CHECK (local_end_date >= local_start_date),
  CHECK (
    (status IN ('approved', 'rejected', 'completed') AND decided_by_user_id IS NOT NULL AND decided_at IS NOT NULL)
    OR (status NOT IN ('approved', 'rejected', 'completed') AND decided_by_user_id IS NULL AND decided_at IS NULL)
  )
);

CREATE INDEX business_trips_user_date_idx
  ON business_trips(workspace_id, user_id, local_start_date, local_end_date, status);
CREATE INDEX business_trips_status_date_idx
  ON business_trips(workspace_id, status, local_start_date, local_end_date);

CREATE TABLE business_trip_destinations (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  business_trip_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  city TEXT NOT NULL CHECK (length(trim(city)) > 0),
  province TEXT,
  address TEXT,
  starts_at INTEGER,
  ends_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE,
  FOREIGN KEY (business_trip_id) REFERENCES business_trips(id) ON DELETE CASCADE,
  UNIQUE (workspace_id, business_trip_id, sequence),
  CHECK (
    (starts_at IS NULL AND ends_at IS NULL)
    OR (starts_at IS NOT NULL AND ends_at IS NOT NULL AND ends_at >= starts_at)
  )
);

CREATE INDEX business_trip_destinations_trip_idx
  ON business_trip_destinations(workspace_id, business_trip_id, sequence);

CREATE TRIGGER business_trip_destination_workspace_guard_insert
BEFORE INSERT ON business_trip_destinations
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM business_trips t
  WHERE t.id = NEW.business_trip_id AND t.workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'business_trip_destination_workspace_mismatch');
END;

CREATE TRIGGER business_trip_destination_workspace_guard_update
BEFORE UPDATE OF workspace_id, business_trip_id ON business_trip_destinations
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM business_trips t
  WHERE t.id = NEW.business_trip_id AND t.workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'business_trip_destination_workspace_mismatch');
END;

CREATE TRIGGER business_trip_destination_interval_guard_insert
BEFORE INSERT ON business_trip_destinations
FOR EACH ROW
WHEN NEW.starts_at IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM business_trips t
  WHERE t.id = NEW.business_trip_id
    AND t.workspace_id = NEW.workspace_id
    AND NEW.starts_at >= t.starts_at
    AND NEW.ends_at <= t.ends_at
)
BEGIN
  SELECT RAISE(ABORT, 'business_trip_destination_interval_outside_trip');
END;

CREATE TRIGGER business_trip_destination_interval_guard_update
BEFORE UPDATE OF starts_at, ends_at, workspace_id, business_trip_id ON business_trip_destinations
FOR EACH ROW
WHEN NEW.starts_at IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM business_trips t
  WHERE t.id = NEW.business_trip_id
    AND t.workspace_id = NEW.workspace_id
    AND NEW.starts_at >= t.starts_at
    AND NEW.ends_at <= t.ends_at
)
BEGIN
  SELECT RAISE(ABORT, 'business_trip_destination_interval_outside_trip');
END;

CREATE TRIGGER calendar_business_trip_source_guard_insert
BEFORE INSERT ON calendar_events
FOR EACH ROW
WHEN NEW.source_entity_type = 'business_trip' AND NOT EXISTS (
  SELECT 1 FROM business_trips t
  WHERE t.id = NEW.source_entity_id AND t.workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'calendar_business_trip_source_mismatch');
END;

CREATE TRIGGER calendar_business_trip_source_guard_update
BEFORE UPDATE OF workspace_id, source_entity_type, source_entity_id ON calendar_events
FOR EACH ROW
WHEN NEW.source_entity_type = 'business_trip' AND NOT EXISTS (
  SELECT 1 FROM business_trips t
  WHERE t.id = NEW.source_entity_id AND t.workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'calendar_business_trip_source_mismatch');
END;

CREATE TRIGGER calendar_business_trip_kpi_guard_insert
BEFORE INSERT ON calendar_events
FOR EACH ROW
WHEN NEW.source_entity_type = 'business_trip' AND NEW.counts_as_visit <> 0
BEGIN
  SELECT RAISE(ABORT, 'business_trip_calendar_event_cannot_count_as_visit');
END;

CREATE TRIGGER calendar_business_trip_kpi_guard_update
BEFORE UPDATE OF source_entity_type, counts_as_visit ON calendar_events
FOR EACH ROW
WHEN NEW.source_entity_type = 'business_trip' AND NEW.counts_as_visit <> 0
BEGIN
  SELECT RAISE(ABORT, 'business_trip_calendar_event_cannot_count_as_visit');
END;

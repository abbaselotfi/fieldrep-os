PRAGMA foreign_keys = ON;

CREATE TABLE leave_requests (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  leave_type TEXT NOT NULL CHECK (leave_type IN ('annual', 'sick', 'hourly', 'emergency', 'other')),
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
  all_day INTEGER NOT NULL DEFAULT 1 CHECK (all_day IN (0, 1)),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'requested', 'approved', 'rejected', 'cancelled')
  ),
  decided_by_user_id TEXT,
  decided_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE,
  CHECK (ends_at >= starts_at),
  CHECK (local_end_date >= local_start_date),
  CHECK (
    (status IN ('approved', 'rejected') AND decided_by_user_id IS NOT NULL AND decided_at IS NOT NULL)
    OR (status NOT IN ('approved', 'rejected') AND decided_by_user_id IS NULL AND decided_at IS NULL)
  )
);

CREATE INDEX leave_requests_user_date_idx
  ON leave_requests(workspace_id, user_id, local_start_date, local_end_date, status);
CREATE INDEX leave_requests_status_date_idx
  ON leave_requests(workspace_id, status, local_start_date, local_end_date);

-- A leave projection must reference the authoritative request in the same physical workspace.
CREATE TRIGGER calendar_leave_source_guard_insert
BEFORE INSERT ON calendar_events
FOR EACH ROW
WHEN NEW.source_entity_type = 'leave_request' AND NOT EXISTS (
  SELECT 1 FROM leave_requests l
  WHERE l.id = NEW.source_entity_id AND l.workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'calendar_leave_source_mismatch');
END;

CREATE TRIGGER calendar_leave_source_guard_update
BEFORE UPDATE OF workspace_id, source_entity_type, source_entity_id ON calendar_events
FOR EACH ROW
WHEN NEW.source_entity_type = 'leave_request' AND NOT EXISTS (
  SELECT 1 FROM leave_requests l
  WHERE l.id = NEW.source_entity_id AND l.workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'calendar_leave_source_mismatch');
END;

-- Leave can never be a Visit KPI source, regardless of workflow state.
CREATE TRIGGER calendar_leave_kpi_guard_insert
BEFORE INSERT ON calendar_events
FOR EACH ROW
WHEN NEW.source_entity_type = 'leave_request' AND NEW.counts_as_visit <> 0
BEGIN
  SELECT RAISE(ABORT, 'leave_calendar_event_cannot_count_as_visit');
END;

CREATE TRIGGER calendar_leave_kpi_guard_update
BEFORE UPDATE OF source_entity_type, counts_as_visit ON calendar_events
FOR EACH ROW
WHEN NEW.source_entity_type = 'leave_request' AND NEW.counts_as_visit <> 0
BEGIN
  SELECT RAISE(ABORT, 'leave_calendar_event_cannot_count_as_visit');
END;

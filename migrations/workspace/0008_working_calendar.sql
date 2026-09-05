PRAGMA foreign_keys = ON;

-- Versioned workspace-local projection of an official annual calendar dataset.
-- The authoritative annual publication remains external source data with provenance;
-- runtime date conversion never depends on network scraping.
CREATE TABLE official_calendar_versions (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'IR' CHECK (country_code = 'IR'),
  jalali_year INTEGER NOT NULL,
  version_label TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'verified', 'superseded')),
  sources_json TEXT NOT NULL CHECK (json_valid(sources_json)),
  published_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE,
  UNIQUE (workspace_id, country_code, jalali_year, version_label)
);

CREATE UNIQUE INDEX official_calendar_one_verified_year_idx
  ON official_calendar_versions(workspace_id, country_code, jalali_year)
  WHERE status = 'verified';

CREATE TABLE official_calendar_events (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  jalali_year INTEGER NOT NULL,
  jalali_month INTEGER NOT NULL CHECK (jalali_month BETWEEN 1 AND 12),
  jalali_day INTEGER NOT NULL CHECK (jalali_day BETWEEN 1 AND 31),
  canonical_date TEXT NOT NULL CHECK (
    length(canonical_date) = 10
    AND canonical_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  label TEXT NOT NULL CHECK (length(trim(label)) > 0),
  event_kind TEXT NOT NULL CHECK (event_kind IN ('public_holiday', 'religious', 'national', 'observance')),
  is_holiday INTEGER NOT NULL CHECK (is_holiday IN (0, 1)),
  source_json TEXT NOT NULL CHECK (json_valid(source_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE,
  FOREIGN KEY (version_id) REFERENCES official_calendar_versions(id) ON DELETE CASCADE,
  UNIQUE (version_id, id)
);

CREATE INDEX official_calendar_events_date_idx
  ON official_calendar_events(workspace_id, canonical_date, is_holiday);

CREATE TRIGGER official_calendar_event_version_scope_insert
BEFORE INSERT ON official_calendar_events
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM official_calendar_versions v
  WHERE v.id = NEW.version_id
    AND v.workspace_id = NEW.workspace_id
    AND v.jalali_year = NEW.jalali_year
)
BEGIN
  SELECT RAISE(ABORT, 'official_calendar_version_scope_mismatch');
END;

CREATE TRIGGER official_calendar_event_version_scope_update
BEFORE UPDATE OF workspace_id, version_id, jalali_year ON official_calendar_events
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM official_calendar_versions v
  WHERE v.id = NEW.version_id
    AND v.workspace_id = NEW.workspace_id
    AND v.jalali_year = NEW.jalali_year
)
BEGIN
  SELECT RAISE(ABORT, 'official_calendar_version_scope_mismatch');
END;

-- Working-week policy is projected into every physical workspace database. source_scope
-- preserves whether an effective rule originated at company or workspace level.
CREATE TABLE working_calendar_rules (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  source_scope TEXT NOT NULL CHECK (source_scope IN ('company', 'workspace')),
  source_scope_id TEXT NOT NULL,
  weekday_index INTEGER NOT NULL CHECK (weekday_index BETWEEN 0 AND 6),
  is_working_day INTEGER NOT NULL CHECK (is_working_day IN (0, 1)),
  valid_from TEXT NOT NULL CHECK (length(valid_from) = 10),
  valid_until TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE,
  CHECK (valid_until IS NULL OR valid_until >= valid_from)
);

CREATE INDEX working_calendar_rules_effective_idx
  ON working_calendar_rules(workspace_id, status, weekday_index, valid_from, valid_until);

CREATE TABLE calendar_overrides (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  source_scope TEXT NOT NULL CHECK (source_scope IN ('company', 'workspace')),
  source_scope_id TEXT NOT NULL,
  starts_on TEXT NOT NULL CHECK (
    length(starts_on) = 10
    AND starts_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  ends_on TEXT NOT NULL CHECK (
    length(ends_on) = 10
    AND ends_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  override_mode TEXT NOT NULL CHECK (override_mode IN ('closure', 'working_day')),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'cancelled', 'archived')),
  created_by_user_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE,
  CHECK (ends_on >= starts_on)
);

CREATE INDEX calendar_overrides_effective_idx
  ON calendar_overrides(workspace_id, status, starts_on, ends_on, source_scope);

-- Official calendar and override rows may also be projected into calendar_events for UI.
-- These guards keep source references inside the same physical workspace.
CREATE TRIGGER calendar_official_source_guard_insert
BEFORE INSERT ON calendar_events
FOR EACH ROW
WHEN NEW.source_entity_type = 'official_calendar' AND NOT EXISTS (
  SELECT 1 FROM official_calendar_events e
  WHERE e.id = NEW.source_entity_id AND e.workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'calendar_official_source_mismatch');
END;

CREATE TRIGGER calendar_override_source_guard_insert
BEFORE INSERT ON calendar_events
FOR EACH ROW
WHEN NEW.source_entity_type = 'calendar_override' AND NOT EXISTS (
  SELECT 1 FROM calendar_overrides o
  WHERE o.id = NEW.source_entity_id AND o.workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'calendar_override_source_mismatch');
END;

PRAGMA foreign_keys = ON;

-- Every physical workspace database must be explicitly claimed by exactly one workspace.
-- Provisioning seeds this row after database creation and before operational writes.
CREATE TABLE workspace_identity (
  singleton_key TEXT PRIMARY KEY NOT NULL DEFAULT 'workspace' CHECK (singleton_key = 'workspace'),
  workspace_id TEXT NOT NULL UNIQUE,
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version >= 1),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE workspace_settings (
  workspace_id TEXT NOT NULL,
  setting_key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_by_user_id TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, setting_key),
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE
);

-- Non-authoritative projection/reference used by workspace-local reporting and assignment.
-- Authentication, membership status, roles and permissions remain authoritative in CONTROL_DB.
CREATE TABLE workspace_member_refs (
  membership_id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'archived')),
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE
);

CREATE INDEX workspace_member_refs_user_id_idx ON workspace_member_refs(user_id);

CREATE TABLE organization_units (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  parent_id TEXT,
  name TEXT NOT NULL,
  unit_type TEXT NOT NULL CHECK (unit_type IN ('region', 'area', 'district', 'team', 'custom')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES organization_units(id) ON DELETE RESTRICT
);

CREATE INDEX organization_units_parent_id_idx ON organization_units(parent_id);
CREATE INDEX organization_units_workspace_status_idx ON organization_units(workspace_id, status);

CREATE TABLE organization_memberships (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  organization_unit_id TEXT NOT NULL,
  membership_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL DEFAULT 'member' CHECK (relationship_type IN ('member', 'supervisor', 'manager', 'owner', 'custom')),
  starts_at INTEGER,
  ends_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE,
  FOREIGN KEY (organization_unit_id) REFERENCES organization_units(id) ON DELETE RESTRICT,
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at),
  UNIQUE (organization_unit_id, membership_id, relationship_type)
);

CREATE INDEX organization_memberships_membership_idx ON organization_memberships(membership_id);
CREATE INDEX organization_memberships_user_idx ON organization_memberships(user_id);

CREATE TRIGGER organization_memberships_workspace_match_insert
BEFORE INSERT ON organization_memberships
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM organization_units
  WHERE id = NEW.organization_unit_id AND workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'organization_membership_workspace_mismatch');
END;

CREATE TRIGGER organization_memberships_workspace_match_update
BEFORE UPDATE OF workspace_id, organization_unit_id ON organization_memberships
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM organization_units
  WHERE id = NEW.organization_unit_id AND workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'organization_membership_workspace_mismatch');
END;

CREATE TABLE workspace_audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  actor_user_id TEXT,
  action_key TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata_json TEXT,
  occurred_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE
);

CREATE INDEX workspace_audit_events_actor_idx ON workspace_audit_events(actor_user_id, occurred_at);
CREATE INDEX workspace_audit_events_entity_idx ON workspace_audit_events(entity_type, entity_id, occurred_at);
CREATE INDEX workspace_audit_events_action_idx ON workspace_audit_events(action_key, occurred_at);

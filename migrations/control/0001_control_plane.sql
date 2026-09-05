PRAGMA foreign_keys = ON;

-- Better Auth core schema. Keep core column names aligned with Better Auth defaults.
CREATE TABLE "user" (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  emailVerified INTEGER NOT NULL DEFAULT 0 CHECK (emailVerified IN (0, 1)),
  image TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE session (
  id TEXT PRIMARY KEY NOT NULL,
  userId TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expiresAt INTEGER NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  FOREIGN KEY (userId) REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE INDEX session_user_id_idx ON session(userId);
CREATE INDEX session_expires_at_idx ON session(expiresAt);

CREATE TABLE account (
  id TEXT PRIMARY KEY NOT NULL,
  userId TEXT NOT NULL,
  issuer TEXT NOT NULL,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  accessToken TEXT,
  refreshToken TEXT,
  accessTokenExpiresAt INTEGER,
  refreshTokenExpiresAt INTEGER,
  scope TEXT,
  idToken TEXT,
  password TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  FOREIGN KEY (userId) REFERENCES "user"(id) ON DELETE CASCADE,
  UNIQUE (issuer, accountId)
);

CREATE INDEX account_user_id_idx ON account(userId);
CREATE INDEX account_provider_id_idx ON account(providerId);

CREATE TABLE verification (
  id TEXT PRIMARY KEY NOT NULL,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE INDEX verification_identifier_idx ON verification(identifier);
CREATE INDEX verification_expires_at_idx ON verification(expiresAt);

-- FieldRep OS platform identity state is intentionally separate from Better Auth's core user row.
CREATE TABLE platform_user_state (
  user_id TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'disabled', 'locked', 'archived')),
  preferred_locale TEXT NOT NULL DEFAULT 'fa-IR',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE TABLE companies (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
  legal_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  country TEXT,
  locale TEXT NOT NULL DEFAULT 'fa-IR',
  timezone TEXT NOT NULL DEFAULT 'Asia/Tehran',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY NOT NULL,
  company_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL COLLATE NOCASE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  default_locale TEXT NOT NULL DEFAULT 'fa-IR',
  default_timezone TEXT NOT NULL DEFAULT 'Asia/Tehran',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,
  UNIQUE (company_id, slug)
);

CREATE INDEX workspaces_company_id_idx ON workspaces(company_id);

CREATE TABLE memberships (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('active', 'invited', 'disabled', 'archived')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  UNIQUE (user_id, workspace_id)
);

CREATE INDEX memberships_user_id_idx ON memberships(user_id);
CREATE INDEX memberships_workspace_id_idx ON memberships(workspace_id);
CREATE INDEX memberships_company_id_idx ON memberships(company_id);

CREATE TRIGGER memberships_company_workspace_match_insert
BEFORE INSERT ON memberships
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM workspaces
  WHERE id = NEW.workspace_id AND company_id = NEW.company_id
)
BEGIN
  SELECT RAISE(ABORT, 'membership_company_workspace_mismatch');
END;

CREATE TRIGGER memberships_company_workspace_match_update
BEFORE UPDATE OF company_id, workspace_id ON memberships
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM workspaces
  WHERE id = NEW.workspace_id AND company_id = NEW.company_id
)
BEGIN
  SELECT RAISE(ABORT, 'membership_company_workspace_mismatch');
END;

CREATE TABLE roles (
  id TEXT PRIMARY KEY NOT NULL,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('platform', 'company', 'workspace')),
  is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE permissions (
  id TEXT PRIMARY KEY NOT NULL,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE role_permissions (
  role_id TEXT NOT NULL,
  permission_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

CREATE TABLE membership_roles (
  membership_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (membership_id, role_id),
  FOREIGN KEY (membership_id) REFERENCES memberships(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT
);

CREATE TABLE scope_grants (
  id TEXT PRIMARY KEY NOT NULL,
  membership_id TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('platform', 'company', 'workspace', 'organization_unit', 'user', 'self')),
  scope_id TEXT,
  include_descendants INTEGER NOT NULL DEFAULT 0 CHECK (include_descendants IN (0, 1)),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (membership_id) REFERENCES memberships(id) ON DELETE CASCADE,
  CHECK (
    (scope_type IN ('platform', 'self') AND scope_id IS NULL)
    OR
    (scope_type IN ('company', 'workspace', 'organization_unit', 'user') AND scope_id IS NOT NULL)
  )
);

CREATE INDEX scope_grants_membership_id_idx ON scope_grants(membership_id);
CREATE INDEX scope_grants_scope_lookup_idx ON scope_grants(scope_type, scope_id);

CREATE TABLE feature_entitlements (
  id TEXT PRIMARY KEY NOT NULL,
  company_id TEXT NOT NULL,
  workspace_id TEXT,
  feature_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'enabled' CHECK (status IN ('enabled', 'disabled', 'scheduled', 'expired')),
  config_json TEXT,
  starts_at INTEGER,
  ends_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at)
);

CREATE UNIQUE INDEX feature_entitlements_company_unique
ON feature_entitlements(company_id, feature_key)
WHERE workspace_id IS NULL;

CREATE UNIQUE INDEX feature_entitlements_workspace_unique
ON feature_entitlements(workspace_id, feature_key)
WHERE workspace_id IS NOT NULL;

CREATE TRIGGER feature_entitlements_company_workspace_match_insert
BEFORE INSERT ON feature_entitlements
FOR EACH ROW
WHEN NEW.workspace_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM workspaces
  WHERE id = NEW.workspace_id AND company_id = NEW.company_id
)
BEGIN
  SELECT RAISE(ABORT, 'entitlement_company_workspace_mismatch');
END;

CREATE TRIGGER feature_entitlements_company_workspace_match_update
BEFORE UPDATE OF company_id, workspace_id ON feature_entitlements
FOR EACH ROW
WHEN NEW.workspace_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM workspaces
  WHERE id = NEW.workspace_id AND company_id = NEW.company_id
)
BEGIN
  SELECT RAISE(ABORT, 'entitlement_company_workspace_mismatch');
END;

CREATE TABLE workspace_data_routes (
  workspace_id TEXT PRIMARY KEY NOT NULL,
  store_type TEXT NOT NULL CHECK (store_type IN ('d1', 'service', 'sql', 'other')),
  store_identifier TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'disabled')),
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version >= 1),
  metadata_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX workspace_data_routes_store_idx ON workspace_data_routes(store_type, store_identifier);

CREATE TABLE platform_audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  actor_user_id TEXT,
  action_key TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  company_id TEXT,
  workspace_id TEXT,
  metadata_json TEXT,
  occurred_at INTEGER NOT NULL,
  FOREIGN KEY (actor_user_id) REFERENCES "user"(id) ON DELETE SET NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
);

CREATE INDEX platform_audit_events_actor_idx ON platform_audit_events(actor_user_id, occurred_at);
CREATE INDEX platform_audit_events_workspace_idx ON platform_audit_events(workspace_id, occurred_at);
CREATE INDEX platform_audit_events_action_idx ON platform_audit_events(action_key, occurred_at);

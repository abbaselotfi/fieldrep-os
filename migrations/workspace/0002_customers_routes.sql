PRAGMA foreign_keys = ON;

CREATE TABLE routes (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  code TEXT,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE,
  UNIQUE (workspace_id, code)
);

CREATE INDEX routes_workspace_status_name_idx ON routes(workspace_id, status, name);

CREATE TABLE customers (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  customer_type TEXT NOT NULL CHECK (customer_type IN ('doctor', 'pharmacy', 'hospital', 'clinic', 'laboratory', 'other')),
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  record_scope TEXT NOT NULL DEFAULT 'workspace' CHECK (record_scope IN ('workspace', 'user')),
  source TEXT NOT NULL DEFAULT 'company' CHECK (source IN ('company', 'user', 'platform_dataset', 'import')),
  owner_user_id TEXT,
  external_source_id TEXT,
  created_by_user_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE,
  CHECK (
    (record_scope = 'workspace' AND owner_user_id IS NULL)
    OR (record_scope = 'user' AND owner_user_id IS NOT NULL)
  )
);

CREATE INDEX customers_workspace_status_name_idx ON customers(workspace_id, status, display_name);
CREATE INDEX customers_workspace_owner_idx ON customers(workspace_id, owner_user_id, status);
CREATE INDEX customers_workspace_type_idx ON customers(workspace_id, customer_type, status);

CREATE TABLE customer_doctor_profiles (
  customer_id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  specialty TEXT,
  class_key TEXT,
  required_frequency INTEGER NOT NULL DEFAULT 0 CHECK (required_frequency >= 0),
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE
);

CREATE INDEX customer_doctor_profiles_workspace_specialty_idx ON customer_doctor_profiles(workspace_id, specialty);
CREATE INDEX customer_doctor_profiles_workspace_class_idx ON customer_doctor_profiles(workspace_id, class_key);

CREATE TRIGGER customer_doctor_profiles_customer_guard_insert
BEFORE INSERT ON customer_doctor_profiles
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM customers
  WHERE id = NEW.customer_id
    AND workspace_id = NEW.workspace_id
    AND customer_type = 'doctor'
)
BEGIN
  SELECT RAISE(ABORT, 'doctor_profile_customer_mismatch');
END;

CREATE TRIGGER customer_doctor_profiles_customer_guard_update
BEFORE UPDATE OF customer_id, workspace_id ON customer_doctor_profiles
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM customers
  WHERE id = NEW.customer_id
    AND workspace_id = NEW.workspace_id
    AND customer_type = 'doctor'
)
BEGIN
  SELECT RAISE(ABORT, 'doctor_profile_customer_mismatch');
END;

CREATE TABLE customer_route_assignments (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  route_id TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE,
  UNIQUE (customer_id, route_id)
);

CREATE INDEX customer_route_assignments_workspace_route_idx ON customer_route_assignments(workspace_id, route_id, customer_id);
CREATE UNIQUE INDEX customer_route_assignments_one_primary_idx
  ON customer_route_assignments(customer_id)
  WHERE is_primary = 1;

CREATE TRIGGER customer_route_assignments_workspace_guard_insert
BEFORE INSERT ON customer_route_assignments
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM customers c
  JOIN routes r ON r.id = NEW.route_id
  WHERE c.id = NEW.customer_id
    AND c.workspace_id = NEW.workspace_id
    AND r.workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'customer_route_workspace_mismatch');
END;

CREATE TRIGGER customer_route_assignments_workspace_guard_update
BEFORE UPDATE OF workspace_id, customer_id, route_id ON customer_route_assignments
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM customers c
  JOIN routes r ON r.id = NEW.route_id
  WHERE c.id = NEW.customer_id
    AND c.workspace_id = NEW.workspace_id
    AND r.workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'customer_route_workspace_mismatch');
END;

CREATE TABLE customer_locations (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  label TEXT NOT NULL,
  address TEXT,
  province TEXT,
  city TEXT,
  district TEXT,
  latitude REAL CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  longitude REAL CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  source TEXT NOT NULL DEFAULT 'company' CHECK (source IN ('company', 'user', 'platform_dataset', 'import')),
  created_by_user_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE INDEX customer_locations_customer_status_idx ON customer_locations(customer_id, status);
CREATE INDEX customer_locations_workspace_city_idx ON customer_locations(workspace_id, city, status);
CREATE UNIQUE INDEX customer_locations_one_primary_idx
  ON customer_locations(customer_id)
  WHERE is_primary = 1 AND status = 'active';

CREATE TRIGGER customer_locations_workspace_guard_insert
BEFORE INSERT ON customer_locations
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM customers
  WHERE id = NEW.customer_id AND workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'customer_location_workspace_mismatch');
END;

CREATE TRIGGER customer_locations_workspace_guard_update
BEFORE UPDATE OF workspace_id, customer_id ON customer_locations
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM customers
  WHERE id = NEW.customer_id AND workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'customer_location_workspace_mismatch');
END;

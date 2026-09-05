PRAGMA foreign_keys = ON;

CREATE TABLE products (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  code TEXT,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE,
  UNIQUE (workspace_id, name)
);

CREATE UNIQUE INDEX products_workspace_code_unique_idx
  ON products(workspace_id, code)
  WHERE code IS NOT NULL;
CREATE INDEX products_workspace_status_idx
  ON products(workspace_id, status, sort_order, name);

CREATE TABLE visits (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  plan_entry_id TEXT,
  visit_date TEXT NOT NULL CHECK (
    length(visit_date) = 10
    AND visit_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  occurred_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'cancelled')),
  source TEXT NOT NULL CHECK (source IN ('planned', 'unplanned')),
  notes TEXT,
  location_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
  FOREIGN KEY (plan_entry_id) REFERENCES plan_entries(id) ON DELETE RESTRICT,
  FOREIGN KEY (location_id) REFERENCES customer_locations(id) ON DELETE RESTRICT,
  CHECK (
    (source = 'planned' AND plan_entry_id IS NOT NULL)
    OR (source = 'unplanned' AND plan_entry_id IS NULL)
  )
);

CREATE INDEX visits_owner_date_idx
  ON visits(workspace_id, owner_user_id, visit_date, status);
CREATE INDEX visits_customer_date_idx
  ON visits(workspace_id, owner_user_id, customer_id, visit_date);
CREATE UNIQUE INDEX visits_plan_entry_active_unique_idx
  ON visits(plan_entry_id)
  WHERE plan_entry_id IS NOT NULL AND status = 'completed';

CREATE TABLE visit_product_calls (
  visit_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  call_count INTEGER NOT NULL DEFAULT 1 CHECK (call_count > 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (visit_id, product_id),
  FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);

CREATE INDEX visit_product_calls_product_idx
  ON visit_product_calls(workspace_id, product_id, visit_id);

CREATE TRIGGER visits_customer_scope_guard_insert
BEFORE INSERT ON visits
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM customers c
  WHERE c.id = NEW.customer_id
    AND c.workspace_id = NEW.workspace_id
    AND c.status = 'active'
    AND (
      c.record_scope = 'workspace'
      OR (c.record_scope = 'user' AND c.owner_user_id = NEW.owner_user_id)
    )
)
BEGIN
  SELECT RAISE(ABORT, 'visit_customer_scope_mismatch');
END;

CREATE TRIGGER visits_customer_scope_guard_update
BEFORE UPDATE OF workspace_id, owner_user_id, customer_id ON visits
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM customers c
  WHERE c.id = NEW.customer_id
    AND c.workspace_id = NEW.workspace_id
    AND c.status = 'active'
    AND (
      c.record_scope = 'workspace'
      OR (c.record_scope = 'user' AND c.owner_user_id = NEW.owner_user_id)
    )
)
BEGIN
  SELECT RAISE(ABORT, 'visit_customer_scope_mismatch');
END;

CREATE TRIGGER visits_plan_scope_guard_insert
BEFORE INSERT ON visits
FOR EACH ROW
WHEN NEW.plan_entry_id IS NOT NULL AND NOT EXISTS (
  SELECT 1
  FROM plan_entries p
  WHERE p.id = NEW.plan_entry_id
    AND p.workspace_id = NEW.workspace_id
    AND p.owner_user_id = NEW.owner_user_id
    AND p.customer_id = NEW.customer_id
    AND p.status IN ('planned', 'completed')
)
BEGIN
  SELECT RAISE(ABORT, 'visit_plan_scope_mismatch');
END;

CREATE TRIGGER visits_plan_scope_guard_update
BEFORE UPDATE OF workspace_id, owner_user_id, customer_id, plan_entry_id ON visits
FOR EACH ROW
WHEN NEW.plan_entry_id IS NOT NULL AND NOT EXISTS (
  SELECT 1
  FROM plan_entries p
  WHERE p.id = NEW.plan_entry_id
    AND p.workspace_id = NEW.workspace_id
    AND p.owner_user_id = NEW.owner_user_id
    AND p.customer_id = NEW.customer_id
    AND p.status IN ('planned', 'completed')
)
BEGIN
  SELECT RAISE(ABORT, 'visit_plan_scope_mismatch');
END;

CREATE TRIGGER visits_location_scope_guard_insert
BEFORE INSERT ON visits
FOR EACH ROW
WHEN NEW.location_id IS NOT NULL AND NOT EXISTS (
  SELECT 1
  FROM customer_locations l
  WHERE l.id = NEW.location_id
    AND l.workspace_id = NEW.workspace_id
    AND l.customer_id = NEW.customer_id
)
BEGIN
  SELECT RAISE(ABORT, 'visit_location_scope_mismatch');
END;

CREATE TRIGGER visits_location_scope_guard_update
BEFORE UPDATE OF workspace_id, customer_id, location_id ON visits
FOR EACH ROW
WHEN NEW.location_id IS NOT NULL AND NOT EXISTS (
  SELECT 1
  FROM customer_locations l
  WHERE l.id = NEW.location_id
    AND l.workspace_id = NEW.workspace_id
    AND l.customer_id = NEW.customer_id
)
BEGIN
  SELECT RAISE(ABORT, 'visit_location_scope_mismatch');
END;

CREATE TRIGGER visit_product_calls_scope_guard_insert
BEFORE INSERT ON visit_product_calls
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM visits v
  WHERE v.id = NEW.visit_id AND v.workspace_id = NEW.workspace_id
) OR NOT EXISTS (
  SELECT 1 FROM products p
  WHERE p.id = NEW.product_id
    AND p.workspace_id = NEW.workspace_id
    AND p.status = 'active'
)
BEGIN
  SELECT RAISE(ABORT, 'visit_product_scope_mismatch');
END;

CREATE TRIGGER visit_product_calls_scope_guard_update
BEFORE UPDATE OF visit_id, workspace_id, product_id ON visit_product_calls
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM visits v
  WHERE v.id = NEW.visit_id AND v.workspace_id = NEW.workspace_id
) OR NOT EXISTS (
  SELECT 1 FROM products p
  WHERE p.id = NEW.product_id
    AND p.workspace_id = NEW.workspace_id
    AND p.status = 'active'
)
BEGIN
  SELECT RAISE(ABORT, 'visit_product_scope_mismatch');
END;

CREATE TRIGGER visits_mark_plan_completed_insert
AFTER INSERT ON visits
FOR EACH ROW
WHEN NEW.status = 'completed' AND NEW.plan_entry_id IS NOT NULL
BEGIN
  UPDATE plan_entries
  SET status = 'completed', updated_at = NEW.updated_at
  WHERE id = NEW.plan_entry_id
    AND workspace_id = NEW.workspace_id
    AND owner_user_id = NEW.owner_user_id;
END;

CREATE TRIGGER visits_mark_plan_completed_update
AFTER UPDATE OF status, plan_entry_id ON visits
FOR EACH ROW
WHEN NEW.status = 'completed' AND NEW.plan_entry_id IS NOT NULL
BEGIN
  UPDATE plan_entries
  SET status = 'completed', updated_at = NEW.updated_at
  WHERE id = NEW.plan_entry_id
    AND workspace_id = NEW.workspace_id
    AND owner_user_id = NEW.owner_user_id;
END;

CREATE TRIGGER visits_restore_plan_after_cancel
AFTER UPDATE OF status ON visits
FOR EACH ROW
WHEN OLD.status = 'completed' AND NEW.status = 'cancelled' AND NEW.plan_entry_id IS NOT NULL
BEGIN
  UPDATE plan_entries
  SET status = 'planned', updated_at = NEW.updated_at
  WHERE id = NEW.plan_entry_id
    AND workspace_id = NEW.workspace_id
    AND owner_user_id = NEW.owner_user_id
    AND NOT EXISTS (
      SELECT 1 FROM visits v
      WHERE v.plan_entry_id = NEW.plan_entry_id
        AND v.status = 'completed'
        AND v.id <> NEW.id
    );
END;

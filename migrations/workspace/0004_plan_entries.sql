PRAGMA foreign_keys = ON;

CREATE TABLE plan_entries (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  planning_cycle_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  plan_date TEXT NOT NULL CHECK (
    length(plan_date) = 10
    AND plan_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  route_id TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (
    status IN ('planned', 'completed', 'missed', 'cancelled', 'rescheduled')
  ),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (
    source IN ('manual', 'suggested', 'imported')
  ),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE,
  FOREIGN KEY (planning_cycle_id) REFERENCES planning_cycles(id) ON DELETE RESTRICT,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
  FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE RESTRICT
);

CREATE INDEX plan_entries_owner_date_idx
  ON plan_entries(workspace_id, owner_user_id, plan_date, status);
CREATE INDEX plan_entries_cycle_owner_idx
  ON plan_entries(workspace_id, planning_cycle_id, owner_user_id, plan_date);
CREATE INDEX plan_entries_customer_idx
  ON plan_entries(workspace_id, owner_user_id, customer_id, plan_date);

-- Excel parity: a representative cannot have the same active/completed customer twice on one day.
-- Cancelled/rescheduled/missed history does not block creating a replacement plan.
CREATE UNIQUE INDEX plan_entries_same_day_active_unique_idx
  ON plan_entries(workspace_id, owner_user_id, customer_id, plan_date)
  WHERE status IN ('planned', 'completed');

CREATE TRIGGER plan_entries_cycle_guard_insert
BEFORE INSERT ON plan_entries
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM planning_cycles pc
  WHERE pc.id = NEW.planning_cycle_id
    AND pc.workspace_id = NEW.workspace_id
    AND NEW.plan_date BETWEEN pc.starts_on AND pc.ends_on
    AND pc.status <> 'archived'
)
BEGIN
  SELECT RAISE(ABORT, 'plan_cycle_mismatch');
END;

CREATE TRIGGER plan_entries_cycle_guard_update
BEFORE UPDATE OF workspace_id, planning_cycle_id, plan_date ON plan_entries
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM planning_cycles pc
  WHERE pc.id = NEW.planning_cycle_id
    AND pc.workspace_id = NEW.workspace_id
    AND NEW.plan_date BETWEEN pc.starts_on AND pc.ends_on
    AND pc.status <> 'archived'
)
BEGIN
  SELECT RAISE(ABORT, 'plan_cycle_mismatch');
END;

CREATE TRIGGER plan_entries_customer_guard_insert
BEFORE INSERT ON plan_entries
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
  SELECT RAISE(ABORT, 'plan_customer_scope_mismatch');
END;

CREATE TRIGGER plan_entries_customer_guard_update
BEFORE UPDATE OF workspace_id, owner_user_id, customer_id ON plan_entries
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
  SELECT RAISE(ABORT, 'plan_customer_scope_mismatch');
END;

CREATE TRIGGER plan_entries_route_guard_insert
BEFORE INSERT ON plan_entries
FOR EACH ROW
WHEN NEW.route_id IS NOT NULL AND NOT EXISTS (
  SELECT 1
  FROM routes r
  WHERE r.id = NEW.route_id
    AND r.workspace_id = NEW.workspace_id
    AND r.status = 'active'
)
BEGIN
  SELECT RAISE(ABORT, 'plan_route_workspace_mismatch');
END;

CREATE TRIGGER plan_entries_route_guard_update
BEFORE UPDATE OF workspace_id, route_id ON plan_entries
FOR EACH ROW
WHEN NEW.route_id IS NOT NULL AND NOT EXISTS (
  SELECT 1
  FROM routes r
  WHERE r.id = NEW.route_id
    AND r.workspace_id = NEW.workspace_id
    AND r.status = 'active'
)
BEGIN
  SELECT RAISE(ABORT, 'plan_route_workspace_mismatch');
END;

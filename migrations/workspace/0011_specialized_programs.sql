PRAGMA foreign_keys = ON;

CREATE TABLE company_programs (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  program_type TEXT NOT NULL CHECK (
    program_type IN ('launch','workshop','training','conference','sales_meeting','cycle_meeting','other')
  ),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description TEXT,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  local_start_date TEXT NOT NULL,
  local_end_date TEXT NOT NULL,
  all_day INTEGER NOT NULL DEFAULT 0 CHECK (all_day IN (0,1)),
  scope_type TEXT NOT NULL CHECK (
    scope_type IN ('company','workspace','organization_unit','selected_users','user')
  ),
  scope_id TEXT,
  location_text TEXT,
  counts_as_working_activity INTEGER NOT NULL DEFAULT 1 CHECK (counts_as_working_activity IN (0,1)),
  blocks_planning INTEGER NOT NULL DEFAULT 0 CHECK (blocks_planning IN (0,1)),
  appears_in_report INTEGER NOT NULL DEFAULT 1 CHECK (appears_in_report IN (0,1)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','completed','cancelled')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE,
  CHECK (ends_at >= starts_at),
  CHECK (local_end_date >= local_start_date),
  CHECK (
    (scope_type = 'selected_users' AND scope_id IS NULL)
    OR (scope_type IN ('company','workspace','organization_unit','user') AND scope_id IS NOT NULL)
  ),
  CHECK (scope_type <> 'workspace' OR scope_id = workspace_id)
);

CREATE INDEX company_programs_workspace_date_idx
  ON company_programs(workspace_id, local_start_date, local_end_date, status);

CREATE TABLE company_program_users (
  workspace_id TEXT NOT NULL,
  company_program_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  participant_role TEXT NOT NULL DEFAULT 'attendee' CHECK (
    participant_role IN ('owner','attendee','required','optional','speaker')
  ),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (company_program_id, user_id),
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE,
  FOREIGN KEY (company_program_id) REFERENCES company_programs(id) ON DELETE CASCADE
);

CREATE TRIGGER company_program_user_workspace_guard_insert
BEFORE INSERT ON company_program_users
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM company_programs p
  WHERE p.id = NEW.company_program_id AND p.workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'company_program_user_workspace_mismatch');
END;

CREATE TABLE doctor_programs (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  program_type TEXT NOT NULL CHECK (
    program_type IN ('rtd','dinner_meeting','workshop','conference','webinar','hospital_meeting','speaker_program','one_to_one','custom')
  ),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description TEXT,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  local_start_date TEXT NOT NULL,
  local_end_date TEXT NOT NULL,
  all_day INTEGER NOT NULL DEFAULT 0 CHECK (all_day IN (0,1)),
  location_text TEXT,
  cost_amount_minor INTEGER CHECK (cost_amount_minor IS NULL OR cost_amount_minor >= 0),
  currency_code TEXT CHECK (currency_code IS NULL OR length(currency_code) = 3),
  report_text TEXT,
  counts_as_working_activity INTEGER NOT NULL DEFAULT 1 CHECK (counts_as_working_activity IN (0,1)),
  blocks_planning INTEGER NOT NULL DEFAULT 0 CHECK (blocks_planning IN (0,1)),
  appears_in_report INTEGER NOT NULL DEFAULT 1 CHECK (appears_in_report IN (0,1)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','completed','cancelled')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE,
  CHECK (ends_at >= starts_at),
  CHECK (local_end_date >= local_start_date),
  CHECK ((cost_amount_minor IS NULL) = (currency_code IS NULL))
);

CREATE INDEX doctor_programs_workspace_date_idx
  ON doctor_programs(workspace_id, local_start_date, local_end_date, status);

CREATE TABLE doctor_program_doctors (
  workspace_id TEXT NOT NULL,
  doctor_program_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  attendance_status TEXT NOT NULL DEFAULT 'invited' CHECK (
    attendance_status IN ('invited','confirmed','attended','absent','cancelled')
  ),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (doctor_program_id, customer_id),
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE,
  FOREIGN KEY (doctor_program_id) REFERENCES doctor_programs(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT
);

CREATE TRIGGER doctor_program_doctor_guard_insert
BEFORE INSERT ON doctor_program_doctors
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM doctor_programs p
  JOIN customers c ON c.id = NEW.customer_id
  WHERE p.id = NEW.doctor_program_id
    AND p.workspace_id = NEW.workspace_id
    AND c.workspace_id = NEW.workspace_id
    AND c.customer_type = 'doctor'
)
BEGIN
  SELECT RAISE(ABORT, 'doctor_program_doctor_workspace_or_type_mismatch');
END;

CREATE TABLE doctor_program_products (
  workspace_id TEXT NOT NULL,
  doctor_program_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (doctor_program_id, product_id),
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE,
  FOREIGN KEY (doctor_program_id) REFERENCES doctor_programs(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);

CREATE TRIGGER doctor_program_product_guard_insert
BEFORE INSERT ON doctor_program_products
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM doctor_programs p
  JOIN products pr ON pr.id = NEW.product_id
  WHERE p.id = NEW.doctor_program_id
    AND p.workspace_id = NEW.workspace_id
    AND pr.workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'doctor_program_product_workspace_mismatch');
END;

CREATE TABLE doctor_program_users (
  workspace_id TEXT NOT NULL,
  doctor_program_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  participant_role TEXT NOT NULL DEFAULT 'attendee' CHECK (
    participant_role IN ('owner','attendee','required','optional','speaker')
  ),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (doctor_program_id, user_id),
  FOREIGN KEY (workspace_id) REFERENCES workspace_identity(workspace_id) ON DELETE CASCADE,
  FOREIGN KEY (doctor_program_id) REFERENCES doctor_programs(id) ON DELETE CASCADE
);

CREATE TRIGGER doctor_program_user_workspace_guard_insert
BEFORE INSERT ON doctor_program_users
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM doctor_programs p
  WHERE p.id = NEW.doctor_program_id AND p.workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'doctor_program_user_workspace_mismatch');
END;

CREATE TRIGGER calendar_company_program_source_guard_insert
BEFORE INSERT ON calendar_events
FOR EACH ROW
WHEN NEW.source_entity_type = 'company_program' AND NOT EXISTS (
  SELECT 1 FROM company_programs p
  WHERE p.id = NEW.source_entity_id AND p.workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'calendar_company_program_source_mismatch');
END;

CREATE TRIGGER calendar_doctor_program_source_guard_insert
BEFORE INSERT ON calendar_events
FOR EACH ROW
WHEN NEW.source_entity_type = 'doctor_program' AND NOT EXISTS (
  SELECT 1 FROM doctor_programs p
  WHERE p.id = NEW.source_entity_id AND p.workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'calendar_doctor_program_source_mismatch');
END;

CREATE TRIGGER calendar_program_kpi_guard_insert
BEFORE INSERT ON calendar_events
FOR EACH ROW
WHEN NEW.source_entity_type IN ('company_program','doctor_program') AND NEW.counts_as_visit <> 0
BEGIN
  SELECT RAISE(ABORT, 'program_calendar_event_cannot_count_as_visit');
END;

CREATE TRIGGER calendar_program_kpi_guard_update
BEFORE UPDATE OF source_entity_type, counts_as_visit ON calendar_events
FOR EACH ROW
WHEN NEW.source_entity_type IN ('company_program','doctor_program') AND NEW.counts_as_visit <> 0
BEGIN
  SELECT RAISE(ABORT, 'program_calendar_event_cannot_count_as_visit');
END;

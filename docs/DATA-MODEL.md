# FieldRep OS — Conceptual Domain & Data Model

**Phase:** P0-A4 — Domain/Data Model  
**Status:** Conceptual schema baseline; not yet a migration specification

---

## 1. Purpose

This document defines stable domain boundaries, ownership, identifiers, and core relationships before implementation migrations are created.

The model must support:

- Multiple companies
- Multiple workspaces per company
- Separate physical workspace databases
- Hierarchical teams
- Global user identities with scoped memberships
- Shared/canonical practitioner identity
- Workspace-specific doctor classification/frequency
- Multiple customer locations
- Excel-parity planning/reporting
- Operational calendar and activities
- Offline synchronization
- Maps/location evidence
- Future AI recommendations
- Dataset catalog/version/assignment

The physical schema may evolve during implementation, but entity ownership and domain meaning should remain stable.

---

# 2. Data-Plane Separation

FieldRep OS uses two primary logical planes.

## 2.1 Control Plane

Platform-level identity, tenancy, permissions, routing, licensing, datasets, and privileged audit.

Conceptual entities:

```text
users
companies
workspaces
memberships
roles
permissions
role_permissions
membership_roles
scope_grants
feature_entitlements
workspace_data_routes
platform_audit_events

datasets
dataset_versions
dataset_assignments
dataset_imports
dataset_sources
```

## 2.2 Workspace Data Plane

Operational data belonging to one workspace.

Conceptual entities:

```text
organization_units
organization_memberships
workspace_settings
workspace_users_projection/reference

workspace_practitioners
workspace_locations
products
routes
territories
planning_cycles
targets

plans
plan_days
plan_entries
visits
visit_products
visit_reports

calendar_events
calendar_attendees
working_calendar_rules
calendar_overrides
leave_requests
business_trips
company_programs
doctor_programs

visit_location_evidence

devices
sync_operations
sync_checkpoints

recommendation_batches
visit_suggestions
recommendation_feedback

workspace_audit_events / domain_history where required
```

---

# 3. Identifier Strategy

All durable domain entities should use globally unique opaque identifiers.

Preferred logical shape:

```text
UUID/ULID-style string identifiers
```

Do not expose sequential database row IDs as cross-service/domain identity.

Benefits:

- Safe client-side/offline ID creation where approved
- Easier sync
- Easier cross-database references
- No collision when records originate in different workspace databases

The exact UUID/ULID library/format is finalized in an ADR.

---

# 4. Timestamp and Date Strategy

Persist canonical timestamps in a timezone-safe backend representation.

User-facing dates are Jalali in the initial Persian UI.

Do not persist Jalali date strings as the canonical event timestamp.

Important fields should distinguish:

```text
occurred_at
created_at
updated_at
captured_at
server_received_at
synced_at
```

when those meanings differ.

For date-only business rules (for example company closure day), store a canonical local-calendar date with explicit workspace timezone semantics rather than inferring from UTC midnight.

---

# 5. Control Plane Entities

## 5.1 `users`

Global human/application identity.

Conceptual fields:

```text
id
email / login identifier
password credential reference/hash fields
status
preferred_locale
created_at
updated_at
```

Potential states:

```text
active
invited
disabled
locked
archived
```

User identity alone grants no workspace data access.

---

## 5.2 `companies`

```text
id
name
slug
legal_name
status
country
locale
timezone
created_at
updated_at
```

Ownership: platform.

---

## 5.3 `workspaces`

```text
id
company_id
name
slug
status
default_locale
default_timezone
created_at
updated_at
```

Examples:

```text
Diabetes
Cardiology
Neurology
```

Ownership: company, registered in control plane.

A workspace is a strong operational isolation boundary.

---

## 5.4 `memberships`

Connect a user to a company/workspace authorization context.

```text
id
user_id
company_id
workspace_id
status
created_at
updated_at
```

Role and scope are not stored as a single hard-coded `role` field on the user.

---

## 5.5 `roles`

```text
id
key
name
level/type
is_system
```

Initial system role keys:

```text
platform_admin
company_admin
workspace_admin
supervisor
user
```

Custom role support may be introduced later while retaining permission-based enforcement.

---

## 5.6 `permissions`

```text
id
key
name
description
```

Examples:

```text
plans.read.own
reports.read.team
customers.manage.workspace
platform.datasets.export
```

---

## 5.7 `role_permissions`

```text
role_id
permission_id
```

Role bundles define defaults; effective authorization also requires applicable scopes.

---

## 5.8 `membership_roles`

Allows a membership to have one or more role bundles if needed.

```text
membership_id
role_id
```

This avoids assuming that `Supervisor` and `Field User` must always be mutually exclusive identities.

---

## 5.9 `scope_grants`

```text
id
membership_id
scope_type
scope_id
include_descendants
created_at
```

`scope_type` examples:

```text
platform
company
workspace
organization_unit
user
self
```

---

## 5.10 `feature_entitlements`

```text
id
company_id
workspace_id nullable
feature_key
status/config
starts_at
ends_at
```

Examples:

```text
planner
reports
offline_pwa
maps
route_optimization
visit_location_verification
ai_planning
advanced_analytics
```

Feature entitlement is separate from user permission.

---

## 5.11 `workspace_data_routes`

Authoritative control-plane mapping from workspace to physical data store.

```text
workspace_id
store_type
store_identifier
status
schema_version
metadata
updated_at
```

Application services resolve this record through the workspace database router.

---

# 6. Dataset / Master Registry Entities

## 6.1 `datasets`

Logical collection of reference records.

```text
id
owner_type
owner_id
name
dataset_type
status
source_type
created_at
```

Dataset types may include:

```text
practitioners
pharmacies
hospitals
clinics
mixed/custom
```

---

## 6.2 `dataset_sources`

Provenance/license/source metadata.

```text
id
dataset_id
source_type
source_name
source_reference
license_reference
metadata
```

---

## 6.3 `dataset_versions`

```text
id
dataset_id
version_label
status
record_count
created_at
created_by
source_import_id
```

A dataset version is immutable after publication except for controlled metadata corrections.

---

## 6.4 `dataset_imports`

Represents source ingestion.

```text
id
dataset_id/company_id/workspace_id as applicable
source_file_reference
original_filename
imported_by
imported_at
status
row_count
valid_count
invalid_count
manifest/hash metadata
```

Raw original files may be stored in object storage according to retention policy.

---

## 6.5 `dataset_assignments`

```text
id
dataset_id
dataset_version_id nullable
recipient_company_id
recipient_workspace_id
mode
status
valid_from
valid_until
```

Modes:

```text
snapshot
live
```

---

## 6.6 Canonical practitioner registry

Conceptual platform/master entity:

```text
practitioners
-------------
id
normalized_name
primary_specialty_id
medical_license_identifier nullable
status
created_at
updated_at
```

The registry exists to recognize identity across datasets.

It does not store workspace visit history or workspace classifications.

---

## 6.7 Practitioner identity aliases/source records

To support deduplication/provenance:

```text
practitioner_source_records
---------------------------
id
practitioner_id nullable until matched
dataset_version_id
source_record_id
raw/normalized identity attributes
match_status
match_confidence metadata
```

Potential duplicate matching must remain reviewable; uncertain records must not be silently merged.

---

# 7. Workspace Organization Entities

## 7.1 `organization_units`

```text
id
workspace_id
parent_id nullable
name
type
status
created_at
updated_at
```

Types:

```text
region
area
district
team
custom
```

Hierarchy depth is not fixed.

---

## 7.2 `organization_memberships`

Associates workspace membership/user with organization unit(s).

```text
id
organization_unit_id
membership_id/user_id reference
relationship_type
starts_at
ends_at
```

This supports team assignment separately from authorization scope grants.

---

# 8. Workspace Customer / Practitioner Model

## 8.1 `workspace_practitioners`

Workspace relationship to a canonical or locally sourced practitioner.

```text
id
workspace_id
practitioner_id nullable when local/unmatched
source_dataset_record_id nullable
local_display_name
specialty_id
class_id
frequency_rule_id/current_frequency
status
owner/source metadata
created_at
updated_at
```

Workspace-specific fields such as class/frequency belong here or in related rule/history tables—not on the global practitioner.

---

## 8.2 Practitioner class

Do not hard-code only A/B/C.

Conceptual table:

```text
customer_classes
----------------
id
workspace_id
key
label
rank/weight
active
```

Excel import may initially create:

```text
A
B
C
```

---

## 8.3 Specialty

Specialties can be reference data but workspace-specific labeling/activation may be needed.

Conceptually:

```text
specialties
workspace_specialties optional
```

---

# 9. Customer Location Model

## 9.1 `locations`

A normalized reusable location concept may exist in master data, but workspace operational use requires explicit association/provenance.

Core fields:

```text
id
label
type
country
province
city
district
address_line
latitude
longitude
source_type
source_reference
created_at
updated_at
```

---

## 9.2 `workspace_practitioner_locations`

```text
id
workspace_practitioner_id
location_id or local location fields/reference
is_primary
is_active
source
created_by
created_at
```

One doctor can therefore have:

```text
Private Office
Hospital
Clinic
```

A provider-specific Google/Neshan place ID is supplementary metadata, not the canonical location identifier.

---

# 10. Products

## 10.1 `products`

```text
id
workspace_id
name
brand_name
status
sort_order
metadata
```

The Excel baseline currently contains product-specific visit counts, but FieldRep OS models products generically.

---

# 11. Routes and Territories

## 11.1 `territories`

```text
id
workspace_id
parent_id nullable
name
type
status
```

## 11.2 `routes`

```text
id
workspace_id
territory_id nullable
name
code
status
```

## 11.3 Customer-route relationship

Do not assume a practitioner can only ever have one route.

Conceptually:

```text
workspace_practitioner_routes
-----------------------------
workspace_practitioner_id
route_id
is_primary
valid_from
valid_until
```

P2 UI can preserve the Excel single-primary-route behavior while domain remains expandable.

---

# 12. Planning Cycles and Targets

## 12.1 `planning_cycles`

```text
id
workspace_id
name
cycle_type
starts_on
ends_on
status
metadata
```

Cycle types may include:

```text
month
quarter
custom_cycle
campaign
```

The Excel quarter model maps naturally to a planning cycle.

---

## 12.2 `target_definitions`

Generic target concept.

```text
id
workspace_id
target_type
name
unit
calculation_method
active
```

Examples:

```text
daily_visits
practitioner_frequency
product_calls
pharmacy_calls
```

---

## 12.3 `target_assignments`

```text
id
target_definition_id
cycle_id
assignee_type
assignee_id
value
starts_at
ends_at
```

P2 initially requires daily visit target and doctor frequency context.

---

# 13. Plan Model

## 13.1 `plans`

Represents a user's planning container for a period/cycle.

```text
id
workspace_id
user_id
planning_cycle_id nullable
status
created_at
updated_at
```

Potential status:

```text
draft
active
submitted
closed
```

Approval workflow is deferred unless required later.

---

## 13.2 `plan_days`

```text
id
plan_id
local_date
route_id nullable
city/context fields nullable
daily_target nullable
notes nullable
```

`local_date` is interpreted in workspace/user calendar context.

---

## 13.3 `plan_entries`

```text
id
plan_day_id
workspace_practitioner_id/customer_reference
location_id nullable
planned_start_time nullable
sequence nullable
status
source
created_at
updated_at
```

Status foundation:

```text
planned
completed
missed
cancelled
rescheduled
```

Source:

```text
manual
ai_suggestion
imported
manager_assigned future
```

The three P2 planner views are presentations of these same records.

---

# 14. Visit Model

## 14.1 `visits`

Actual completed/attempted field interaction.

```text
id
workspace_id
user_id
plan_entry_id nullable
workspace_practitioner_id/customer_reference
location_id nullable
visit_type
occurred_at
status
created_at
updated_at
```

Potential statuses:

```text
completed
cancelled
no_contact future
```

An unplanned visit has no `plan_entry_id`.

---

## 14.2 `visit_products`

Many-to-many relationship:

```text
visit_id
product_id
interaction_type nullable
```

Do not hard-code Toujeo/Soliqua columns into the visit table.

Excel product counters are derived from visit-product relations.

---

## 14.3 `visit_reports`

```text
id
visit_id
report_text
structured_outcome_json/schema future
created_at
updated_at
```

If later report editing/history matters, add revision/history semantics rather than overwriting without trace.

---

# 15. Derived Metrics

Do not store manually synchronized `visited`/`achievement` totals as authoritative truth.

Conceptual calculation:

```text
visited = count(completed qualifying visits in applicable cycle)
achievement = visited / required_frequency
```

Caching/materialized aggregate tables may be introduced for performance later, but must be rebuildable from authoritative records.

Status labels:

```text
incomplete
achieved
over_achieved
```

must be calculated from configured rules rather than stored as independent truth.

---

# 16. Calendar and Activity Model

## 16.1 `calendar_events`

Unified timeline event index/projection.

```text
id
workspace_id
event_type
source_entity_type
source_entity_id
scope_type
scope_id
starts_at
ends_at
all_day
blocks_planning
counts_as_working_activity
status
```

This allows one calendar to render visits, meetings, trips, leave, programs, and closures.

Domain-specific entities retain their own fields.

---

## 16.2 `working_calendar_rules`

```text
id
workspace_id or company projection
weekday
is_working_day
default_start_time nullable
default_end_time nullable
valid_from
valid_until
```

---

## 16.3 `calendar_overrides`

Specific closure/working-day override.

```text
id
workspace_id
local_date/start-end dates
scope
kind
reason
blocks_planning
```

Company-level events may be projected/applied to workspace calendars through control-plane policy/application logic.

---

# 17. Leave Model

## 17.1 `leave_requests`

```text
id
workspace_id
user_id
leave_type
starts_at
ends_at
status
reason nullable
requested_at
approved_by nullable
approved_at nullable
```

Statuses:

```text
draft
requested
approved
rejected
cancelled
```

---

# 18. Business Trip Model

## 18.1 `business_trips`

```text
id
workspace_id
user_id/assignment scope
origin_location/city
destination_location/city
starts_at
ends_at
purpose
transport nullable
status
```

Trips feed calendar conflict/recommendation context.

---

# 19. Meeting / Program Model

## 19.1 `meetings`

```text
id
workspace_id
scope_type
scope_id
title
starts_at
ends_at
location_id nullable
blocks_planning
counts_as_working_activity
status
```

## 19.2 `company_programs`

Similar scheduling core plus program-specific metadata.

## 19.3 `doctor_programs`

```text
id
workspace_id
program_type
title
starts_at
ends_at
location_id
status
report fields future
```

Relationships:

```text
doctor_program_practitioners
doctor_program_users
doctor_program_products future
```

---

# 20. Visit Location Evidence

## 20.1 `visit_location_evidence`

```text
id
workspace_id
visit_id
target_location_id
captured_latitude
captured_longitude
accuracy_meters
captured_at
server_received_at
distance_from_target_meters
verification_status
capture_mode
metadata
```

Verification statuses:

```text
verified
nearby
unverified
outside
```

Evidence is separate from the map provider and separate from the visit report text.

---

# 21. Offline / Sync Model

## 21.1 `devices`

Conceptual registered client/device installation identity.

```text
id
user_id
workspace_id/device context
client_instance_id
last_seen_at
status
```

Do not treat device ID as strong human identity.

---

## 21.2 `sync_operations`

Client-generated mutation envelope for reliable retry/idempotency.

```text
operation_id
workspace_id
user_id
entity_type
entity_id
operation_type
client_timestamp
payload/version
server_status
processed_at
```

`operation_id` must support idempotent retries.

---

## 21.3 `sync_checkpoints`

Tracks incremental synchronization cursor/version as implementation requires.

Exact approach is deferred to P0-A5/P4 ADR.

---

# 22. AI Recommendation Model

## 22.1 `recommendation_batches`

```text
id
workspace_id
user_id
target_period_start
target_period_end
engine_version
created_at
status
```

---

## 22.2 `visit_suggestions`

```text
id
batch_id
workspace_practitioner_id
suggested_date
suggested_location_id nullable
score
status
source_engine
```

Statuses:

```text
suggested
accepted
rejected
edited
converted_to_plan
expired
```

---

## 22.3 `suggestion_reasons`

Structured reasons rather than only generated prose.

```text
id
suggestion_id
reason_code
weight/value
metadata
```

Examples:

```text
frequency_gap
cycle_urgency
class_priority
days_since_last_visit
route_efficiency
trip_context
```

---

## 22.4 `recommendation_feedback`

```text
id
suggestion_id
user_id
action
feedback_code nullable
created_at
```

---

# 23. Audit Model

## 23.1 `platform_audit_events`

Privileged platform/control actions.

```text
id
actor_user_id
action
resource_type
resource_id
target_company_id nullable
target_workspace_id nullable
reason/context nullable
metadata
occurred_at
```

Examples:

```text
role assignment
scope assignment
company suspension
workspace route change
dataset export
dataset assignment
privileged workspace data access
```

---

## 23.2 Workspace domain history

Routine field operations may require domain-level history/revision records, but not every planner keystroke should become a privileged security audit event.

Separate:

```text
security/administrative audit
from
domain change history
```

---

# 24. Ownership Classification

Every table/entity must have one unambiguous ownership class.

| Entity | Ownership |
|---|---|
| User identity | Platform |
| Company | Platform/customer contract |
| Workspace registry | Company under Platform control plane |
| Membership | Control plane / workspace authorization |
| Role/permission definitions | Platform |
| Organization unit | Workspace |
| Practitioner canonical identity | Platform master registry |
| Dataset | Platform/company/workspace according to metadata |
| Workspace practitioner relationship | Workspace |
| Workspace doctor class/frequency | Workspace |
| Route/product/target | Workspace |
| Plan/visit/report | Workspace + user owner |
| Leave/trip/activity | Workspace + actor/scope |
| Visit location evidence | Workspace + visit |
| Recommendation | Workspace + user |
| Platform audit | Platform |

No entity may enter implementation with undefined ownership.

---

# 25. Excel Import Mapping — Initial Direction

The supplied XLSM maps conceptually as follows:

```text
Physision.Name        -> workspace_practitioner/display identity
Physision.Specialty   -> specialty relationship
Physision.Class       -> customer_class
Physision.Route       -> primary route relationship
Physision.Address     -> first practitioner location/address
Physision.Frequency   -> practitioner frequency rule/assignment
Physision.Visited     -> derived from completed visits (migration baseline may seed historical count separately if needed)
Physision.Achievement -> derived
Soliqua/Toujeo counts -> derived/historical product-call migration strategy

Calendar              -> plan + plan_days + plan_entries
Report                 -> visits + visit_products + visit_reports
```

Historical migration semantics require a dedicated import ADR because Excel aggregate counters may not have one row per historical visit.

Do not fabricate historical visit records merely to reproduce aggregate counters without documenting the migration assumption.

---

# 26. Key Invariants

The implementation must preserve these invariants:

1. Every workspace operational record resolves to exactly one workspace.
2. A user identity alone grants no workspace access.
3. A plan entry and its resulting visit remain in the same workspace.
4. Workspace practitioner classification/frequency is not stored on the canonical practitioner.
5. Multiple workspaces can reference the same canonical practitioner independently.
6. `Visited` and `Achievement` are derived from authoritative operational data/rules.
7. All plan views render the same underlying plan entries.
8. Customer locations do not depend on a map provider identifier.
9. Offline mutations have idempotent operation identity.
10. AI suggestions are not official plan entries until accepted/converted.
11. Dataset assignment does not merge recipient operational data.
12. Privileged platform data access is permission-controlled and audited.

---

# 27. P0-A4 Open Decisions for ADR / Implementation

The following are intentionally not frozen in this document:

- UUID vs ULID implementation
- Exact authentication credential/session tables
- Exact control-plane physical database technology
- Exact number of physical databases in first deployment
- D1 vs alternative store for future large datasets
- ORM selection details
- Event-history/revision strategy
- Aggregate/materialized reporting strategy
- Offline sync conflict algorithm
- Historical Excel counter migration policy

These will be decided explicitly through P0 architecture/ADR work rather than accidental implementation choices.

---

# 28. P0-A4 Exit Criteria

P0-A4 is ready for interface/architecture work when:

1. Every major domain has an ownership boundary.
2. Control plane and workspace data plane are distinguishable.
3. Excel Planner/Report concepts map to domain entities.
4. Shared practitioner identity does not own workspace operational state.
5. Workspace DB routing can occur without cross-database foreign-key assumptions.
6. Multi-location customers are modeled.
7. Visit location evidence is independent from map provider.
8. Offline sync has idempotency hooks.
9. AI recommendations have separate suggestion entities/reasons.
10. Remaining physical-schema choices are explicitly listed as ADR decisions.

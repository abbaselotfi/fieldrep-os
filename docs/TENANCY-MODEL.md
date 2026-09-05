# FieldRep OS — Tenancy, Workspace, and Data Isolation Model

**Phase:** P0 — Product & Architecture Foundation  
**Status:** Architecture baseline

---

## 1. Objective

FieldRep OS must support many companies, each potentially containing multiple independent field-force business units.

A simple `company_id` column on every table is insufficient because:

- A company may have Diabetes, Cardiology, Neurology, or other business units.
- Each business unit may require a physically separate database.
- Users, supervisors, products, plans, targets, reports, and datasets may differ by business unit.
- The same physician may appear in several workspaces without sharing workspace-specific operational data.
- Platform-provided or company-imported datasets may be assigned to one or more workspaces.

The tenancy model therefore separates **Company**, **Workspace**, **Organization Unit**, and **Dataset**.

---

## 2. Canonical Hierarchy

```text
Platform
└── Company
    ├── Workspace A
    │   └── Organization Units / Teams
    │       └── User Memberships
    └── Workspace B
        └── Organization Units / Teams
            └── User Memberships
```

Example:

```text
Company: Pharma Co

Workspace: Diabetes
├── East Region
│   ├── Mashhad Team
│   └── Bojnourd Team

Workspace: Cardiology
├── East Region
│   └── Mashhad Cardio Team
```

---

## 3. Platform

`Platform` represents the FieldRep OS service itself.

Platform-level concerns include:

- Companies
- Workspace registry
- Global user identities
- Platform roles/permissions
- Feature entitlements
- Contract/licensing limits
- Database routing metadata
- Dataset catalog
- Dataset versions/assignments
- Global security and audit

Platform data must not be confused with a workspace's operational field data.

---

## 4. Company

A `Company` is a customer organization.

Representative fields:

```text
id
name
slug
status
legal_name
country
locale
timezone
created_at
```

Possible lifecycle:

```text
provisioning
active
suspended
archived
```

A company can contain one or more workspaces.

---

## 5. Workspace

A `Workspace` is the primary operational isolation boundary.

Typical meanings:

```text
Diabetes business unit
Cardiology business unit
Neurology business unit
Independent field-force division
```

Representative fields:

```text
id
company_id
name
slug
status
default_locale
default_timezone
data_store_key
created_at
```

Workspace-scoped data includes, unless intentionally shared/reference-only:

- User memberships
- Teams/organization units
- Product assignments
- Routes/territories
- Doctor classifications
- Frequencies/targets
- Plans
- Visits
- Visit reports
- Activity records
- Workspace-specific customer notes
- Workspace-specific customer locations/overrides where applicable
- Supervisor scopes
- Workspace settings

---

## 6. Why Workspace Is Not a Team

A team is an organizational grouping.

A workspace is a data and business isolation boundary.

Example:

```text
Company A
└── Diabetes Workspace
    ├── Team Mashhad
    ├── Team Bojnourd
    └── Team Neyshabur
```

All three teams may share the same Diabetes product/customer dataset and workspace database, while still having different supervisors and scopes.

Cardiology may use a completely separate workspace and database.

---

## 7. Organization Unit

An `OrganizationUnit` is hierarchical and flexible.

Representative model:

```text
id
workspace_id
parent_id
name
type
status
```

Suggested types:

```text
region
area
district
team
custom
```

Example:

```text
East Region
└── Khorasan Area
    ├── Mashhad Team
    └── Bojnourd Team
```

No fixed number of hierarchy levels should be hard-coded into application logic.

---

## 8. User Identity vs Membership

A user identity is platform-global.

A user's authorization inside a company/workspace is represented by a membership.

Conceptually:

```text
User
└── Membership(s)
    ├── Company A / Diabetes / user
    └── Company A / Cardiology / supervisor
```

This allows one human account to participate in multiple authorized workspaces without duplicating login identities.

Representative membership fields:

```text
id
user_id
company_id
workspace_id
role_assignment_id
status
created_at
```

A membership does not automatically grant access to all organization units. Scope assignments are separate.

---

## 9. Role vs Scope

Role answers:

> What may this membership do?

Scope answers:

> Where may this membership do it?

Example:

```text
role: supervisor
permissions:
  plans.read.team
  reports.read.team
  users.read.team

scopes:
  organization_unit = Mashhad Team
```

Another supervisor can have the same role with a different scope.

---

## 10. Database Routing

Application code must not bind business logic directly to a specific physical workspace database.

Required abstraction:

```ts
interface WorkspaceDataRouter {
  getWorkspaceDatabase(workspaceId: string): Promise<WorkspaceDatabase>
}
```

A control-plane registry maps:

```text
workspace_id
→ data_store_type
→ data_store_identifier
→ status/version metadata
```

Example:

```text
ws_diabetes  -> d1 -> fieldrep-ws-001
ws_cardio    -> d1 -> fieldrep-ws-002
ws_neuro     -> postgres -> tenant_cluster_x/schema_y
```

The first deployment may use only one technology, but the business/domain layer must not assume that forever.

---

## 11. Control Plane vs Workspace Data Plane

Recommended logical split:

```text
CONTROL PLANE
-------------
users
companies
workspaces
memberships
roles
permissions
feature_entitlements
workspace_data_routes
dataset_catalog
dataset_assignments
platform_audit

WORKSPACE DATA PLANE
--------------------
organization units
workspace memberships projection/reference
customers or dataset projections
routes
products
targets
plans
visits
reports
activities
workspace settings
workspace audit as needed
```

The exact physical split is finalized in the Data Model/Architecture phase.

---

## 12. Shared Practitioner Identity

The same physician may appear in several datasets and workspaces.

FieldRep OS should eventually support a platform-level canonical practitioner identity:

```text
practitioner_id = PRAC_123
```

Possible canonical fields:

```text
normalized name
specialty
medical council / license identifier
stable identity references
```

However, canonical identity does **not** own workspace-specific operational data.

---

## 13. Workspace Practitioner Relationship

Workspace-specific doctor/business attributes belong to a relationship/projection layer.

Conceptually:

```text
WorkspacePractitioner
---------------------
workspace_id
practitioner_id
class
frequency
target status
route relationship
active status
workspace tags
```

Example:

```text
PRAC_123

Diabetes:
  class A
  frequency 6
  route 8

Cardiology:
  class B
  frequency 3
  route 2
```

The following must never become shared simply because the practitioner identity matches:

```text
visit history
plans
reports
notes
performance
user activity
workspace classification
product call history
```

---

## 14. Location Layering

A practitioner/customer may have several locations.

Potential sources:

```text
platform/master location
assigned dataset location
workspace-added location
user-suggested location
```

The Data Model must later define precedence and approval semantics, but each location requires provenance.

A workspace can use a platform/master location without receiving operational data from another workspace.

---

## 15. Dataset Is a Separate Concept from Workspace Database

A `Dataset` is reference/master data that can be imported, curated, versioned, and assigned.

A `Workspace Database` stores operational state.

Do not collapse these concepts.

Example:

```text
Dataset:
  Khorasan Internal Medicine v12

Assigned to:
  Company A / Diabetes
  Company B / Diabetes

Workspace A operational data:
  class A
  frequency 6
  visits...

Workspace B operational data:
  class C
  frequency 3
  visits...
```

The same dataset record can therefore support separate operational relationships.

---

## 16. Dataset Ownership and Source

A dataset may be owned/managed by:

```text
Platform
Company
Workspace
External licensed source (represented contractually by Platform/Company metadata)
```

Source types may include:

```text
platform_curated
purchased
licensed
company_import
workspace_import
manual
```

Representative provenance:

```text
dataset_id
version
source_type
source_name
imported_by
imported_at
original_file_reference
license/reference metadata
```

---

## 17. Dataset Assignment

Dataset access must use explicit assignments/entitlements.

Conceptually:

```text
DatasetAssignment
-----------------
dataset_id
dataset_version_id
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

### Snapshot

The recipient receives/uses a defined version.

### Live

The recipient follows approved subsequent dataset versions according to policy/contract.

---

## 18. Platform Administrative Data Access

FieldRep OS must support platform-level administration of datasets imported into the platform when that capability is part of the platform's governing terms.

Technical requirements:

- Explicit platform permission
- Dataset/source identification
- Controlled export function
- Audit event for export/access where appropriate
- No dependency on user-facing workspace UI to perform platform governance

Product/legal requirement:

- Such access must be covered by applicable contractual/privacy terms.

This capability must not be implemented as an undocumented bypass around authorization/audit systems.

---

## 19. Company Admin Scope

A Company Admin may be granted access across all or selected company workspaces according to assigned scope.

Do not assume every `company_admin` automatically has unrestricted access to every workspace.

Two useful patterns are supported:

```text
Company-wide admin
Workspace-limited company admin
```

For finer operational administration, use `workspace_admin`.

---

## 20. Workspace Admin Scope

A Workspace Admin manages one or more explicitly scoped workspaces.

Potential capabilities:

```text
users/memberships
teams
customer master data
products
routes
calendar policy
imports
reports
targets
```

All remain permission-driven.

---

## 21. Supervisor Scope

Supervisor access is organization-unit or explicit-user scoped.

Examples:

```text
organization_unit: Mashhad Team
organization_unit: East Region
users: [u1, u2, u3]
```

Organization-unit scope should normally include descendants when configured as hierarchical scope.

The implementation must make descendant semantics explicit, not implicit.

---

## 22. Field User Scope

A normal Field User usually has:

```text
own plans
own visits
own reports
own activities
assigned/authorized customer data
workspace reference data needed for work
```

A user must not gain access to another user's private operational records merely because both are in the same workspace.

Shared team information, if needed later, requires an explicit permission/use case.

---

## 23. Cross-Workspace Access

Cross-workspace access is denied by default.

Any future cross-workspace feature must define:

- Actor role
- Permission
- Source workspace
- Target workspace(s)
- Data category
- Purpose
- Audit requirement

No generic `read_all_workspaces` behavior should be introduced casually into business APIs.

Platform-level administrative APIs are separate and explicitly privileged.

---

## 24. Context Propagation

Every authenticated business request must resolve an authorization context similar to:

```ts
interface AuthContext {
  userId: string;
  membershipId: string;
  companyId: string;
  workspaceId: string;
  roleIds: string[];
  permissions: string[];
  scopes: ScopeGrant[];
}
```

The server derives this context from trusted session/membership data.

The client must not be trusted to declare arbitrary `companyId` or `workspaceId` values.

---

## 25. Query Safety Rule

Workspace data repositories/services must require workspace context rather than accepting an optional workspace filter.

Prefer:

```ts
repo.forWorkspace(ctx.workspaceId).listPlans(...)
```

Avoid patterns equivalent to:

```ts
listPlans({ workspaceId?: string })
```

where omission could accidentally query all tenants.

---

## 26. Resource Ownership Rules

Every resource category must be classified during Data Model work as one of:

```text
platform-owned
company-owned
workspace-owned
organization-unit-scoped
user-owned
shared-reference/dataset-backed
```

No production table should have ambiguous ownership.

---

## 27. Deletion and Suspension Semantics

Company/workspace suspension should disable operational access without immediately destroying data.

Recommended states:

```text
active
suspended
archived
```

Hard deletion, retention, and legal deletion flows are deferred to production-hardening policy and must not be approximated with casual cascading deletes.

---

## 28. P0 Tenancy Acceptance Criteria

P0 tenancy design is acceptable when all are true:

1. Company, Workspace, Organization Unit, User, Membership, Role, Permission, and Scope have distinct meanings.
2. A company can own multiple independently isolated workspaces.
3. A workspace can route to a dedicated physical database.
4. Business logic uses a database-routing abstraction.
5. The same practitioner can appear in multiple workspaces without operational data sharing.
6. Dataset and workspace operational database are separate concepts.
7. Supervisor access is scope-driven.
8. User access is denied outside explicit workspace/membership context.
9. Platform administrative access is a separate privileged path and auditable.
10. Data Model work can assign every entity an unambiguous ownership class.

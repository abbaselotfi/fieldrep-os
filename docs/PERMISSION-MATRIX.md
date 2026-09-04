# FieldRep OS — Permission and Scope Matrix

**Phase:** P0 — Product & Architecture Foundation  
**Status:** Authorization baseline

---

## 1. Authorization Model

FieldRep OS uses:

```text
RBAC + scoped authorization
```

A decision is based on:

```text
Authenticated user
+ Active membership
+ Permission(s)
+ Scope grant(s)
+ Resource ownership
+ Feature entitlement/policy where applicable
```

Role names are convenience bundles. They are not sufficient authorization checks by themselves.

Avoid:

```ts
if (user.role === 'supervisor') { ... }
```

Prefer:

```ts
authorize(ctx, 'reports.read.team', resourceScope)
```

---

## 2. Initial Role Families

```text
platform_admin
company_admin
workspace_admin
supervisor
user
```

These are default role families. The architecture must permit future custom permission bundles without rewriting business logic.

---

## 3. Scope Types

Initial scope types:

```text
platform
company
workspace
organization_unit
user
self
```

Potential later scope:

```text
explicit_resource_set
```

Examples:

```text
platform:* 
company:cmp_1
workspace:ws_diabetes
organization_unit:team_mashhad
user:u_123
self
```

---

## 4. Scope Resolution

### Platform scope

Applies across the platform only when paired with an explicit platform permission.

### Company scope

Applies to authorized resources owned by the company. Cross-workspace operational access still depends on the specific permission and scope semantics.

### Workspace scope

Applies only to the specified workspace.

### Organization-unit scope

Applies to the unit and optionally descendants according to the grant definition.

Suggested grant structure:

```ts
interface ScopeGrant {
  type: 'platform' | 'company' | 'workspace' | 'organization_unit' | 'user' | 'self';
  id?: string;
  includeDescendants?: boolean;
}
```

### Self scope

Applies only to the current user's own resources.

---

## 5. Permission Naming Convention

Use semantic dot-separated permissions:

```text
<domain>.<action>.<scope>
```

Examples:

```text
plans.read.own
plans.read.team
plans.read.workspace
plans.create.own
reports.read.own
reports.read.team
reports.read.workspace
customers.read.workspace
customers.manage.workspace
```

For platform-only capabilities:

```text
platform.companies.manage
platform.datasets.export
platform.database_routes.manage
```

Do not encode company/workspace IDs inside permission names.

---

# 6. Field User Permissions

Default Field User role should be minimal.

| Domain | Permission | Default | Scope |
|---|---|---:|---|
| Profile | `profile.read.own` | Yes | self |
| Profile | `profile.update.own` | Yes | self |
| Planner | `plans.read.own` | Yes | self |
| Planner | `plans.create.own` | Yes | self |
| Planner | `plans.update.own` | Yes | self |
| Planner | `plans.delete.own` | Policy | self |
| Visits | `visits.read.own` | Yes | self |
| Visits | `visits.create.own` | Yes | self |
| Visits | `visits.update.own` | Policy | self |
| Reports | `reports.read.own` | Yes | self |
| Reports | `reports.create.own` | Yes | self |
| Customers | `customers.read.assigned` | Yes | workspace/assignment |
| Customers | `customers.create.personal` | Later/Policy | self/workspace |
| Calendar | `calendar.read.own` | Yes | self |
| Activities | `activities.read.own` | Yes | self |
| Activities | `activities.create.own` | Yes | self |
| Leave | `leave.request.own` | P3 | self |
| Trips | `trips.read.own` | P3 | self |
| Settings | `settings.update.own` | Yes | self |

A Field User does not receive generic access to other users' plans, reports, or visits.

---

# 7. Supervisor Permissions

Default Supervisor permissions are team-scoped and should not automatically extend to the whole workspace.

| Domain | Permission | Default | Scope |
|---|---|---:|---|
| Users | `users.read.team` | Yes | org unit/user set |
| Planner | `plans.read.team` | Yes | org unit/user set |
| Reports | `reports.read.team` | Yes | org unit/user set |
| Visits | `visits.read.team` | Yes | org unit/user set |
| Calendar | `calendar.read.team` | Yes | org unit/user set |
| Activities | `activities.read.team` | Yes | org unit/user set |
| Leave | `leave.read.team` | Yes | org unit/user set |
| Leave | `leave.approve.team` | Policy | org unit/user set |
| Trips | `trips.read.team` | Yes | org unit/user set |
| Customers | `customers.read.workspace` | Yes/Policy | workspace |
| Exports | `reports.export.team` | Policy | org unit/user set |
| Location verification | `visit_verification.read.team` | Feature/Policy | org unit/user set |

Optional supervisor permissions may include:

```text
plans.comment.team
plans.approve.team
activities.create.team
meetings.manage.team
```

These should not be assumed in the first Supervisor release unless requirements demand them.

---

# 8. Workspace Admin Permissions

Workspace Admin manages operational administration within explicit workspace scope.

| Domain | Permission | Default | Scope |
|---|---|---:|---|
| Workspace | `workspace.read` | Yes | workspace |
| Workspace | `workspace.settings.manage` | Yes | workspace |
| Users | `users.read.workspace` | Yes | workspace |
| Memberships | `memberships.manage.workspace` | Yes | workspace |
| Roles | `role_assignments.manage.workspace` | Yes | workspace |
| Org units | `org_units.manage.workspace` | Yes | workspace |
| Customers | `customers.read.workspace` | Yes | workspace |
| Customers | `customers.manage.workspace` | Yes | workspace |
| Imports | `imports.manage.workspace` | Yes | workspace |
| Products | `products.manage.workspace` | Yes | workspace |
| Routes | `routes.manage.workspace` | Yes | workspace |
| Targets | `targets.manage.workspace` | Yes | workspace |
| Calendar | `calendar.manage.workspace` | Yes | workspace |
| Holidays | `holidays.manage.workspace` | Yes | workspace |
| Meetings | `meetings.manage.workspace` | Yes | workspace |
| Programs | `programs.manage.workspace` | Yes | workspace |
| Reports | `reports.read.workspace` | Yes | workspace |
| Reports | `reports.export.workspace` | Policy | workspace |
| Visit verification | `visit_verification.read.workspace` | Feature/Policy | workspace |
| Audit | `audit.read.workspace` | Policy | workspace |

Workspace Admin cannot access other workspaces unless separately assigned.

---

# 9. Company Admin Permissions

Company Admin manages company-level concerns and may have either full-company or selected-workspace scope.

| Domain | Permission | Default | Scope |
|---|---|---:|---|
| Company | `company.read` | Yes | company |
| Company | `company.settings.manage` | Yes | company |
| Workspaces | `workspaces.read.company` | Yes | company/assigned workspaces |
| Workspaces | `workspaces.settings.manage` | Policy | assigned workspace(s) |
| Users | `users.read.company` | Yes | company |
| Memberships | `memberships.manage.company` | Yes | company/limits |
| Org units | `org_units.read.company` | Yes | company |
| Calendar | `holidays.manage.company` | Yes | company |
| Programs | `programs.manage.company` | Yes | company/workspace |
| Reports | `reports.read.company` | Yes | company/authorized workspaces |
| Reports | `reports.export.company` | Policy | company/authorized workspaces |
| Imports | `imports.read.company` | Yes | company |
| Datasets | `datasets.request.company` | P11 | company |
| Audit | `audit.read.company` | Policy | company |

Important:

`company_admin` must not implicitly mean access to every workspace's detailed operational records if the membership is intentionally limited. Scope remains authoritative.

---

# 10. Platform Admin Permissions

Platform permissions are separate from tenant operational permissions.

Suggested permissions:

```text
platform.companies.read
platform.companies.manage
platform.workspaces.read
platform.workspaces.manage
platform.users.read
platform.limits.manage
platform.features.manage
platform.database_routes.read
platform.database_routes.manage
platform.datasets.read
platform.datasets.import
platform.datasets.normalize
platform.datasets.version
platform.datasets.assign
platform.datasets.revoke
platform.datasets.export
platform.audit.read
platform.security.read
```

Access to tenant operational data is **not** implied merely by platform administration permissions.

If operational/support access is needed, use explicit permissions such as:

```text
platform.workspace_data.read
platform.workspace_data.export
platform.support_access.start
```

Such access must be governed, scoped, and auditable.

---

# 11. Dataset Permissions

Dataset management is treated as a distinct privileged domain.

| Action | Permission |
|---|---|
| View catalog metadata | `platform.datasets.read` |
| Import dataset | `platform.datasets.import` |
| Clean/normalize | `platform.datasets.normalize` |
| Create version | `platform.datasets.version` |
| Review duplicates | `platform.datasets.deduplicate` |
| Split/build dataset | `platform.datasets.build` |
| Assign dataset | `platform.datasets.assign` |
| Revoke assignment | `platform.datasets.revoke` |
| Export dataset | `platform.datasets.export` |

Company-side dataset permissions may later include:

```text
datasets.read.assigned
datasets.request.company
datasets.import.workspace
```

---

# 12. Calendar / Holiday Permissions

Suggested permission set:

```text
calendar.read.own
calendar.read.team
calendar.read.workspace
calendar.read.company

holidays.read.workspace
holidays.manage.workspace
holidays.manage.company

meetings.create.own
meetings.manage.team
meetings.manage.workspace

programs.read.own
programs.manage.workspace
programs.manage.company
```

A company closure created at company scope propagates to applicable workspaces/users unless an allowed override rule exists.

---

# 13. Leave and Trip Permissions

Suggested leave permissions:

```text
leave.request.own
leave.read.own
leave.cancel.own
leave.read.team
leave.approve.team
leave.read.workspace
leave.manage.workspace
```

Suggested trip permissions:

```text
trips.read.own
trips.create.own
trips.read.team
trips.approve.team
trips.manage.workspace
```

Approval workflow is policy-controlled and may be disabled for a company/workspace.

---

# 14. Maps and Location Permissions

Suggested permissions:

```text
locations.read.assigned
locations.create.personal
locations.suggest.workspace
locations.manage.workspace
maps.use
routing.use
nearby.use
```

Map API usage may also depend on company/workspace feature entitlement or quota.

---

# 15. Visit Location Verification Permissions

Suggested permissions:

```text
visit_verification.capture.own
visit_verification.read.own
visit_verification.read.team
visit_verification.read.workspace
visit_verification.configure.workspace
```

A user should be able to see the verification result for their own visit if product policy allows.

Managers only receive access within authorized scope.

Continuous route tracking, if ever introduced, must use separate permissions and must not reuse visit-verification permissions.

---

# 16. AI Recommendation Permissions

Suggested permissions:

```text
recommendations.generate.own
recommendations.read.own
recommendations.accept.own
recommendations.feedback.own
recommendations.configure.workspace
```

The AI/recommendation service may only consume data the requesting context is authorized to use.

It must not bypass workspace/customer scope simply because it is an internal service.

---

# 17. Feature Entitlements vs Permissions

Permissions answer:

> Is this actor authorized?

Feature entitlement answers:

> Has this company/workspace licensed/enabled this capability?

Both may be required.

Example:

```text
permission: visit_verification.capture.own = yes
feature entitlement: location_verification = disabled
result: feature unavailable
```

Suggested feature flags/entitlements:

```text
planner
reports
offline_pwa
maps
route_optimization
visit_location_verification
ai_planning
advanced_analytics
dataset_access
custom_branding
```

Never implement licensing solely through hidden frontend navigation.

---

# 18. Resource Authorization Examples

## Example A — Field User reading own plan

```text
actor user = U1
workspace = W1
permission = plans.read.own
plan.owner = U1
plan.workspace = W1
=> allow
```

## Example B — Field User reading colleague plan

```text
actor user = U1
permission = plans.read.own
plan.owner = U2
=> deny
```

## Example C — Supervisor reading team member report

```text
actor = Supervisor S1
permission = reports.read.team
scope = Team A with descendants
report.owner belongs to Team A
same workspace
=> allow
```

## Example D — Supervisor reading another workspace

```text
same supervisor
resource workspace != authorized workspace
=> deny
```

## Example E — Company Admin aggregate report

```text
permission = reports.read.company
scope = company + selected workspaces
requested workspace is included
=> allow
```

## Example F — Platform dataset export

```text
permission = platform.datasets.export
requested dataset exists in governed catalog
export action audited
=> allow
```

## Example G — Platform operational support access

```text
permission = platform.workspace_data.read
explicit target workspace
support/admin access context created
audit event recorded
=> allow according to policy
```

Without the explicit permission/path, platform admin UI status alone is not enough.

---

# 19. Deny-by-Default Rules

The authorization layer must deny when any of these are unresolved:

```text
no authenticated user
inactive session
inactive membership
wrong workspace
missing permission
resource outside scope
company/workspace suspended
feature disabled when entitlement required
ambiguous ownership
```

Ambiguity must not default to broader access.

---

# 20. API Authorization Rule

Every business API endpoint must declare:

1. Required permission(s)
2. Resource ownership type
3. Scope evaluation rule
4. Feature entitlement if applicable
5. Audit requirement if applicable

Example endpoint definition conceptually:

```text
POST /workspaces/:workspaceId/plans
permission: plans.create.own
scope: self + active workspace
feature: planner
```

---

# 21. UI Navigation Rule

The UI may hide actions the user lacks permission to use, but this is only a usability optimization.

Server authorization remains authoritative.

Navigation should be generated from effective permission + entitlement state rather than hard-coded role names where practical.

---

# 22. Privileged Action Audit Matrix

At minimum, these should create audit events:

| Action | Audit |
|---|---:|
| Change role/permission assignment | Required |
| Change supervisor scope | Required |
| Create/suspend company | Required |
| Create/suspend workspace | Required |
| Change feature entitlement | Required |
| Change user/license limits | Required |
| Change database routing | Required |
| Dataset import/version/assignment/revocation | Required |
| Dataset export | Required |
| Platform support/operational data access | Required |
| Bulk master-data import apply | Required |

Routine field-user plan edits need normal domain history, not necessarily privileged security audit events.

---

# 23. Initial Role Defaults Summary

| Capability | User | Supervisor | Workspace Admin | Company Admin | Platform Admin |
|---|---:|---:|---:|---:|---:|
| Own plan/report | Yes | Yes* | Policy | Policy | No implicit tenant access |
| Team reports | No | Scoped | Yes within workspace | Scoped company/workspaces | No implicit tenant access |
| Manage teams | No | No/Policy | Yes | Yes | Platform lifecycle only |
| Manage workspace master data | No | No | Yes | Scoped | No implicit operational editing |
| Manage company holidays | No | No | Workspace only | Yes | Global holiday/catalog admin |
| Manage company/workspace users | No | No | Workspace | Company | Platform-level lifecycle/limits |
| Dataset catalog/admin | No | No | Assigned imports only | Requests/import policy | Yes with explicit dataset permission |
| Database routing | No | No | No | No | Explicit platform permission |
| Cross-tenant operational access | No | No | No | No | Explicit privileged path only |

`*` Supervisor remains a field user only if their membership/product design grants own execution capabilities; role bundles may be combined or adjusted later.

---

# 24. P0 Permission Acceptance Criteria

Authorization design is ready for Data Model/API work when:

1. No core API needs to check only a role-name string.
2. Role and scope are separate.
3. Self/team/workspace/company/platform access have explicit semantics.
4. Cross-workspace access is denied by default.
5. Feature entitlement is distinct from permission.
6. Privileged platform data access uses explicit permissions and audit.
7. Dataset administration is a separate permission domain.
8. Supervisor scopes can target hierarchical organization units.
9. Company Admin can be company-wide or workspace-limited.
10. UI navigation can be derived from effective permissions without becoming the security boundary.

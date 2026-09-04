# FieldRep OS — Requirements Baseline

**Phase:** P0 — Product & Architecture Foundation  
**Status:** Baseline requirements  
**Initial delivery focus:** Field User / Excel parity

---

## 1. Requirement Conventions

Requirement identifiers use the following prefixes:

```text
FR   Functional requirement
SEC  Security requirement
TEN  Tenancy/isolation requirement
UX   User-experience requirement
PWA  Offline/PWA requirement
MAP  Maps/location requirement
AI   Recommendation/AI requirement
OPS  Operational/admin requirement
NFR  Non-functional requirement
```

Priority:

```text
P0 = architecture-critical
P1 = required for first authenticated shell
P2 = required for Excel-parity user release
P3+ = required in later roadmap phase
```

---

# 2. Identity, Login, and Session Requirements

### FR-AUTH-001 — Login
**Priority:** P1  
A user must authenticate before accessing protected application routes.

### FR-AUTH-002 — Workspace context
**Priority:** P1  
After authentication, the application must resolve the user's authorized company/workspace memberships.

### FR-AUTH-003 — Multi-membership selection
**Priority:** P1/P9  
A user with multiple authorized workspaces must be able to select/switch only among those memberships.

### SEC-AUTH-001 — Server-side authorization
**Priority:** P0  
Authorization must be enforced server-side. UI visibility is not an authorization boundary.

### SEC-AUTH-002 — Session revocation foundation
**Priority:** P1  
The session model must support logout and later administrative/session revocation.

### SEC-AUTH-003 — Privileged-role hardening
**Priority:** P10/P12  
Platform/company/workspace administrators must support stronger authentication controls such as MFA when enabled.

---

# 3. Tenancy and Isolation Requirements

### TEN-001 — Company boundary
**Priority:** P0  
All company-owned resources must have explicit company ownership or derivable ownership through workspace.

### TEN-002 — Workspace boundary
**Priority:** P0  
Operational field data must belong to a workspace unless explicitly defined as platform/company shared reference data.

### TEN-003 — Physical database flexibility
**Priority:** P0  
A workspace must be routable to a physical database without embedding database identity throughout business logic.

Target application abstraction:

```ts
getWorkspaceDatabase(workspaceId)
```

### TEN-004 — No cross-workspace operational leakage
**Priority:** P0  
Plans, reports, visits, notes, targets, user activity, classifications, and similar operational records in one workspace must not be readable by another workspace unless an explicit cross-workspace permission/use case is later defined.

### TEN-005 — Shared practitioner identity isolation
**Priority:** P0  
A canonical/shared doctor identity must not cause workspace-specific attributes or operational history to be shared.

### TEN-006 — Company with multiple business units
**Priority:** P0  
One company may contain multiple workspaces such as Diabetes, Cardiology, and Neurology.

### TEN-007 — Workspace database separation
**Priority:** P0 architecture / later deployment  
The platform must permit different workspaces of the same company to use separate physical databases.

---

# 4. Role, Permission, and Scope Requirements

### FR-RBAC-001 — Initial roles
**Priority:** P0  
The authorization model must support at least:

```text
platform_admin
company_admin
workspace_admin
supervisor
user
```

### FR-RBAC-002 — Permission-based authorization
**Priority:** P0  
Application code must authorize permissions/capabilities rather than relying only on role-name conditionals.

### FR-RBAC-003 — Scope separation
**Priority:** P0  
Role and data scope must be independent.

Example:

```text
role = supervisor
scope = organization_unit:team-a
```

### FR-RBAC-004 — Hierarchical organization units
**Priority:** P0/P9  
A workspace must support hierarchical organization units/teams.

### FR-RBAC-005 — Multiple scoped assignments
**Priority:** P8/P9  
A supervisor may be assigned to more than one permitted organization scope.

### SEC-RBAC-001 — Deny by default
**Priority:** P0  
A request without an applicable permission and scope must be denied.

---

# 5. Field User Home Requirements

### FR-USER-001 — Today dashboard
**Priority:** P1/P2  
The Field User Home screen must prioritize today's execution status.

At minimum it should support:

```text
Today's planned visits
Completed visits
Daily target
Remaining visits
Current route/context
Next activity
```

### UX-USER-001 — Avoid management clutter
**Priority:** P1  
The Field User Home must not be dominated by company-wide charts or administrative analytics.

---

# 6. Doctor / Customer Master Data Requirements

### FR-CUST-001 — Doctor baseline fields
**Priority:** P2  
The first release must support doctor fields required by the Excel baseline:

```text
Name
Specialty
Class
Route
Address/location
Frequency
Visited-derived status
Achievement-derived status
Product visit context
```

### FR-CUST-002 — Customer abstraction
**Priority:** P0  
The domain must allow future customer types such as Pharmacy, Hospital, Clinic, Laboratory, and Other without redesigning planner/visit ownership.

### FR-CUST-003 — Search and filters
**Priority:** P2  
The user must be able to search/filter doctors by at least:

```text
Name
Class
Specialty
Route
Frequency/achievement status
```

### FR-CUST-004 — Multiple locations
**Priority:** P0 data model / P5 UI  
A customer may have multiple locations.

### FR-CUST-005 — Excel address migration
**Priority:** P2  
The existing Excel address must be importable as the customer's initial location/address record.

---

# 7. Planner Requirements

### FR-PLAN-001 — Jalali planning context
**Priority:** P2  
Users must plan using Jalali dates in the UI.

### FR-PLAN-002 — Three primary planner views
**Priority:** P2  
The same underlying plan records must support:

```text
Excel view
Calendar view
Mobile/List view
```

### FR-PLAN-003 — Map view
**Priority:** P5  
The same plan records must later support a Map view.

### FR-PLAN-004 — Route selection
**Priority:** P2  
A plan day must support route/territory context consistent with the Excel workflow.

### FR-PLAN-005 — Doctor selection
**Priority:** P2  
A user must select authorized doctors/customers into a plan.

### FR-PLAN-006 — Daily target
**Priority:** P2  
The user must see planned count vs applicable daily target.

### FR-PLAN-007 — Duplicate awareness
**Priority:** P2  
The system must detect configured duplicate/repeat planning situations and present warning/status without silently deleting entries.

### FR-PLAN-008 — Frequency context
**Priority:** P2  
Before adding a doctor, the user should be able to see frequency progress/remaining visits where available.

### FR-PLAN-009 — Presentation preference
**Priority:** P2  
The user can persist a preferred planner view without changing underlying plan data.

### FR-PLAN-010 — Planned state lifecycle
**Priority:** P2/P3  
A plan item must be able to evolve into states such as:

```text
planned
completed
missed
cancelled
rescheduled
```

---

# 8. Visit and Report Requirements

### FR-VISIT-001 — Plan and actual visit separation
**Priority:** P2  
Planned visits and actual completed visits must be modeled separately.

### FR-VISIT-002 — Planned and unplanned visits
**Priority:** P2  
The user must be able to record an actual visit from a planned item and also record an authorized unplanned visit.

### FR-VISIT-003 — Product capture
**Priority:** P2  
Visit reporting must support product selection. Initial import/parity includes the workbook's current products while the domain remains product-generic.

### FR-VISIT-004 — Report text
**Priority:** P2  
A visit must support a multiline report/note field equivalent to the workbook report workflow.

### FR-VISIT-005 — Visit location reference
**Priority:** P0 foundation / P2 optional selection / P5 full UI  
A visit may reference the customer location at which the interaction occurred.

### FR-VISIT-006 — Derived visited count
**Priority:** P2  
`Visited` must be derived from completed visit records, not maintained as an independent manually synchronized total.

### FR-VISIT-007 — Achievement calculation
**Priority:** P2  
Achievement must be derived consistently from completed visit count and applicable frequency/target definition.

### FR-VISIT-008 — Reporting periods
**Priority:** P2  
Field users must be able to review at least:

```text
Daily
Weekly
Monthly
Planning cycle/quarter
```

---

# 9. Calendar and Activity Requirements

### FR-CAL-001 — Operational calendar
**Priority:** P3  
Calendar must combine visits and non-visit work activities.

### FR-CAL-002 — Required activity categories
**Priority:** P3 foundation  
Support at least:

```text
Doctor visit
Pharmacy visit
Leave
Business trip
Internal meeting
Company program
Doctor program/event
Public holiday
Company/workspace closure
Custom activity
```

### FR-CAL-003 — Calendar views
**Priority:** P3  
Support:

```text
Month
Week
Day
Agenda
```

### FR-CAL-004 — Working calendar rules
**Priority:** P3/P9  
Company/workspace administrators can define working weekdays and closure days within authorized scope.

### FR-CAL-005 — Conflict engine
**Priority:** P3  
Planner/calendar must detect relevant conflicts such as leave, closure, meeting overlap, or incompatible context.

### FR-CAL-006 — Activity KPI isolation
**Priority:** P3  
Non-visit activities must not increment doctor visit frequency/achievement.

---

# 10. Leave, Trip, Meeting, and Program Requirements

### FR-ACT-001 — Leave lifecycle
**Priority:** P3  
The domain must support:

```text
draft
requested
approved
rejected
cancelled
```

### FR-ACT-002 — Business trip
**Priority:** P3  
Business trip data should support origin, destination, start/end, purpose, and user scope.

### FR-ACT-003 — Trip planning context
**Priority:** P3/P7  
An approved trip may alter city/location context for planning and future recommendations.

### FR-ACT-004 — Internal meetings
**Priority:** P3  
Meetings may target company, workspace, team, or selected users according to permissions.

### FR-ACT-005 — Company programs
**Priority:** P3  
Company programs must support configuration for:

```text
blocks planning time
counts as working activity
included in report
```

### FR-ACT-006 — Doctor programs
**Priority:** P3+  
Doctor events/programs must support participant doctors, users, location, date/time, and report foundation.

---

# 11. PWA and Offline Requirements

### PWA-001 — Installable PWA
**Priority:** P4  
The Field User application must be installable where platform/browser support exists and must remain usable in-browser.

### PWA-002 — Offline shell
**Priority:** P4  
The authenticated Field User shell should reopen during connectivity loss when prior authorized state is available.

### PWA-003 — Authorized cached data
**Priority:** P4  
Only data authorized for the current user/workspace may be cached locally.

### PWA-004 — Offline plan/report entry
**Priority:** P4  
Core plan/report changes must be storable locally while offline and queued for synchronization.

### PWA-005 — Sync states
**Priority:** P4  
The UI must clearly represent:

```text
synced
syncing
offline-saved
pending
conflict
failed
```

### SEC-PWA-001 — Local user isolation
**Priority:** P4  
A second user on the same browser/device must not gain access to the previous user's cached business data after logout/session change.

### PWA-006 — Idempotent sync
**Priority:** P4  
Synchronization must prevent duplicate creation of visits/plan changes after retries.

---

# 12. Map and Location Requirements

### MAP-001 — Provider-independent coordinates
**Priority:** P0  
Customer location records must store canonical coordinates/address data independently from provider IDs.

### MAP-002 — Provider adapter
**Priority:** P5  
Map integration must use a provider interface rather than provider calls spread throughout UI/domain logic.

### MAP-003 — Initial capabilities
**Priority:** P5  
Adapter design must support:

```text
place search
geocode
reverse geocode
map display
distance
route
route optimization
external navigation
```

### MAP-004 — Multiple customer locations
**Priority:** P5  
Planner/visit flows must allow selecting among authorized active locations for a customer.

### MAP-005 — Nearby customers
**Priority:** P5  
The user can later discover authorized nearby customers using current location and/or map context.

---

# 13. Visit Location Verification Requirements

### MAP-VERIFY-001 — Optional feature
**Priority:** P6  
Visit-location verification must be enable/disable configurable per authorized company/workspace policy.

### MAP-VERIFY-002 — Evidence fields
**Priority:** P6  
Evidence must support at least:

```text
target location
captured coordinates
accuracy
captured_at
server_received_at
distance from target
verification status
capture mode
```

### MAP-VERIFY-003 — Accuracy-aware evaluation
**Priority:** P6  
Low-confidence location readings must not be falsely marked as verified solely because their nominal coordinate is inside a radius.

### MAP-VERIFY-004 — Offline evidence
**Priority:** P6  
Offline capture must retain original capture time separately from sync/server receipt time.

### MAP-VERIFY-005 — No absolute-proof claim
**Priority:** P6  
Product language must not represent browser geolocation evidence as guaranteed proof of physical presence.

---

# 14. AI / Recommendation Requirements

### AI-001 — Recommendation, not autonomous publishing
**Priority:** P7  
Recommendations must require user acceptance before becoming official plans.

### AI-002 — Explainable reasons
**Priority:** P7  
Each suggestion must contain structured reasons that can be displayed to the user.

### AI-003 — Deterministic foundation
**Priority:** P0 interface / P7 implementation  
The first recommendation engine must support rules/scoring/constraints without requiring an LLM.

### AI-004 — Calendar-aware suggestions
**Priority:** P7  
Suggestions must respect applicable hard constraints such as holidays, approved leave, trips, and blocking meetings.

### AI-005 — Frequency and cycle awareness
**Priority:** P7  
Scoring should support frequency gap, days since visit, class priority, and remaining cycle urgency.

### AI-006 — Route/location efficiency
**Priority:** P7  
Scoring may incorporate geographic/route efficiency when location data is available.

### AI-007 — User feedback
**Priority:** P7  
Accepted/rejected/edited suggestions must be recordable for future recommendation quality analysis.

---

# 15. Supervisor Requirements

### FR-SUP-001 — Scoped team visibility
**Priority:** P8  
A supervisor must see only users/data within assigned scope(s).

### FR-SUP-002 — Reporting periods
**Priority:** P8  
Supervisor reporting must support daily, weekly, monthly, and cycle views.

### FR-SUP-003 — Drill-down
**Priority:** P8  
Supervisor can drill from team summary to authorized user/day/visit records according to permissions.

### FR-SUP-004 — Verification summary
**Priority:** P8/P6 integration  
If visit verification is enabled, supervisor views may summarize statuses within scope.

---

# 16. Company / Workspace Administration Requirements

### OPS-COMP-001 — User management
**Priority:** P9  
Authorized company/workspace admins can create/manage memberships within licensed limits and scope.

### OPS-COMP-002 — Organization units
**Priority:** P9  
Admins can manage hierarchical teams/regions within authorized workspace/company scope.

### OPS-COMP-003 — Master data import
**Priority:** P9  
Authorized admins can import/update doctor/pharmacy/product/route data.

### OPS-COMP-004 — Import preview
**Priority:** P9  
Bulk imports must be validated and previewed before application.

Preview should distinguish at least:

```text
new
updated
unchanged
invalid
```

### OPS-COMP-005 — Calendar policy
**Priority:** P9  
Admins can configure working days, closures, and applicable company/workspace events within permission scope.

### OPS-COMP-006 — Reports
**Priority:** P9  
Company/workspace admins can access aggregated reporting only within authorized company/workspace scope.

---

# 17. Platform Administration and Dataset Requirements

### OPS-PLAT-001 — Company/workspace management
**Priority:** P10  
Platform admins can manage company/workspace lifecycle and limits according to platform permissions.

### OPS-PLAT-002 — Feature entitlements
**Priority:** P10  
The platform can enable/disable licensed features per company/workspace.

### OPS-PLAT-003 — Database routing registry
**Priority:** P10  
The platform maintains authoritative routing metadata from workspace to physical data store.

### OPS-DATA-001 — Dataset catalog
**Priority:** P11  
The platform must manage imported, purchased/licensed, and curated datasets.

### OPS-DATA-002 — Dataset provenance
**Priority:** P11  
Dataset versions must retain source/provenance metadata.

### OPS-DATA-003 — Dataset assignment
**Priority:** P11  
Datasets may be assigned to authorized company/workspace recipients.

### OPS-DATA-004 — Snapshot/live modes
**Priority:** P11  
The assignment model must support immutable/snapshot-style and update-following/live-style semantics where contractually applicable.

### OPS-DATA-005 — Duplicate review
**Priority:** P11  
Potential duplicate practitioner records can be detected and reviewed without automatically merging uncertain identities.

### OPS-DATA-006 — Platform access governance
**Priority:** P0 policy / P11 implementation  
Platform administrative access to company-imported datasets must be technically possible where part of the product/contract, explicitly governed by applicable terms, permission-controlled, and audited.

---

# 18. Audit and Security Requirements

### SEC-AUDIT-001 — Administrative audit
**Priority:** P0 foundation  
Security-sensitive administrative actions must produce audit events.

Examples:

```text
role/permission change
company/workspace lifecycle change
feature entitlement change
dataset export/assignment
support/admin data access
```

### SEC-AUDIT-002 — Append-oriented audit model
**Priority:** P0  
Audit events should be modeled as append-oriented records and not used as mutable operational state.

### SEC-DATA-001 — Least privilege
**Priority:** P0  
Service/API design must prefer least-privilege access and scoped data queries.

### SEC-DATA-002 — Sensitive configuration
**Priority:** P1+  
Secrets/API credentials must not be embedded in public frontend source.

### SEC-DATA-003 — Map gateway
**Priority:** P5  
Sensitive map provider operations/keys should be proxied or restricted using the approved provider security model rather than broadly exposed in the PWA.

---

# 19. UX Requirements

### UX-001 — Mobile-first field execution
**Priority:** P1  
Daily field workflows must be optimized first for phone-sized screens.

### UX-002 — Desktop productivity
**Priority:** P1/P2  
Desktop/tablet must support efficient planning and higher-density views, especially Excel-style planning.

### UX-003 — RTL-first
**Priority:** P1  
Initial UI must support Persian/RTL correctly.

### UX-004 — Jalali-first presentation
**Priority:** P1/P2  
User-facing calendar/planner dates are Jalali in the initial locale.

### UX-005 — Accessibility
**Priority:** P1+  
Critical actions must not rely solely on color or gestures; controls require adequate touch target, focus visibility, and contrast.

### UX-006 — Map on demand
**Priority:** P5  
Map should be shown when it improves the task, not permanently consume screen space in all planner views.

### UX-007 — Minimal typing
**Priority:** P2  
Common field workflows should prefer selection/chips/prefilled context over unnecessary text entry.

---

# 20. Non-Functional Requirements

### NFR-001 — Type safety
**Priority:** P1  
Core application/backend code should be TypeScript with strict type checking unless a documented exception exists.

### NFR-002 — Automated testing
**Priority:** P1+  
Business-critical planner/report calculations require unit/integration tests; key user flows require E2E coverage.

### NFR-003 — Tenant isolation testing
**Priority:** P1+  
Authorization tests must explicitly attempt cross-workspace/cross-team access where relevant.

### NFR-004 — Responsive customer search
**Priority:** P2/P12  
Customer search/planner interaction must remain responsive for realistically large assigned datasets.

### NFR-005 — Observability
**Priority:** P12 foundation earlier as needed  
Backend errors, sync failures, and security-relevant events must be diagnosable without exposing sensitive data unnecessarily.

### NFR-006 — Migration discipline
**Priority:** P0+  
Database changes must use reviewed migrations and preserve phase rollback/recovery strategy where practical.

### NFR-007 — Provider replaceability
**Priority:** P0  
Business logic must not be tightly coupled to a single map, AI, storage, or physical workspace database provider.

---

# 21. P2 Excel-Parity Acceptance Gate

P2 cannot close until the agreed Excel parity matrix confirms that a Field User can:

1. Authenticate and open the correct workspace.
2. Access the authorized doctor list.
3. Search/filter relevant doctors.
4. Select Jalali planning period/date.
5. Select route/context.
6. Build a plan using Excel, Calendar, or Mobile/List presentation.
7. See daily target and plan count.
8. See doctor class/frequency context.
9. Receive duplicate/conflict feedback required by parity.
10. Record actual planned/unplanned visits.
11. Select product(s).
12. Enter visit report text.
13. Produce consistent visited/achievement values.
14. Review daily/weekly/monthly results.
15. Complete the core workflow on desktop and mobile without relying on Excel for missing core behavior.

---

# 22. Explicit Deferred Scope

The following are anticipated but must not block P1/P2:

```text
Full supervisor UI
Company admin UI
Platform admin UI
Dataset marketplace/catalog UI
Map routing
GPS visit verification
AI plan generation
Continuous location tracking
Advanced billing
Native mobile rewrite
General-purpose CRM modules
```

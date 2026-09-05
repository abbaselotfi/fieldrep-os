# FieldRep OS — P0 Architecture Review

**Phase:** P0-A6  
**Review date:** 2026-09-05  
**Result:** READY FOR P1 SCAFFOLD, subject to implementation ADRs listed below

---

## 1. Review Scope

Reviewed P0 documents:

```text
ROADMAP.md
PRODUCT-VISION.md
REQUIREMENTS.md
FIELD-USER-SPEC.md
EXCEL-PARITY-MATRIX.md
FRONTEND-PWA-UX-SPEC.md
UI-DESIGN-DIRECTION.md
TENANCY-MODEL.md
PERMISSION-MATRIX.md
DATA-MODEL.md
CALENDAR-ACTIVITY-SPEC.md
MAPS-LOCATION-SPEC.md
OFFLINE-SYNC-SPEC.md
AI-PLANNER-SPEC.md
ARCHITECTURE.md
SECURITY-THREAT-MODEL.md
ADR-0001
ADR-0002
ADR-0003
```

---

# 2. P0 Exit-Gate Review

## Company / Workspace / Team terminology frozen

**PASS**

Definitions:

```text
Company   = customer organization
Workspace = strong operational/business-unit isolation boundary
Org Unit  = hierarchical region/area/team grouping inside workspace
```

---

## Role and scope separated

**PASS**

Authorization uses permission + scope rather than role-name-only checks.

---

## Excel behavior mapped

**PASS for architecture stage**

The workbook's Calendar / Physision / Report behaviors are mapped into Field User requirements and parity criteria.

Implementation still requires P2 executable parity tests/fixtures.

---

## Planner / Visit / Report independent from UI

**PASS**

Three planner views consume the same plan records.

Plan and actual Visit are distinct.

Report is associated with actual visit outcome, not used as plan identity.

---

## Multi-location customers supported

**PASS**

Location is a first-class provider-independent domain concept.

---

## Workspace database isolation/routing defined

**PASS**

WorkspaceDataRouter abstraction prevents domain code from depending on physical tenant binding names.

Production dynamic routing topology remains an infrastructure implementation choice.

---

## Shared practitioner identity does not leak operational data

**PASS**

Canonical identity and workspace practitioner relationship are separate.

Class/frequency/plans/visits/reports remain workspace-owned.

---

## Offline architecture defined

**PASS**

Stable operation IDs, idempotent server application, server reauthorization, and explicit conflicts are defined.

---

## Calendar / activity constraints defined

**PASS**

Leave/trip/meetings/closures/programs feed Planner/AI through normalized calendar context.

---

## Map-provider independence defined

**PASS**

Customer location does not rely on Neshan/Google provider IDs.

---

## AI is explainable and advisory

**PASS**

Rules/scoring/constraints remain deterministic; LLM is optional explanation/interaction layer.

AI suggestions require acceptance before creating official plan entries.

---

## Security/threat boundaries defined

**PASS for P0**

Major tenant, offline, import/export, maps, AI, location, privilege, and environment risks are identified.

---

# 3. Cross-Document Consistency Review

### Tenancy vs Permission

Consistent:

```text
Membership identifies workspace context.
Role gives permission bundle.
Scope limits resource set.
```

### Data Model vs Tenancy

Consistent:

```text
Control plane
vs
Workspace data plane
vs
Dataset/master identity
```

### Field User vs Excel Parity

Consistent:

```text
Excel behavior preserved
Spreadsheet layout limitations removed
Three planner views
```

### Calendar vs AI

Consistent:

AI consumes CalendarConstraintService-style normalized day context.

### Maps vs Visit Verification

Consistent:

Map provider supplies geographic services; FieldRep OS owns location verification policy/evidence.

### Offline vs Security

Consistent:

Server authorization is re-evaluated at synchronization time and local cache is user/workspace isolated.

---

# 4. Intentional Decisions Deferred to P1/P2 ADRs

These items are not considered P0 blockers because their architecture boundaries are already defined.

## P1-AUTH-ADR

Decide exact authentication/session implementation:

```text
credential hashing implementation/library
session persistence store
rotation policy
CSRF/origin strategy
password reset flow
MFA extension point
```

Must be decided before production auth code is finalized.

---

## P1-ID-ADR

Choose UUID vs ULID implementation and client-generated ID policy.

Required before offline-created domain entities are finalized.

---

## P1-DATA-ROUTER-ADR

Choose initial concrete `WorkspaceDataRouter` implementation for local/staging P1/P2.

Likely initial approach:

```text
CONTROL_DB
+ one isolated development/RC WORKSPACE_DB
```

while retaining scalable router interface.

---

## P2-EXCEL-HISTORY-ADR

Define migration treatment for historical Excel aggregate counters where no individual historical Visit records exist.

Do not fabricate history silently.

Options may include:

```text
baseline/carry-forward counters
synthetic migration records clearly marked as imported baseline
start operational history from FieldRep cutover
```

Decision requires parity/migration goals.

---

## P4-OFFLINE-SESSION-ADR

Define maximum offline authorization window and local sensitive-cache handling implementation.

---

# 5. Implementation Risks to Watch in P1/P2

## Risk 1 — UI-first leakage into domain

Do not model separate records for Excel/List/Calendar planner views.

One plan model only.

## Risk 2 — Simplifying Workspace into `company_id`

Do not remove Workspace from operational APIs because first test company has only one active workspace.

## Risk 3 — Role-name conditionals

Do not spread checks such as `role === 'supervisor'` through application code.

## Risk 4 — Static binding assumptions

Development may use one fixed WORKSPACE_DB binding, but application services must still call the data router abstraction.

## Risk 5 — Excel aggregate authority

Do not maintain separate editable `visited`/`achievement` columns as authoritative state in new application.

## Risk 6 — PWA cache treated as HTTP cache only

Business mutations require IndexedDB + sync operations, not just service-worker caching.

## Risk 7 — Provider-specific locations

Do not make Neshan/Google Place ID the customer-location primary key.

## Risk 8 — AI before deterministic planner rules

Do not implement an LLM planner before frequency/calendar/route rule inputs exist and are testable.

---

# 6. P1 Recommended Internal Sequence

```text
P1-A0  Scaffold repo/tooling + CI
P1-A1  Shared domain/types + workspace context
P1-A2  Auth/security ADR + session foundation
P1-A3  Control/workspace DB baseline + data router
P1-A4  Permission middleware
P1-A5  Field User responsive shell
P1-A6  Jalali/RTL design system foundation
P1-A7  Home/Calendar/Planner/Customers/Reports/Settings shells
P1-A8  Representative sample data + responsive visual review
P1-A9  PWA install/static shell foundation
P1-A10 P1 test/security gate
```

P2 then connects the real planner/visit/report engine and Excel import/parity.

---

# 7. Review Outcome

**P0 architecture is sufficient to begin P1 without a known need for tenant/domain schema redesign.**

P0 does not claim that all future implementation details are fixed. It fixes the expensive architectural boundaries and explicitly records the remaining implementation-level decisions.

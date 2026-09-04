# FieldRep OS — Architecture Baseline

**Phase:** P0-A6 — Architecture Review  
**Status:** Initial implementation architecture

---

## 1. Architecture Goals

FieldRep OS must optimize simultaneously for:

- Fast first delivery of the Field User PWA
- Strong company/workspace isolation
- Replaceable workspace databases
- Offline field execution
- Provider-independent maps
- Explainable recommendation engine
- Shared components across user/supervisor/admin surfaces
- Testable business logic outside UI/framework code

The architecture deliberately separates **domain rules**, **application services**, **infrastructure adapters**, and **presentation**.

---

# 2. Repository Shape

Initial monorepo:

```text
fieldrep-os/
├── apps/
│   ├── web/
│   └── worker/
│
├── packages/
│   ├── domain/
│   ├── auth/
│   ├── permissions/
│   ├── database/
│   ├── planner-engine/
│   ├── reporting-engine/
│   ├── calendar-engine/
│   ├── maps/
│   ├── sync/
│   ├── recommendations/
│   ├── ui/
│   └── shared/
│
├── migrations/
│   ├── control/
│   └── workspace/
│
├── tests/
├── docs/
└── .github/
```

Use a single repository because the user/admin applications share domain types, permissions, UI primitives, and release coordination.

---

# 3. Initial Technology Baseline

Frontend:

```text
React
TypeScript
Vite
React Router
Tailwind CSS
PWA/service-worker integration
```

Backend:

```text
Cloudflare Workers
Hono
TypeScript
Zod boundary validation
```

Data:

```text
D1 for initial control/workspace relational storage where appropriate
R2 for imports/exports/assets
IndexedDB for Field User offline domain state
Dexie as candidate IndexedDB abstraction
```

Testing:

```text
Vitest
Playwright
```

Package manager:

```text
pnpm workspaces
```

Avoid introducing additional orchestration (for example a heavy monorepo task runner) until build/test scale justifies it.

---

# 4. Layering

## 4.1 Presentation Layer

`apps/web` and reusable `packages/ui`.

Responsibilities:

- React routes/views
- Forms
- Responsive layouts
- Jalali/RTL presentation
- Accessibility
- View-specific state

Must not own:

- Permission truth
- Achievement calculations
- Workspace isolation rules
- AI scoring rules
- Sync idempotency

---

## 4.2 Application Layer

Orchestrates use cases.

Examples:

```text
CreatePlanEntry
RecordVisit
GetTodayDashboard
ImportDoctors
ResolveCalendarDay
GenerateRecommendations
SyncPendingOperations
```

Application layer receives an authenticated `AuthContext` and calls domain/infrastructure interfaces.

---

## 4.3 Domain Layer

Pure/mostly pure business concepts and rules.

Examples:

- Plan/visit lifecycle
- Frequency/achievement calculation
- Duplicate/conflict rules
- Calendar constraints
- Visit verification evaluation
- Recommendation reason models

Domain package should be testable without Cloudflare runtime or React.

---

## 4.4 Infrastructure Layer

Adapters for:

```text
D1 / future SQL data store
R2
session store
map providers
AI/LLM providers
IndexedDB client storage
external APIs
```

Provider-specific code stays here or in dedicated adapter packages.

---

# 5. Runtime Topology — Initial

Conceptual request path:

```text
Browser / Installed PWA
        │
        ▼
Cloudflare Worker
  ├── Static web assets / SPA delivery
  └── /api/*
        │
        ├── Authentication / AuthContext
        ├── Permission + scope enforcement
        ├── Application services
        │
        ├── Control Plane Repository
        │       └── CONTROL_DB
        │
        └── WorkspaceDataRouter
                └── WORKSPACE_DB / tenant data service
```

P1/P2 may operate with a small fixed set of development/staging workspace databases while preserving the routing interface.

Production multi-workspace provisioning must not require business services to know binding names.

---

# 6. Workspace Database Strategy

Cloudflare D1 is suitable for horizontal scale-out across multiple smaller databases and explicitly supports per-tenant isolation as an architecture pattern.

However, normal Worker D1 access uses resource bindings, so FieldRep OS must not design business logic around an indefinitely growing set of statically named bindings.

Architecture rule:

```ts
interface WorkspaceDataRouter {
  get(workspaceId: string): Promise<WorkspaceDataStore>;
}
```

Possible production implementations include:

```text
A. Per-workspace service/Worker with its own D1 binding
B. Workers for Platforms / dispatch architecture with per-tenant bindings
C. Secure workspace-data proxy service
D. Alternative relational backend accessed through a common adapter
```

The exact large-scale routing implementation is deferred until provisioning/scale phase, while the abstraction is mandatory from P1.

---

# 7. Control Plane Database

Control plane owns:

```text
users
companies
workspaces
memberships
roles/permissions/scopes
feature entitlements
workspace data routes
dataset metadata/assignments
platform audit/session metadata as designed
```

The control plane does not become an accidental shared repository for all workspace operational visits/reports.

---

# 8. Workspace Database

Each workspace data store owns operational entities such as:

```text
organization units
workspace practitioners
workspace locations
routes/products/targets
plans
visits
reports
calendar activities
location evidence
recommendations
sync metadata as needed
```

Cross-database foreign keys are not assumed.

References to platform/global identities are opaque IDs validated through application/control-plane context.

---

# 9. Master Dataset / Practitioner Layer

Dataset catalog and canonical practitioner identity are logically separate from operational workspace databases.

Architecture may initially store some master metadata in the control-plane environment, but APIs/interfaces must preserve:

```text
Dataset service
Practitioner registry service
Dataset assignment service
```

Workspace code should consume assigned/projection records, not unrestricted platform catalog access.

---

# 10. API Organization

Suggested route families:

```text
/api/v1/auth/*
/api/v1/me/*
/api/v1/workspaces/:workspaceId/planner/*
/api/v1/workspaces/:workspaceId/customers/*
/api/v1/workspaces/:workspaceId/visits/*
/api/v1/workspaces/:workspaceId/reports/*
/api/v1/workspaces/:workspaceId/calendar/*
/api/v1/workspaces/:workspaceId/maps/*
/api/v1/workspaces/:workspaceId/recommendations/*

/api/v1/admin/company/*
/api/v1/admin/workspace/*
/api/v1/platform/*
```

The path workspace ID is never trusted by itself; it must match active authorized membership/scope.

---

# 11. Request Authorization Pipeline

```text
Request
→ Resolve secure session
→ Resolve user
→ Resolve active membership/workspace
→ Load/evaluate effective permissions + scopes
→ Check company/workspace status
→ Check feature entitlement if required
→ Validate input (Zod)
→ Resolve WorkspaceDataStore
→ Execute use case
→ Audit privileged action when required
→ Response
```

Deny by default on ambiguity.

---

# 12. Authentication Boundary

P1 should use secure cookie-based browser sessions rather than placing long-lived bearer credentials in localStorage.

Session cookies should be compatible with:

```text
HttpOnly
Secure
appropriate SameSite policy
rotation/revocation
```

Exact credential hashing/session implementation/library is finalized in a security ADR before production authentication is implemented.

Offline business data does not grant server access without a valid server session.

---

# 13. Frontend State Architecture

Separate:

```text
server state
local presentation state
offline domain state
```

Do not create one giant global store.

Examples:

### Server state

```text
current membership
company/workspace settings
online reports
```

### UI state

```text
open drawer
selected planner view
filter chips
```

### Offline domain state

```text
cached doctors
current plan
pending visits
sync operations
```

Offline domain state belongs in IndexedDB/service layer.

---

# 14. PWA Architecture

```text
React UI
  │
  ├── Domain repositories/use cases
  │       ├── Online API repository
  │       └── Offline/local repository
  │
  ├── Sync engine
  │       ├── push pending mutations
  │       ├── pull authorized changes
  │       └── conflict resolution
  │
  └── Service Worker
          ├── application shell/assets
          └── platform-supported background hooks
```

Core business synchronization must also work while the app is open; do not depend only on background Service Worker execution.

---

# 15. Planner Engine

`packages/planner-engine` owns business behavior such as:

```text
plan-day rules
duplicate detection
frequency context
daily target status
plan entry transitions
calendar conflict integration
```

It does not render Excel/List/Calendar views.

All views consume the same plan model.

---

# 16. Reporting Engine

Authoritative metrics are computed from domain records.

Examples:

```text
completed visits
product call counts
frequency completion
achievement
planned vs completed
```

If performance later requires aggregate tables, they are treated as caches/projections and must be rebuildable.

---

# 17. Calendar Engine

`packages/calendar-engine` owns:

```text
working-day resolution
holiday/closure layering
leave/trip/meeting constraints
unified calendar projections
planning conflict results
```

Planner and Recommendation Engine consume its service contracts.

---

# 18. Map Architecture

`packages/maps` defines neutral interfaces and provider adapters.

```text
Domain Location
      │
      ▼
MapProvider interface
   ├── Neshan adapter
   └── Google adapter
```

Provider-specific place IDs, route geometry, and API payloads do not become core customer identity.

---

# 19. Recommendation Architecture

```text
Authorized candidate query
→ Calendar hard constraints
→ Feature extraction
→ Deterministic scoring
→ Optional route optimization
→ Structured reasons
→ Recommendation batch
→ Optional LLM explanation
→ User acceptance
→ Plan entry
```

LLM never directly writes plan records.

---

# 20. Import Architecture

Bulk imports follow staged ingestion:

```text
Upload source file
→ Store original in R2 (policy permitting)
→ Parse into staging rows
→ Validate/normalize
→ Preview diff
→ User/admin confirms
→ Apply transaction/batch
→ Record manifest/result
→ Optional dataset/master matching
```

Never directly stream arbitrary Excel rows into production tables without preview/validation.

---

# 21. Security Boundaries

High-risk boundaries:

```text
browser ↔ Worker
control plane ↔ workspace data plane
workspace A ↔ workspace B
platform admin ↔ tenant operational data
offline cache ↔ next user on device
imported file ↔ parser/database
map/AI external providers ↔ internal data
```

Threat model is documented separately.

---

# 22. Logging and Audit

Separate:

```text
application diagnostics
security events
privileged audit
business/domain history
```

Do not log full sensitive report text, passwords, session secrets, raw location evidence, or unrestricted imported datasets in ordinary diagnostics.

---

# 23. Environment Strategy

At minimum:

```text
local
staging/RC
production
```

Staging and production must use isolated databases/storage/secrets.

No staging binding may point to production operational databases.

---

# 24. Migration Strategy

Maintain separate migration sets for:

```text
control plane
workspace schema
```

Every provisioned workspace data store records/applies workspace schema version.

Future provisioning needs:

```text
create workspace store
apply migrations
seed required reference config
register data route
health check
activate workspace
```

---

# 25. Testing Architecture

### Unit

Pure domain rules:

```text
achievement
frequency
duplicate detection
calendar constraints
verification evaluation
recommendation scoring
```

### Integration

```text
repositories
API authorization
workspace routing
imports
sync idempotency
```

### E2E

```text
login
planner parity workflow
visit report
offline workflow
cross-workspace denial
admin workflows later
```

Security isolation tests are first-class tests, not manual-only checks.

---

# 26. Initial Dependency Direction

Allowed direction:

```text
apps/*
  ↓
application/domain packages
  ↓
interfaces
  ↑
infrastructure adapters
```

Avoid domain package importing React, Hono, D1, Neshan, Google, or IndexedDB directly.

---

# 27. P1 Scaffold Target

P1 should establish:

```text
pnpm workspace
TypeScript config
apps/web
apps/worker
packages/domain
packages/permissions
packages/database
packages/ui
packages/shared
lint/typecheck/test scripts
basic CI
```

Then build:

```text
Login
AuthContext
Workspace context
Field User app shell
Home shell
Planner shell
Customers shell
Reports shell
Settings
```

Representative sample data is preferred before full P2 data wiring so UI can be reviewed early.

---

# 28. Architecture Exit Criteria

P0 architecture is ready for P1 when:

1. Domain code does not depend on UI/runtime providers.
2. Workspace database access is behind a router interface.
3. Control plane and workspace data plane are separate.
4. Auth context drives every workspace API request.
5. Map/AI providers are adapters.
6. Offline sync has explicit idempotency/conflict boundaries.
7. Excel parity maps cleanly to plan/visit/report domain entities.
8. Testing layers are defined.
9. Environment isolation is required.
10. Remaining technology decisions are documented as ADR/open decisions rather than hidden assumptions.

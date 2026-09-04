# FieldRep OS — Roadmap

**Baseline:** 2026-09-05  
**P0 status:** COMPLETE — architecture foundation ready for implementation  
**P1 status:** IN PROGRESS  
**Current work item:** P1-A8 — Representative sample data + responsive visual review

## Product priority

The first production-critical surface is the **Field User Workspace**. The current Excel Plan & Report workbook is its functional baseline.

Architecture anticipates the full SaaS platform, while implementation priority is:

```text
authenticated field user
→ Excel parity
→ operational calendar
→ offline PWA
→ maps/location
→ visit verification
→ AI-assisted planning
→ supervisor
→ company admin
→ platform admin/data catalog
```

---

## P0 — Product & Architecture Foundation — COMPLETE

Goal: define stable boundaries before application scaffolding.

### Completed work items

```text
P0-A1  Field User + Excel parity + PWA UX       DONE
P0-A2  Product vision + requirements             DONE
P0-A3  Tenancy/workspace/permission model        DONE
P0-A4  Conceptual domain/data model               DONE
P0-A5  Calendar/location/offline/AI interfaces    DONE
P0-A6  Architecture review + ADRs                 DONE
```

### P0 documents

```text
FIELD-USER-SPEC.md
EXCEL-PARITY-MATRIX.md
FRONTEND-PWA-UX-SPEC.md
UI-DESIGN-DIRECTION.md
PRODUCT-VISION.md
REQUIREMENTS.md
TENANCY-MODEL.md
PERMISSION-MATRIX.md
DATA-MODEL.md
CALENDAR-ACTIVITY-SPEC.md
MAPS-LOCATION-SPEC.md
OFFLINE-SYNC-SPEC.md
AI-PLANNER-SPEC.md
ARCHITECTURE.md
SECURITY-THREAT-MODEL.md
P0-ARCHITECTURE-REVIEW.md
adr/0001-monorepo-and-application-stack.md
adr/0002-workspace-data-isolation-and-routing.md
adr/0003-offline-first-field-user-sync.md
```

### P0 exit gate

- Company / Workspace / Organization Unit terminology frozen — PASS.
- Role and scope separated — PASS.
- Field-user behavior mapped from Excel — PASS for architecture stage.
- Planner/visit/report independent of UI — PASS.
- Multi-location customer model — PASS.
- Workspace database routing abstraction — PASS.
- Shared practitioner identity isolation — PASS.
- Offline idempotency/conflict boundaries — PASS.
- Provider-independent maps — PASS.
- Explainable/advisory AI boundary — PASS.
- Security/threat baseline — PASS.
- P1 can begin without known schema-breaking redesign — PASS.

Implementation-level ADR decisions intentionally deferred are listed in `P0-ARCHITECTURE-REVIEW.md`.

---

## P1 — Authentication + Field User Shell — IN PROGRESS

Goal: create the first real authenticated PWA shell.

### Internal sequence

```text
P1-A0  Scaffold repo/tooling + CI                       DONE
P1-A1  Shared domain/types + workspace context          DONE
P1-A2  Auth/security ADR + session foundation           DONE
P1-A3  Control/workspace DB baseline + data router      DONE
P1-A4  Permission middleware                            DONE
P1-A5  Field User responsive shell                      DONE
P1-A6  Jalali/RTL design-system foundation              DONE
P1-A7  Home/Calendar/Planner/Customers/Reports/Settings shells  DONE
P1-A8  Representative sample data + responsive visual review    CURRENT
P1-A9  PWA install/static shell foundation
P1-A10 P1 test/security gate
```

### P1 completed decisions

- TypeScript/pnpm monorepo scaffolded.
- React/Vite/Tailwind web shell and Cloudflare Worker/Hono API shell build in CI.
- Workspace selection and scoped authorization domain types implemented and tested.
- Authentication framework decision: Better Auth backed by CONTROL_DB/D1.
- Session identity kept separate from FieldRep OS membership/permission context.
- Email/password starts with Better Auth scrypt hashing; public production self-sign-up is disabled.
- Server-side database sessions use secure HttpOnly cookies; no long-lived auth token in browser storage.
- UUID v4 / `crypto.randomUUID()` selected for durable opaque domain IDs and offline-safe creation.
- Separate Control Plane and Workspace Plane SQL migrations validate on fresh SQLite databases in CI.
- `WorkspaceDataRouter` resolves logical control-plane routes to bound D1 stores and verifies physical `workspace_identity` before access.
- Authorization middleware is fail-closed for missing authentication, permissions, and cross-workspace route access.
- Responsive RTL shell uses a desktop right navigation rail and mobile bottom navigation with a primary quick-action slot.
- Jalali presentation utilities use timezone-aware `Intl` Persian calendar formatting behind reusable helpers.
- Semantic design tokens, visible focus states, minimum touch targets, and reduced-motion behavior form the P1 design-system baseline.
- Field User page shells now cover Home, Calendar, Plan & Report, Customers, Reports, Settings, and Visit Report.
- Planner shell exposes List / Calendar / Excel / Map as views of one future domain model rather than separate workflows.

### P1 implementation documents

- `DESIGN-SYSTEM.md`
- `adr/0004-authentication-session-and-identifier-strategy.md`
- `migrations/README.md`

### P1 scope

- Login/session
- Company/workspace context
- Authorization foundation
- Responsive mobile/desktop navigation
- Jalali UI foundation
- Home
- Calendar shell
- Planner shell + view switcher
- Customers shell
- Visit form shell
- Reports shell
- Settings
- PWA installation foundation
- Representative sample data for visual review

---

## P2 — Excel Parity / Core Field User Panel

Goal: allow a field user to replace the current workbook for core planning/reporting.

Scope:

- Doctors
- Routes
- Specialty/Class/Frequency
- Excel-style planner
- Calendar-style planner
- Mobile/list planner
- Jalali year/quarter planning
- Daily target
- Duplicate detection
- Products
- Plan vs actual visit
- Visit report
- Visited calculation
- Achievement calculation
- Daily/weekly/monthly reports
- Initial Excel import/migration

Primary acceptance source: `EXCEL-PARITY-MATRIX.md`.

---

## P3 — Operational Calendar & Activities

Scope:

- Approved Jalali month UI
- Week/day/agenda views
- Public holidays
- Company/workspace closures
- Working weekday rules
- Leave
- Business trip / mission
- Internal meetings
- Company programs
- Doctor programs
- Planning conflict engine

---

## P4 — Offline PWA & Synchronization

Scope:

- Installable PWA
- IndexedDB
- Authorized offline customer cache
- Offline plan/report capture
- Sync queue
- Retry states
- Conflict handling
- User/workspace local-data isolation

---

## P5 — Maps, Locations & Routing

Scope:

- Multiple locations per customer
- Location picker/editor
- Provider-independent map interface
- Neshan adapter first
- Google adapter where required
- Search/geocode/reverse-geocode
- Map planner view
- Nearby customers
- Distance matrix
- Route optimization
- External navigation

---

## P6 — Visit Location Verification

Scope:

- Check-in location capture
- GPS accuracy
- Selected target location
- Distance/geofence
- `verified / nearby / unverified / outside`
- Offline capture evidence
- Capture time vs sync time
- Company/workspace feature toggle

---

## P7 — AI-Assisted Planning

Scope:

- Explainable recommendation scoring
- Class/frequency/cycle urgency
- Last visit/missed visits
- Calendar constraints
- Leave/trip/meeting constraints
- Location/route efficiency
- Doctor availability foundation
- Next-day and next-week suggestions
- Accept/reject/edit workflow
- Structured reasons
- Optional LLM explanation layer

AI must not silently publish an official plan.

---

## P8 — Supervisor Workspace

Scope:

- Team dashboard
- Assigned-user drill-down
- Daily/weekly/monthly/cycle reports
- Coverage/frequency
- Activities
- Visit-verification summaries
- Permission-scoped exports

---

## P9 — Company & Workspace Administration

Scope:

- Company/workspace users
- Workspace admins
- Supervisors
- Teams/organization units
- Master doctors/pharmacies/products/routes
- Import preview and validation
- Working calendar settings
- Holidays/events
- Targets
- Feature settings
- Reporting
- Audit access

---

## P10 — Platform Administration

Scope:

- Companies/workspaces
- User/admin/supervisor limits
- Feature entitlements
- Global settings
- Workspace database routing registry
- Security/audit center
- Platform analytics
- Audited support/data-access workflows

---

## P11 — Dataset Catalog / Vault / Allocation

Scope:

- Imported/purchased/curated datasets
- Raw source archive
- Provenance
- Versions
- Normalization
- Duplicate review
- Practitioner matching
- Split/filter/build dataset
- Snapshot/live assignment
- Company/workspace licensing/entitlement
- Export center

---

## P12 — Production Hardening & Scale

Scope:

- Security review
- Rate limiting
- Privileged MFA options
- Backup/restore
- Disaster recovery
- Observability
- Performance/load tests
- Abuse controls
- Data retention workflows
- Full E2E regression
- Release/runbook process

---

## Engineering gate for every phase

Before phase closure:

1. Recheck requirements and roadmap.
2. Review cross-module dependencies.
3. Review schema/migrations.
4. Typecheck passes.
5. Unit tests pass.
6. Relevant integration/E2E tests pass.
7. Tenant/workspace isolation tests pass where applicable.
8. No unresolved critical/high defects.
9. Documentation updated.
10. Repository clean and closure recorded.

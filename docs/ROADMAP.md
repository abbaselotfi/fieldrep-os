# FieldRep OS — Roadmap

**Baseline:** 2026-09-05  
**P0 status:** COMPLETE — architecture foundation ready for implementation  
**P1 status:** COMPLETE — authenticated Field User shell/test-security gate passed  
**P2 status:** COMPLETE — real XLSM compatibility + Excel-parity regression gate passed  
**P3 status:** IN PROGRESS  
**Current work item:** P3-A6 — Specialized meetings + company programs + doctor programs

## Product priority

The first production-critical surface is the **Field User Workspace**. The legacy Plan & Report workbook remains its functional baseline, while FieldRep OS replaces spreadsheet implementation constraints with explicit domain models, secure APIs, responsive PWA UX and auditable persistence.

```text
authenticated field user
→ Excel parity                         COMPLETE
→ operational calendar                IN PROGRESS / P3
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

Goal: freeze the important platform boundaries before implementation.

```text
P0-A1  Field User + Excel parity + PWA UX       DONE
P0-A2  Product vision + requirements             DONE
P0-A3  Tenancy/workspace/permission model        DONE
P0-A4  Conceptual domain/data model              DONE
P0-A5  Calendar/location/offline/AI interfaces   DONE
P0-A6  Architecture review + ADRs                DONE
```

Key outcomes:

- Company → Workspace → Organization Unit/Team → User tenancy is explicit.
- Role, permission and scope are separated.
- Workspace data access is routed through an abstraction rather than hard-coded physical D1 assumptions.
- Customer multi-location, offline sync, provider-independent maps and advisory/explainable AI boundaries are defined.
- Field User behavior is mapped from the Excel baseline without treating the product as a spreadsheet clone.

Primary documents include `FIELD-USER-SPEC.md`, `EXCEL-PARITY-MATRIX.md`, `FRONTEND-PWA-UX-SPEC.md`, `UI-DESIGN-DIRECTION.md`, `PRODUCT-VISION.md`, `REQUIREMENTS.md`, `TENANCY-MODEL.md`, `PERMISSION-MATRIX.md`, `DATA-MODEL.md`, `CALENDAR-ACTIVITY-SPEC.md`, `MAPS-LOCATION-SPEC.md`, `OFFLINE-SYNC-SPEC.md`, `AI-PLANNER-SPEC.md`, `ARCHITECTURE.md`, `SECURITY-THREAT-MODEL.md`, `P0-ARCHITECTURE-REVIEW.md` and ADRs under `docs/adr/`.

---

## P1 — Authentication + Field User Shell — COMPLETE

Goal: create the first authenticated, responsive, installable PWA shell.

```text
P1-A0  Scaffold repo/tooling + CI                                DONE
P1-A1  Shared domain/types + workspace context                   DONE
P1-A2  Auth/security ADR + session foundation                    DONE
P1-A3  Control/workspace DB baseline + data router               DONE
P1-A4  Permission middleware                                     DONE
P1-A5  Field User responsive shell                               DONE
P1-A6  Jalali/RTL design-system foundation                       DONE
P1-A7  Home/Calendar/Planner/Customers/Reports/Settings shells   DONE
P1-A8  Representative sample data + responsive visual review     DONE
P1-A9  PWA install/static shell foundation                       DONE
P1-A10 P1 test/security gate                                     DONE
```

Key outcomes:

- React/Vite/Tailwind frontend and Cloudflare Worker/Hono backend build in CI.
- Better Auth is the authentication framework decision; FieldRep memberships/permissions remain separate from session identity.
- Secure HttpOnly cookie sessions are the production direction; no long-lived browser auth token.
- Control-plane and workspace-plane migrations validate independently.
- Authorization and workspace routing fail closed.
- Mobile bottom navigation and desktop right-side navigation are implemented.
- RTL/Jalali presentation and semantic design tokens form the UI foundation.
- PWA shell is installable and intentionally does not cache `/api/*` authenticated business traffic.

P1 remote Cloudflare/D1/Auth deployment remained deliberately deferred; phase closure was a code/security architecture gate, not a production deployment claim.

---

## P2 — Excel Parity / Core Field User Panel — COMPLETE

Goal: let a field user perform the core Plan & Report workflow without returning to the legacy workbook for missing core functionality.

### Internal sequence

```text
P2-A1   Executable Excel-parity rules and domain contracts        DONE
P2-A2   Doctor/customer + route repositories and APIs             DONE
P2-A3   Planning-cycle / Jalali quarter engine                    DONE
P2-A4   Planner domain engine + duplicate/frequency/target rules  DONE
P2-A5   Plan CRUD wired to List/Calendar/Excel views              DONE
P2-A6   Visit/report actuals + product counters                   DONE
P2-A7   Visited/Achievement calculations                          DONE
P2-A8   Daily/weekly/monthly reporting                            DONE
P2-A9   Initial workbook import/migration path                    DONE
P2-A10A Persian calendar correctness hardening                    DONE
P2-A10B Engine-driven Calendar UI integration                     DONE
P2-A10C Full Excel-parity regression/closure gate                 DONE
```

### P2 core decisions

- Plan and Actual Visit are distinct persisted concepts.
- Planned and Unplanned Actual Visits are supported.
- Products/Product Calls are separate from visit count.
- `Visited` is derived from completed Actual Visits, never from spreadsheet summary cells.
- `Achievement = Visited / Frequency`; zero-frequency records never divide by zero.
- Daily, Saturday-Friday weekly and Jalali monthly reports project the same Actual Visit facts.
- Planner duplicate, route, frequency and daily-target rules are executable and tested.
- List, Calendar and Excel-style planner presentations share the same plan model.
- Customer records retain clean canonical names; workbook-only combined labels such as `name + Class` are migration aliases, not canonical customer names.

### P2-A9 — real XLSM compatibility result

The exact uploaded XLSM was inspected and verified rather than inferred from historic notes.

Verified structural facts:

```text
Physision rows                    122
Unique physician names            122
Calendar verified week blocks      16
Visible Jalali date headers         95
Date span                    1405/03/30 → 1405/06/31
Matched Calendar Plan cells        359
Unknown Calendar customers           0
Daily-count mismatches                0
Traceable Report physician rows     79
Report route-marker rows             14
Unknown non-marker Report rows        0
```

The Calendar uses Saturday→Friday repeated week blocks, two route/session columns where available, seven doctor slots per session, and a daily count row. Friday has only the workbook's final primary column (`M`). Source cell coordinates are preserved for import provenance.

Important compatibility fix discovered during closure:

- `Physision` stores the clean doctor name in `نام پزشک`.
- Calendar/Report frequently use `Column1`, a combined display label containing name + Class.
- The importer now preserves that value only as `legacyAliases` and resolves it to the clean canonical customer.
- Alias collisions fail closed.

Workbook `Visited`, `Achievement` and product counters remain reconciliation evidence only and never fabricate Actual Visit history.

The raw workbook and customer-identifying data are not committed. `fixtures/p2/legacy-workbook-structure.json` contains only sanitized structural counts/invariants.

Implementation record: `P2-A9-WORKBOOK-IMPORT.md`.

### P2-A10 — Persian calendar correctness + UI

The one-year Excel calendar is not the production date engine.

FieldRep OS uses one authoritative deterministic Solar Hijri engine in `packages/domain/src/persian-calendar.ts`, pinned to current Unicode ICU PersianCalendar arithmetic/correction behavior. Planning cycles, import conversion and Calendar UI all delegate to that same engine.

The gate tests every valid day in the supported range 1300..1600 SH. An initial Borkowski-based implementation was rejected after exhaustive testing found a real one-day divergence at the 1502 correction boundary. The ICU-corrected implementation passes the unchanged regression.

Calendar coverage includes:

- >109,000 Jalali → canonical → Jalali round trips;
- >109,000 differential checks against current `Intl` Persian calendar;
- leap/common Esfand boundaries;
- Saturday-first weekday and Saturday-Friday week bounds;
- month-grid spillover and continuity;
- 95 consecutive date/weekday headers from the real XLSM;
- known current/Nowruz anchors.

The Field User Calendar UI renders from `buildPersianMonthGrid()` rather than hard-coded blank offsets or 31-day arrays. Official/public/religious holidays are a separate versioned annual dataset and never modify civil conversion math.

Implementation record: `P2-A10-CALENDAR-CORRECTNESS.md`.

### P2 dedicated regression gate

CI has an explicit `Validate P2 Excel parity` step (`pnpm validate:p2-parity`) in addition to the full test suite.

```text
SQL migration validation           PASS
PWA security validation            PASS
Legacy XLSM extractor validation   PASS
P2 Excel-parity focused gate       PASS
TypeScript                         PASS
Full unit suite                    PASS
Production build                   PASS
```

Primary acceptance source: `EXCEL-PARITY-MATRIX.md`.

---

## P3 — Operational Calendar & Activities — IN PROGRESS

Goal: turn the correct civil calendar into the complete operational work timeline used by a field representative and company/workspace calendar policy.

### Internal sequence

```text
P3-A1  Activity/calendar domain contracts + persistence                    DONE
P3-A2  Secured own-activity CRUD/API/client                                DONE
P3-A3  Working-week + official holidays + company/workspace overrides      DONE
P3-A4  Leave request workflow foundation                                   DONE
P3-A5  Business trip / mission model                                       DONE
P3-A6  Specialized meetings + company programs + doctor programs           CURRENT
P3-A7  Month/week/day/agenda projections + rich professional status cards
P3-A8  Planner/calendar conflict engine
P3-A9  Calendar/report activity reconciliation
P3-A10 P3 regression/security closure gate
```

### P3 completed decisions

- `activities` is authoritative for generic non-visit activities; `calendar_events` is a rebuildable unified timeline projection.
- Calendar projections cannot become Visit/Frequency/Achievement truth. Only authoritative Actual Visit records drive those KPIs.
- Generic own-activity API is owner-scoped and lets Field Users create `internal_meeting` and `custom_activity`; broader programs require scoped authority.
- Activity create/update/cancel keeps authoritative Activity and Calendar projection synchronized atomically.
- Working-day resolution is fail-closed when the verified annual official-calendar dataset or effective working-week policy is missing.
- Official holidays and company/workspace closures are hard blockers; a normal `working_day` override cannot silently reopen an official holiday or closure.
- Iran 1405 official holidays are stored as a versioned source-attributed dataset; runtime rendering never scrapes a website.
- Leave is a first-class workflow (`draft → requested → approved/rejected`) with owner cancellation only before decision. Only approved leave blocks Planner; Leave can never count as Visit KPI.
- Business Trip/Mission is independent from Leave/Meeting, supports ordered multiple destinations, purpose, transport and decision lifecycle. Approval provenance is retained after completion.
- A mission is not automatically an all-day Plan blocker: `blocksPlanning` is explicit because valid visits may occur in the destination city. Destination context is preserved for later city/route conflict and AI logic.
- Business Trips can never count as Visit KPI.
- The P3 visual baseline is **Clinical Enterprise** with a restrained combination of a thin semantic status rail and a readable soft status badge; color remains supplementary rather than the sole status signal.

Implementation records:

- `P3-VISUAL-BASELINE.md`
- `P3-A1-ACTIVITY-CALENDAR-FOUNDATION.md`
- `P3-A4-LEAVE-WORKFLOW.md`
- `P3-A5-BUSINESS-TRIP.md`

Scope:

- approved Jalali month UI plus week/day/agenda views;
- verified public/religious holidays;
- company/workspace closures;
- configurable working weekdays;
- leave;
- business trip / mission;
- internal meetings;
- company programs;
- doctor programs/events;
- planning conflict engine.

Activities must not incorrectly increment doctor Visit/Frequency/Achievement.

---

## P4 — Offline PWA & Synchronization

Scope: IndexedDB, authorized offline customer/plan cache, offline plan/report capture, sync queue, retry/conflict states, and strict user/workspace local-data isolation.

---

## P5 — Maps, Locations & Routing

Scope: multiple customer locations, provider-independent map adapter, Neshan first, Google where required, geocode/reverse/search, Map Planner, nearby customers, distance matrix, route optimization and external navigation.

---

## P6 — Visit Location Verification

Scope: check-in coordinates/accuracy, selected target, geofence distance, `verified / nearby / unverified / outside`, offline evidence, capture-vs-sync timestamps and company/workspace feature toggle.

---

## P7 — AI-Assisted Planning

Scope: explainable deterministic recommendation scoring using frequency/class/cycle urgency, last/missed visits, calendar constraints, location/route efficiency and later doctor availability; accept/reject/edit workflow; optional LLM explanation layer. AI must not silently publish an official plan.

---

## P8 — Supervisor Workspace

Scope: team dashboard, assigned-user drill-down, reporting, coverage/frequency, activities, visit-verification summaries and permission-scoped exports.

---

## P9 — Company & Workspace Administration

Scope: users/admins/supervisors, teams/org units, master customers/products/routes, imports, working calendar, holidays/events, targets, feature settings, reporting and audit access.

---

## P10 — Platform Administration

Scope: companies/workspaces, limits/entitlements, global settings, workspace database routing registry, security/audit center, platform analytics and audited support/data-access workflows.

---

## P11 — Dataset Catalog / Vault / Allocation

Scope: imported/purchased/curated datasets, raw archive, provenance/versioning, normalization/dedup review, practitioner matching, dataset splitting/building, snapshot/live assignment and export/licensing controls.

---

## P12 — Production Hardening & Scale

Scope: security review, rate limiting, privileged MFA, backup/restore/DR, observability, performance/load tests, abuse controls, retention workflows, full E2E regression and release/runbook process.

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
9. Documentation is current.
10. Repository/PR closure state is recorded.

# FieldRep OS — Roadmap

**Baseline:** 2026-09-07  
**P0 status:** COMPLETE — architecture foundation ready for implementation  
**P1 status:** COMPLETE — authenticated Field User shell/test-security gate passed  
**P2 status:** COMPLETE — real XLSM compatibility + Excel-parity regression gate passed  
**P3 status:** COMPLETE — operational calendar domain/APIs/UI + conflict-engine gate passed  
**P4 status:** COMPLETE — offline PWA & synchronization (IndexedDB cache/queue, authorized idempotent sync, offline capture with conflict handling, incremental pull)
**P8 status:** COMPLETE — supervisor workspace (team rollup + member drill-down + scoped export)
**P9 status:** COMPLETE — company & workspace administration (org units/features, master data, calendar/targets, audit reporting)
**P10 status:** COMPLETE — platform administration (companies/workspaces/limits, audit center, data routes, analytics/support access, settings/entitlements)  
**P11 status:** COMPLETE — dataset catalog/vault/allocation (catalog foundation, import & normalization, practitioner matching & dataset building, export/licensing controls + tenant data-path enforcement)
**P12 status:** COMPLETE — production hardening & scale (security hardening, observability, data lifecycle & recovery, performance & release readiness)

## Product priority

The first production-critical surface is the **Field User Workspace**. The legacy Plan & Report workbook remains its functional baseline, while FieldRep OS replaces spreadsheet implementation constraints with explicit domain models, secure APIs, responsive PWA UX and auditable persistence.

```text
authenticated field user
→ Excel parity                         COMPLETE
→ operational calendar                COMPLETE
→ offline PWA foundation               COMPLETE
→ offline sync + server idempotency    COMPLETE
→ maps/location                        COMPLETE
→ visit verification                   COMPLETE
→ AI-assisted planning                 COMPLETE
→ supervisor                           COMPLETE
→ company admin                        COMPLETE
→ platform admin/data catalog          COMPLETE
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

FieldRep OS now uses one authoritative deterministic Solar Hijri engine in `packages/domain/src/persian-calendar.ts`, pinned to the current Unicode ICU PersianCalendar arithmetic/correction behavior. Planning cycles, import conversion and Calendar UI all delegate to that same engine.

The gate intentionally tested every valid day in the supported range 1300..1600 SH. An initial Borkowski-based implementation was rejected after the exhaustive test found a real one-day divergence at the 1502 correction boundary. The ICU-corrected implementation passes the unchanged regression.

Calendar coverage includes:

- >109,000 Jalali → canonical → Jalali round trips;
- >109,000 differential checks against current `Intl` Persian calendar;
- leap/common Esfand boundaries;
- Saturday-first weekday and Saturday-Friday week bounds;
- month-grid spillover and continuity;
- 95 consecutive date/weekday headers from the real XLSM;
- known current/Nowruz anchors.

The actual Field User Calendar UI now renders from `buildPersianMonthGrid()` rather than hard-coded blank offsets or 31-day arrays. It supports month navigation, Today, spillover days, selected day, Friday state and activity overlays using a modern enterprise/pharma visual direction.

Official/public/religious holidays are a separate versioned annual dataset. University of Tehran Calendar Center is the primary official annual reference; Time.ir is an independent validation/reference source. Holiday datasets never modify the civil conversion algorithm.

Implementation record: `P2-A10-CALENDAR-CORRECTNESS.md`.

### P2 dedicated regression gate

CI now has an explicit `Validate P2 Excel parity` step (`pnpm validate:p2-parity`) in addition to the full test suite.

The sanitized golden structure asserts the verified workbook shape/counts. Focused regression tests cover the domain rules, calendar engine, workbook adapter/importer, repositories, secured APIs and preview UI projections.

P2 closure gate on branch `feat/p2-excel-parity-rules`:

```text
SQL migration validation           PASS
PWA security validation            PASS
Legacy XLSM extractor validation   PASS
P2 Excel-parity focused gate       PASS
TypeScript                         PASS
Full unit suite                    PASS
Production build                   PASS
```

No production Cloudflare/D1 data migration or deployment is claimed by P2; that is an isolated environment/deployment operation and is not required for the Excel-parity code gate.

Primary acceptance source: `EXCEL-PARITY-MATRIX.md`.

---

## P3 — Operational Calendar & Activities — COMPLETE

Goal: turn the correct civil calendar into the complete operational work timeline used by a field representative and company/workspace calendar policy.

```text
P3-A1  Activity/calendar domain contracts + persistence          DONE
P3-A2  Secured activity APIs + scope/ownership rules             DONE
P3-A3  Working-week policy + public holiday dataset composition  DONE
P3-A4  Company/workspace closures and overrides                  DONE
P3-A5  Leave workflow foundation                                 DONE
P3-A6  Business trip / mission model                             DONE
P3-A7  Internal meetings + company programs + doctor programs    DONE
P3-A8  Month/week/day/agenda projections and UI                  DONE
P3-A9  Planner/calendar conflict engine                          DONE
P3-A10 P3 regression/security closure gate                       DONE
```

Key outcomes:

- `packages/domain/src/calendar-activity.ts` defines the eleven calendar item categories with explicit per-category policy flags (`blocksPlanning / countsAsWorkingActivity / countsAsVisit / appearsInReport / requiresApproval`). `countsAsVisit` is `false` for every non-visit category, so meetings, programs, trips and closures can never increment doctor visit Frequency/Visited/Achievement.
- `packages/domain/src/working-calendar.ts` resolves the effective working-day context from layered rules (working weekdays + official holidays + company/workspace closures + approved leave + blocking activities) and exposes the planning conflict engine with `info / warning / block` severities and a versionable policy object.
- `evaluatePlanCandidate()` now accepts an optional calendar `dayContext`; a non-plannable day is a hard planner error and calendar conflicts are returned with the evaluation (Planner → Calendar service boundary per `CALENDAR-ACTIVITY-SPEC.md` §17).
- Migration `0007_calendar_activities.sql` adds `workspace_working_calendar`, `calendar_activities` (+ targets), `leave_requests`, `business_trips` and `calendar_closures` with workspace-match triggers, canonical-date closures and validation via `scripts/validate-migrations.mjs`. Visit rows are excluded at the schema level.
- `WorkspaceCalendarRepository` (packages/database) and `createCalendarApi()` (apps/worker) provide fail-closed, permission-scoped endpoints: unified `calendar/items` projection, `calendar/day/:date` working-day context + conflicts, working-calendar policy read, and field-user self-service leave/trip creation and cancellation (approval/rejection remains a supervisor/admin concern for P8/P9).
- Calendar UI (apps/web) renders month/week/day/agenda views from the domain projection and working-day model, with blocked-day reasons, activity dots and the selected-day status panel. Demo-backed records keep the UI reviewable before P4 backend wiring, exactly like the planner previews.
- Official holidays continue to be a versioned annual dataset (`official-calendar.ts`), composed into the working calendar — never inferred from calendar arithmetic.

Scope:

- approved Jalali month UI plus week/day/agenda views — delivered;
- verified public/religious holidays — composed from the official dataset layer;
- company/workspace closures — persisted with unique per-level per-day constraint;
- configurable working weekdays — `workspace_working_calendar` policy (defaults Sat–Thu);
- leave — annual/sick/hourly/emergency/other with draft→requested→approved/rejected/cancelled lifecycle (approval actions arrive with the supervisor workspace);
- business trip / mission — destination context recorded for planning/recommendations;
- internal meetings / company programs / doctor programs — unified activity store with scope and policy overrides;
- planning conflict engine — reason-based, policy-configurable, integrated into the planner engine.

P3 closure gate (local run, 2026-09-07):

```text
SQL migration validation           PASS
P2 Excel-parity focused gate       PASS
P3 calendar focused gate           PASS (51 focused tests)
TypeScript                         PASS
Full unit suite                    PASS (194 tests)
Production build                   PASS
```

Primary acceptance sources: `CALENDAR-ACTIVITY-SPEC.md`, `COMPETITIVE-ANALYSIS.md`.

---

## Industry best-practice integration

A structured review of Veeva Vault CRM, IQVIA OCE (Orchestrated Customer Engagement) and Sanofi's internal "Concierge for Field" experience is recorded in `COMPETITIVE-ANALYSIS.md`, with each adopted pattern mapped to the owning phase. Summary of phase-level effects:

- **P3 (this phase):** Veeva "My Schedule"-style day-first calendar, OCE-style separation of visit KPIs from non-visit activities, and the working-calendar/conflict layer were adopted and implemented.
- **P4 (offline):** adopt the OCE-style explicit sync-queue/checkpoint model with idempotent operation identity already anticipated by the data model.
- **P6 (verification):** adopt the Veeva-style check-in state machine (`verified / nearby / unverified / outside`) already scoped in this roadmap.
- **P7 (AI):** keep the explainable deterministic engine mandatory and add the Veeva "Agentic Call Report"-inspired LLM drafting only as an editable suggestion layer; adopt the Concierge pattern (one-tap daily briefing and an in-workspace assistant surface) inside the existing AI workspace boundaries.
- **P8/P9 (supervisor/admin):** adopt OCE-style coverage/frequency dashboards and policy configuration of calendar rules (working weekdays, closures, conflict severity policy).

No competitor UI is copied and no vendor-specific data model is imported; only behavioral patterns compatible with the tenancy/isolation and advisory-AI boundaries are adopted.

---

## P4 — Offline PWA & Synchronization

Goal: let a field user keep working during poor connectivity without silent data loss or tenant leaks, with clear saved/synced/conflict states.

```text
P4-A1  Offline PWA foundation (IndexedDB cache/sync-queue)      DONE
P4-A2  Authorized offline cache wiring + idempotent sync APIs   DONE
P4-A3  Offline plan/visit capture + retry/conflict UI           DONE
P4-A4  Server version/conflict detection + reconciliation       DONE
P4-A5  P4 test/security gate (offline scenarios 1–8)            DONE
```

Scope: IndexedDB, authorized offline customer/plan cache, offline plan/report capture, sync queue, retry/conflict states, and strict user/workspace local-data isolation.

### P4-A1 — Offline foundation (IndexedDB workspace cache) — COMPLETE

Key outcomes:

- `apps/web/src/offline/` is the new offline module: `types.ts` (SyncOperation envelope, statuses `pending/sending/applied/conflict/failed/superseded`, conflicts, pull cursor contracts), `ids.ts` (sortable ULID-style `operationId` + stable per-install `clientInstanceId`), `local-db.ts` (partitioned IndexedDB store), `sync-service.ts` (`OfflineSyncService`), and `sync-react.tsx` (React provider/hook + status pill).
- Every database is namespaced `user + workspace + local_store_version` (`LOCAL_STORE_VERSION`), with `cache`/`queue`/`meta` object stores. Queue operations survive reopens; the only data-wipe is the explicit `clearAll()` used for logout/prune — there is no implicit wipe and no `deleteObjectStore` upgrade path. Missing local-schema migrations throw `LocalSchemaMismatchError` instead of clearing.
- `OfflineSyncService` implements the `OFFLINE-SYNC-SPEC` §24 interface: `enqueue` (newer pending `update` supersedes older ones for the same entity), `pushPending`/`push` through an injectable `SyncTransport` (applied → cache write + audit, conflict → `conflict` state with resolution options, rejected → `failed`, transport error → exponential backoff with `nextRetryAt`), `listConflicts`/`resolveConflict` (`keep_server` / `retry_with_update` / `discard_local`), `getStatus` and cursor-driven `pullChanges`.
- The web shell now renders real offline states: the header status pill (همگام شده / آفلاین — ذخیره روی دستگاه / N در انتظار / تناقض / خطا) replaces the static "آنلاین" chip, and Settings gains a live sync card (queue/conflict/error counts, last sync time, sync-now and explicit local-clear). Demo partition `demo-user-1/demo-workspace-1` stands in for the authenticated identity until production auth wiring.
- The P4-A1 gate (`scripts/validate-p4-offline.mjs`, `pnpm validate:p4-offline`) asserts the spec invariants (partitioned namespace, update safety, operation envelope, UI states, SW-independent queue) and runs the offline suites (14 focused tests).

P4-A1 closure gate (local run, 2026-09-07):

```text
Offline focused tests                 PASS (14)
TypeScript (apps/web)                 PASS
Full suite gate                       PASS (pnpm check)
```

Primary acceptance sources: `OFFLINE-SYNC-SPEC.md`, `COMPETITIVE-ANALYSIS.md` §5 (OCE sync-queue/checkpoint model).

### P4-A2 — Authorized Idempotent Sync (DONE)

- Worker route `sync-api.ts`: `POST /workspaces/:workspaceId/sync/operations` applies offline mutations and `GET /workspaces/:workspaceId/sync/changes` serves authorized snapshot datasets for the partitioned device cache. Both are fail-closed: `sync.push.own` / `sync.pull.own` are required per PERMISSION-MATRIX, and the workspace is asserted before any repository resolution.
- Server-side idempotency (SPEC §7): migration `workspace/0008_sync_operations.sql` is the ledger (`operation_id` primary key, workspace/user bound, `json_valid(result_json)`), `WorkspaceSyncRepository` inserts with `ON CONFLICT(operation_id) DO NOTHING` and replays the stored result via `getRecorded`; a replayed `operationId` claimed by another workspace/user is rejected with `operation_binding_mismatch` instead of being answered from cache.
- Entities applied in this phase: `plan_entry` (create/update/delete), `visit` (create), `leave_request` and `business_trip` (create/transition) — each mapped to stable rejection codes (`outside_planning_cycle`, `duplicate_same_day`, `plan_already_completed`, `overlapping_leave`, …).
- Client transport `apps/web/src/offline/http-sync.ts`: `HttpSyncTransport` (push) and `createSyncPullProvider` (pull) plug into the P4-A1 `OfflineSyncService` through its `SyncTransport`/`SyncPullProvider` seams, so the queue never depends on Service Worker lifecycle.

### P4-A3 — Authorized Reference Hydration (DONE)

- Field-user reference data hydrates into the partitioned IndexedDB cache from authorized endpoints: customers (assignment-scoped), products and calendar activities (workspace/user/selected-user visibility filtering applied server-side), via `hydrateCacheFromSnapshot` / `hydrateReferenceData`.
- Network failure propagates as a typed error so the UI can surface the offline state instead of silently serving stale or partial data; dataset lists are explicit (a custom dataset list never touches reference datasets).

### P4-A4 — Incremental Pull & Conflict Reconciliation (DONE)

- Cursor semantics (SPEC §14): pull accepts an opaque `cursor`, passes it to cursor-aware repository methods as `fromDate`, and returns `serverTime`; the client stores `nextCursor` per dataset so the next pull is a true delta. Without a cursor the API returns the full snapshot (WIDE_FROM baseline) so a fresh device can bootstrap.
- Conflicts are modeled end-to-end (`SyncConflict` with `keep_server | retry_with_update | discard_local`): base-version mismatch surfaces as `base_version_conflict`, and `retry_with_update` adopts the server version before resending. Derived totals (visited/achievement) are never merged locally — they are read back from server visits.

### P4-A5 — Offline Test/Security Gate (DONE)

- Gate `scripts/validate-p4-sync-gate.mjs` (`pnpm validate:p4-sync`, part of `pnpm check`) fails closed on two levels:
  - **12 static security invariants** — push/pull authorization, tenant binding on replayed operation ids, conflict modeling, the `ON CONFLICT(operation_id) DO NOTHING` ledger, workspace-scoped ledger reads, user-scoped listing, versioned local namespace, no implicit local wipe (`LocalSchemaMismatchError`), no `deleteObjectStore`, sync engine outside the Service Worker, explicit conflict resolutions;
  - **scenario coverage map** — each of the eight OFFLINE-SYNC-SPEC §25 scenarios must carry an explicit `P4-A5 scenario N` marker in its owning suite, so a scenario can never be silently dropped; the gate then runs the five offline/sync suites.
- Scenario evidence: (1) offline plan → one server entry, (2) visit retried after a lost response → one server visit (asserts the repository is called exactly once), (3) same plan edited on two clients → conflict, (4) logout isolation between user partitions, (5) revoked/absent authorization → push refused/rejected, (6) PWA update with pending operations → work survives, (7) offline location evidence keeps its capture time, (8) derived totals reconcile with server-authoritative visits.

Acceptance: 3 new P4-A5 tests (visit lost-response idempotency, authoritative ledger result, client totals never echoed) plus scenario markers across the offline/sync suites; full suite 112 test files / 879 tests green; the P4-A5 gate observed `FAIL` while scenario 4 was double-claimed and `PASS` after the marker was corrected; typecheck, migrations (control 9 + workspace 10), web+worker builds pass.

**P4 status: COMPLETE** — offline foundation (A1), authorized idempotent sync (A2), reference hydration (A3), incremental pull & conflict reconciliation (A4), offline test/security gate (A5).

---

## P5 — Maps, Locations & Routing

Scope: multiple customer locations, provider-independent map adapter, Neshan first, Google where required, geocode/reverse/search, Map Planner, nearby customers, distance matrix, route optimization and external navigation.

### Status

| Step | Description | Status |
|------|-------------|--------|
| P5-A1 | Geospatial service core — authorized nearby search, deterministic stop-order optimization, provider-independent map adapter (Neshan first) | DONE (2026-09-09) |
| P5-A2 | Distance matrix & external navigation — internal haversine matrix (privacy-preserving), Neshan/Google navigation deep links | DONE (2026-09-09) |

### P5-A1 — Geospatial Service Core (DONE)

- Three small domain modules (MAPS-LOCATION-SPEC §14/§16, provider boundary):
  - `nearby-customers.ts` — `findNearbyCustomers`: authorization enforced *before* ranking (§14), radius filter, distance sort with deterministic id tie-break, device point never forwarded to providers (§14/§25 privacy boundary).
  - `route-optimization.ts` — `optimizeStopOrder`: nearest-neighbour heuristic with optional start/end, producing a *proposed* `orderedStopIds` sequence + leg distances; never silently rewrites an official plan (§16 rule); deterministic (§21-style id tie-break).
  - `map-provider.ts` — `MapAdapter` contract returning describable HTTP requests (`url` + headers), `createNeshanMapAdapter` static-map v2 with `Api-Key` header auth, marker formatting and zoom clamping; provider geometry stays presentation data, never a business object (§15).
- Note: distance matrix and external navigation remain open under P5-A2+.

Acceptance: 58 test files green (typecheck, migrations, P2/P3/P4 gates, full vitest suite, web+worker builds).

### P5-A2 — Distance Matrix & External Navigation (DONE)

- Two small domain modules:
  - `distance-matrix.ts` — `buildDistanceMatrix`: pairwise haversine with `entries` + direct `byId` lookup; self-pairs excluded by default; **no location data leaves the system for pairwise distances** (§25 privacy boundary) — provider matrices stay optional for road distances at the edge.
  - `external-navigation.ts` — `buildNavigationLink(s)`: user-initiated deep links (Neshan first: `neshan.org/maps/?lat&lng&title`; Google: `maps/dir/?api=1&destination`); coordinates encoded, optional title param; nothing flows anywhere until the user taps the link (explicit action, no background tracking).

Acceptance: 60 test files green (typecheck, migrations, P2/P3/P4 gates, full vitest suite, web+worker builds).

---

## P6 — Visit Location Verification

Scope: check-in coordinates/accuracy, selected target, geofence distance, `verified / nearby / unverified / outside`, offline evidence, capture-vs-sync timestamps and company/workspace feature toggle.

### Status

| Step | Description | Status |
|------|-------------|--------|
| P6-A1 | Location evidence foundation — domain model + validation, `visit_location_evidence` table, evidence push/pull endpoints, device GPS capture helper | DONE (2026-09-09) |
| P6-A2 | Geofence verification — haversine distance, policy thresholds, application-owned evaluation (`verified/nearby/unverified/outside`), persistence, evaluation endpoint with workspace toggle | DONE (2026-09-09) |
| P6-A3 | Check-in UI flow — one-shot capture+evaluate module, Persian verification badge, wired into the visit call-report page | DONE (2026-09-09) |

### P6-A2 — Geofence Verification (DONE)

- Domain, three small modules:
  - `geo-distance.ts` — haversine `distanceMetersBetween` (no provider dependency; policy is application-owned per MAPS-LOCATION-SPEC §23).
  - `visit-verification-policy.ts` — `DEFAULT_VISIT_VERIFICATION_POLICY` (verified ≤ 150 m, nearby ≤ 500 m, max accuracy 100 m) with `normalizeVisitVerificationPolicy` guards (nearby never stricter than verified).
  - `visit-verification.ts` — `evaluateVisitVerification` producing spec §24 result shape with stable reason codes (`within_verified_radius`, `within_nearby_radius`, `beyond_nearby_radius`, `accuracy_exceeds_limit`, `target_location_missing`, `offline_capture`); accuracy participates in the decision.
- Migration `0010_visit_verification.sql`: `visit_verification_results` (one per visit, upsert on re-evaluation, reason codes stored as JSON).
- Repository `WorkspaceVisitVerificationRepository` (upsert + tenant-scoped read).
- Route `visit-verification-api.ts` (separate small module): `POST /workspaces/:id/visits/:visitId/verification` (evaluate + persist, `visits.create.own`) and `GET` variant (`visits.read.own`), gated by `isVerificationEnabled(workspaceId)` feature toggle returning stable `verification_disabled`.
- Competitive basis: OCE/Sanofi check-in verification labels, Veeva tenant scoping (`COMPETITIVE-ANALYSIS.md` §6).

Acceptance: 45 test files green (typecheck, migrations, P2/P3/P4 gates, full vitest suite, web+worker builds).

### P6-A3 — Check-in UI Flow (DONE)

- `apps/web/src/features/visits/visit-location-flow.ts`: `runVisitLocationCheck` composes device capture + capture-mode derivation + domain geofence evaluation in one injectable, testable call (capture function and clock injectable).
- `apps/web/src/features/visits/VisitLocationBadge.tsx`: Persian status badge (`تأیید شده / نزدیک / تأییدنشده / خارج از محدوده`) with distance display, semantic color tokens, screen-reader reason text; pure helpers `verificationStatusLabel`/`verificationReasonLabels` exported for reuse.
- `VisitPage.tsx`: small integration — «ثبت موقعیت و بررسی محدوده» button, pending/error states, badge row; state resets on plan change; preview footnote updated (real device GPS is evaluated against the domain policy, but not persisted until the real API connection).
- Demo target: optional `latitude/longitude` on preview customer locations (only the first customer carries coordinates → honest `target_location_missing` for the rest).
- Competitive basis: OCE one-tap check-in verification UX.

Acceptance: 46 test files green (typecheck, migrations, P2/P3/P4 gates, full vitest suite, web+worker builds).

### P6-A1 — Location Evidence Foundation (DONE)

- Domain (`packages/domain/src/location-evidence.ts`): `LocationEvidence` model, WGS-84 validation (`validateLocationEvidenceInput`), capture-mode taxonomy `gps / network / manual / offline` derived from connectivity + accuracy (`deriveLocationCaptureMode`).
- Migration `0009_visit_location_evidence.sql`: one evidence record per visit (`UNIQUE(visit_id)`), FK to `visits`, coordinate CHECK constraints, owner index.
- Repository `WorkspaceLocationEvidenceRepository`: ownership-gated record (tenant isolation), duplicate rejection, verbatim client capture + `server_received_at` receipt time (Sanofi-style evidence chain).
- API (`apps/worker` visit-api): `POST /workspaces/:id/visits/:visitId/location-evidence` (permission `visits.create.own`, stable 400/404/409 error mapping) and `GET .../location-evidence` (`visits.read.own`).
- Web client: `OwnVisitHttpClient.recordLocationEvidence/locationEvidence` and `capture-location.ts` Geolocation wrapper with stable error codes (`geolocation_unsupported / permission_denied / position_unavailable / timeout`).
- Competitive basis: IQVIA OCE GPS visit evidence, Sanofi offline capture flags, Veeva tenant scoping (`COMPETITIVE-ANALYSIS.md` §6).

Acceptance: 40 test files green (typecheck, migrations, P2/P3/P4 gates, full vitest suite, web+worker builds).

---

## P7 — AI-Assisted Planning

Scope: explainable deterministic recommendation scoring using frequency/class/cycle urgency, last/missed visits, calendar constraints, location/route efficiency and later doctor availability; accept/reject/edit workflow; optional LLM explanation layer. AI must not silently publish an official plan.

### Status

| Step | Description | Status |
|------|-------------|--------|
| P7-A1 | Deterministic recommendation engine core — feature derivation, versioned weights, structured reasons, hard-constraint gating, deterministic ranking | DONE (2026-09-09) |
| P7-A2 | Suggestion batch & acceptance workflow — batch envelope (§11), priority bands, accept/reject/edit decisions with `ai_suggestion` provenance (§13) | DONE (2026-09-09) |
| P7-A3 | AI page wiring — live preview batch from the real engine, Persian reason/band labels, accept/reject/edit-date actions on preview state | DONE (2026-09-09) |

---

## P8 — Supervisor Workspace

Scope: team dashboard, assigned-user drill-down, reporting, coverage/frequency, activities, visit-verification summaries and permission-scoped exports.

### Status

| Step | Description | Status |
|------|-------------|--------|
| P8-A1 | Team rollup foundation — deterministic progress/verification aggregation, permission-scoped supervisor endpoints, supervisor dashboard page | DONE (2026-09-10) |
| P8-A2 | Assigned-user drill-down — deterministic per-member coverage projection, scoped member-coverage endpoint, interactive drill-down panel | DONE (2026-09-10) |
| P8-A3 | Permission-scoped team export — deterministic CSV over the authorized team subtree served from the coverage facts | DONE (2026-09-10) |

### P8-A1 — Team Rollup Foundation (DONE)

- Two small domain modules (no файлов over ~110 lines):
  - `team-progress.ts` — `buildTeamProgressSummary`: filters nothing itself (team-subtree filtering stays upstream behind `plans.read.team` per PERMISSION-MATRIX scope model), aggregates per-member plan/visit facts into team totals + deterministic member rows (userId-sorted); `plans.read.team`/`reports.read.team` added as team-scoped reads.
  - `verification-summary.ts` — `summarizeVerifications`: per-user + team `verified/nearby/unverified/outside` counts with `verifiedRatio`; same upstream-scoping model (`reports.read.team`).
- Worker route module `supervisor-api.ts`: read-only `GET /workspaces/:id/supervisor/team-progress` and `/supervisor/verification-summary`, each with `requireWorkspacePermission` + canonical-date range validation (`invalid_supervisor_range`); repository ports inject `authorizedTeamMembers`-filtered facts — the route only aggregates what it receives.
- Web: `TeamPage.tsx` (`/team` in desktop nav) renders MetricCards + per-member plan bars + verification mix from the same domain aggregators the API serves (demo facts stand in until the TeamPage wires to the live endpoints).
- Competitive basis: Veeva team dashboards, OCE coverage summaries (`COMPETITIVE-ANALYSIS.md` §6).

Acceptance: 63 test files / 364 tests green (typecheck, migrations, P2/P3/P4 gates, full vitest suite, web+worker builds).

### P8-A2 — Assigned-User Drill-Down (DONE)

- One small domain module (`member-drill-down.ts`, ~70 lines): `buildMemberDrillDown` projects per-member, per-customer coverage rows (`completedVisits / requiredFrequency`, `remaining`, deterministic customerId order); the not-required edge case pins to full coverage. Filtering stays upstream behind `reports.read.team`.
- Worker route module extension (same `supervisor-api.ts`, three small blocks): read-only `GET /workspaces/:id/supervisor/members/:memberUserId/coverage` with the same `requireWorkspacePermission` + canonical-date range validation; a `listMemberCoverageFacts` repository port carries the authorized team-subtree facts.
- Web: one presentational component (`MemberDrillDownTable.tsx`, ~80 lines, Persian coverage bands from `describeCoverageBand`) wired into `TeamPage.tsx` — selecting a member renders their coverage table; unknown ids can never render a panel.
- Competitive basis: Veeva drill-down coverage, OCE per-member frequency rollups (`COMPETITIVE-ANALYSIS.md` §6).

Acceptance: 66 test files / 375 tests green (typecheck, migrations, P2/P3/P4 gates, full vitest suite, web+worker builds).

### P8-A3 — Permission-Scoped Team Export (DONE)

- One small domain module (`team-export.ts`, ~60 lines): `TeamExportRow` + `serializeTeamCoverageCsv` — deterministic CSV (fixed header order, userId-then-customerId sort) with proper cell quoting, so the same fact set always produces byte-identical output. No new filtering here; the route only exports what the authorized coverage facts already resolved.
- Worker route module extension (same `supervisor-api.ts`, one small block): read-only `GET /workspaces/:id/supervisor/coverage-export` with the same `requireWorkspacePermission('reports.read.team')` + canonical-date range validation; collects per-member drill-down rows over `listMemberCoverageFacts` and serves `text/csv` with a download filename.
- Competitive basis: Veeva team exports, OCE coverage summaries (`COMPETITIVE-ANALYSIS.md` §6).

Acceptance: 66 test files / 374 tests green (typecheck, migrations, P2/P3/P4 gates, full vitest suite, web+worker builds).

### P7-A1 — Recommendation Engine Core (DONE)

- Four small domain modules (AI-PLANNER-SPEC §4–§9, §20–§21):
  - `recommendation-features.ts` — `deriveRecommendationFeatures` from authorized frequency/recency/cycle inputs; all factors normalized to explainable 0..1 ranges (`frequencyGapRatio`, `cycleUrgency`, clamped class/route weights).
  - `recommendation-policy.ts` — versioned coefficients (`RECOMMENDATION_ENGINE_VERSION = 'fieldrep-rec-1.0.0'`, defaults: gap 30 / class 20 / urgency 20 / recency 15 / route 15) with normalization guards; coefficients are never buried in prompts (§8).
  - `recommendation-scoring.ts` — additive `scoreRecommendationCandidate` emitting spec §9 structured reasons (`frequency_gap`, `class_priority`, `cycle_urgency`, `days_since_last_visit`, `route_affinity`) with per-factor contribution; silent factors are omitted from reasons.
  - `recommendation-candidate.ts` — spec §6 candidate contract, `candidateIsAllowed` hard-constraint gate (§5: scores can never bypass blocking constraints), `rankRecommendationCandidates` with deterministic order (allowed first, score desc, id tiebreak — §21).
- Competitive basis: OCE Next-Best-Activity scoring, Veeva suggested-call signals, Sanofi explainable suggestions (`COMPETITIVE-ANALYSIS.md` §6).

Acceptance: 49 test files green (typecheck, migrations, P2/P3/P4 gates, full vitest suite, web+worker builds).

### P7-A2 — Suggestion Batch & Acceptance Workflow (DONE)

- Three small domain modules:
  - `recommendation-suggestion.ts` — spec §12 `VisitSuggestion` + status lifecycle (`suggested/accepted/rejected/edited/converted_to_plan/expired`) + application-owned `derivePriorityBand` (`very_high ≥ 75%`, `high ≥ 50%`, `medium ≥ 30%` of the explainable max, band scales with workspace weight overrides).
  - `recommendation-batch.ts` — spec §11 envelope (`engineVersion` + `policyVersion = 'fieldrep-rec-weights-1'`); only allowed candidates become suggestions (§5), date/location assignment walks the deterministic ranked order and each candidate's eligible lists (§21 reproducible).
  - `recommendation-acceptance.ts` — spec §13 state machine: `accept` → `AcceptedPlanSeed` with `source: 'ai_suggestion'` + `sourceSuggestionId` provenance; `reject` → no seed; `edit` requires an actual date/location change and validates the date format; closed suggestions (`converted_to_plan/expired/rejected`) can no longer be decided. Nothing publishes an official plan by itself — conversion stays an explicit user action.
- Competitive basis: OCE orchestrated suggestion workflow, Veeva suggested-call acceptance, Sanofi explainable recommendation bands (`COMPETITIVE-ANALYSIS.md` §6).

Acceptance: 52 test files green (typecheck, migrations, P2/P3/P4 gates, full vitest suite, web+worker builds).

### P7-A3 — AI Page Wiring (DONE)

- `apps/web/src/features/ai/build-preview-batch.ts` — feeds the real deterministic engine with demo-workspace inputs (frequency targets, class weights A=1/B=0.6/C=0.3, preview cycle context); no fabricated scores.
- `apps/web/src/features/ai/recommendation-labels.ts` — Persian labels for reason codes, priority bands, suggestion statuses; `describeSuggestion` derives the natural explanation from structured reasons (§10 — reproducible, auditable).
- `apps/web/src/features/ai/suggestion-state.ts` — pure reducer around the domain §13 decisions; unknown ids ignored so stale events cannot resurrect closed suggestions.
- `AiPage.tsx` — live suggestion list with band chips, score, status chips, Persian reason line, accept/reject buttons and per-suggestion date selector (edit); engine/policy versions displayed; explicit copy that only user acceptance converts a suggestion into a plan.

Acceptance: 55 test files green (typecheck, migrations, P2/P3/P4 gates, full vitest suite, web+worker builds).

---

## P8 — Supervisor Workspace

Scope: team dashboard, assigned-user drill-down, reporting, coverage/frequency, activities, visit-verification summaries and permission-scoped exports.

### Status

| Step | Description | Status |
|------|-------------|--------|
| P8-A1 | Supervisor team rollup foundation — `TeamMemberProgress`/`buildTeamProgressSummary`, `VerificationEntry`/`summarizeVerifications`, `plans.read.team`+`reports.read.team` permissions, scoped team rollup endpoints | DONE |
| P8-A2 | Assigned-user drill-down — `buildMemberDrillDown` (domain coverage projection), scoped member coverage endpoint, team panel UI with member navigation | DONE |
| P8-A3 | Permission-scoped team coverage export — `serializeTeamCoverageCsv` (deterministic CSV, audit-replayable), `GET coverage-export` reusing authorized scope | DONE |

---

## P9 — Company & Workspace Administration

Scope: users/admins/supervisors, teams/org units, master customers/products/routes, imports, working calendar, holidays/events, targets, feature settings, reporting and audit access.

### Status

| Step | Description | Status |
|------|-------------|--------|
| P9-A1 | Organization & feature administration core — `org-unit-tree.ts` (deterministic tree, descendant scope resolution, cycle/cross-workspace parent guards) + `workspace-feature-policy.ts` (fail-closed workspace feature gates) + workspace-admin & company-admin permission bundles (PERMISSION-MATRIX §8/§9) | DONE (2026-09-10) |
| P9-A2 | Org-unit/membership repositories + admin endpoints — `org-admin-repository.ts` (workspace-scoped store, cycle/cross-workspace guards, feature-setting upserts) + `org-admin-api.ts` (org-unit tree/move, membership assign, feature toggle read/write, permission-scoped) | DONE (2026-09-10) |
| P9-A3 | Master data catalog (customers/products/routes) + import administration | DONE (2026-09-11) |
| P9-A4 | Working-calendar, holidays/events, targets policy administration | DONE (2026-09-11) |
| P9-A5 | Admin reporting + audit access UI | DONE (2026-09-15) |

### P9-A1 — Organization & Feature Administration Core (DONE)

- Two small domain modules + permission bundles:
  - `org-unit-tree.ts` — `buildOrgUnitTree` (deterministic, children sorted by id, missing parent tolerated as root), `collectOrgUnitDescendants`/`orgUnitContains` (enable `includeDescendants` scope evaluation, PERMISSION-MATRIX §3), `validateOrgUnitParentChange` (cycle/self/missing/cross-workspace rejection before any write).
  - `workspace-feature-policy.ts` — `WORKSPACE_FEATURE_KEYS` (`visit_verification`, `offline_sync`, `ai_planning`, `maps_location`, `supervisor_workspace`, `company_admin_workspace`), `resolveWorkspaceFeatureState` and `isWorkspaceFeatureEnabled` with fail-closed semantics; unknown/missing keys disable, latest `updatedAt` wins.
  - `packages/permissions` — `WORKSPACE_ADMIN_PERMISSIONS` (§8) and `COMPANY_ADMIN_PERMISSIONS` (§9), scoped so a company admin never implies operational workspace access.
- Competitive basis: Veeva feature/licensing gates + admin-controlled scope (`COMPETITIVE-ANALYSIS.md` §3).

### P9-A2 — Org-Unit/Membership Repository + Admin Endpoints (DONE)

- Two small modules (no new migration — tables from 0001):
  - `packages/database/src/org-admin-repository.ts` — `WorkspaceOrgAdminRepository`: `listOrgUnits`/`listMemberships`, `moveOrgUnit` (re-validates via `validateOrgUnitParentChange` before any write; returns the domain error code, never writes on cycle/cross-workspace), `assignMembership` (re-checks both the unit and the membership exist in this workspace before updating), `setFeatureSettings` (upsert into `workspace_settings` keyed `feature:<key>`, with `updated_by_user_id`).
  - `apps/worker/src/routes/org-admin-api.ts` — `createOrgAdminApi`, permission-scoped per PERMISSION-MATRIX §8:
    - `GET /workspaces/:id/org-units` → deterministic org-unit tree (`org_units.manage.workspace`);
    - `PATCH /workspaces/:id/org-units/:unitId/parent` → 409 with `org_unit_move_<reason>` on invalid move;
    - `POST /workspaces/:id/org-units/:unitId/members` → 404 on unknown unit/membership (`memberships.manage.workspace`);
    - `GET/PUT /workspaces/:id/features` → resolved fail-closed states / toggle write (`workspace.settings.manage`), unknown keys rejected 400.
- Small gateway interface (`OrgAdminGateway`) keeps the route test-friendly without coupling to the D1 store.
- Competitive basis: Veeva/Vault admin console patterns (`COMPETITIVE-ANALYSIS.md` §3).

Acceptance: 15 focused tests; full suite 71 test files / 408 tests green; gates (typecheck, migrations, P2/P3/P4) and web+worker builds pass.

Acceptance: 19 new focused tests; full suite 69 test files / 393 tests green; gates (typecheck, migrations, P2/P3/P4) and web+worker builds pass.

### P9-A4 — Working-Calendar, Closures & Targets Policy Administration (DONE)

- Domain module `calendar-admin-contracts.ts`:
  - `CalendarClosureLevel` / `CreateCalendarClosureInput` shared contracts;
  - `TargetsPolicy` aggregate (class frequency map, default daily target, max daily visits) + deterministic `normalizeTargetsPolicy` (clamps negatives/non-integers, drops malformed class weights) and `DEFAULT_TARGETS_POLICY` defaults.
- Repository `calendar-admin-repository.ts` — `WorkspaceCalendarAdminRepository` (small, admin-only):
  - working-calendar config read/update (idempotent upsert, invalid weekday indexes filtered);
  - `createClosure` upsert by natural key `(workspace_id, closure_level, canonical_date)` — repeated insert of the same holiday updates the label, never duplicates (Sanofi/Veeva holiday-management pattern);
  - `deleteClosure` physical delete (closures are policy rows, not audit facts);
  - targets policy read/update over the generic `workspace_settings` store keyed `planning:targets` (fail-safe defaults; merge-on-write).
- API `calendar-admin-api.ts` — permission-scoped per PERMISSION-MATRIX §8:
  - `GET/PUT /workspaces/:id/calendar-config` (`calendar.manage.workspace`);
  - `GET/POST /workspaces/:id/closures` + `DELETE .../closures/:id` (`holidays.manage.workspace`), canonical-date validation and range inversion guard;
  - `GET/PUT /workspaces/:id/targets-policy` (`targets.manage.workspace`), empty-patch rejection.
- Competitive basis: Veeva Vault holiday/closure scheduling + OCE org targeting (`COMPETITIVE-ANALYSIS.md` §3).

Acceptance: 30 new focused tests (8 repository + 15 API + 7 platform-admin domain from P10-A1); full suite 78 test files / 478 tests green; typecheck, migrations, web+worker builds pass.

### P9-A5 — Admin Reporting + Audit Access (DONE)

- Domain module `admin-audit.ts`:
  - `AuditEvent` / `AuditEventFilter` contracts and `buildAuditActionSummary` — deterministic aggregation (count-desc, then `actionKey` sort) of audit events into `AuditActionSummary` rows for the admin reporting surface.
- Repository `audit-repository.ts` — `WorkspaceAuditRepository` over `workspace_audit_events`:
  - `workspace_id` is always the first WHERE condition (fail-closed tenancy — a filter can never widen scope, only narrow it);
  - optional actor/entity/action/time-range filters; `ORDER BY occurred_at DESC`; limit clamped with default cap 200.
- API `audit-admin-api.ts` — permission-scoped per PERMISSION-MATRIX §8:
  - `GET /workspaces/:id/audit-events` (`audit.read.workspace`);
  - `GET /workspaces/:id/admin/report/audit-summary` (`reports.read.workspace`), aggregated via `buildAuditActionSummary`;
  - zod query validation (limit max 200); 401/403 and cross-workspace-before-resolution guards tested.
- Competitive basis: Veeva Vault audit-trail review + OCE admin reporting patterns (`COMPETITIVE-ANALYSIS.md` §3).

Acceptance: 15 new focused tests (2 domain + 5 repository + 8 API); full suite 81 test files / 493 tests green; typecheck, migrations (control 2 + workspace 10), web+worker builds pass.

## P10 — Platform Administration

Scope: companies/workspaces, limits/entitlements, global settings, workspace database routing registry, security/audit center, platform analytics and audited support/data-access workflows.

### P10-A1 — Platform Admin Foundation: Companies, Workspaces, Limits (DONE)

- Domain module `platform-admin.ts`:
  - `Company`/`Workspace` lifecycle models mirroring control-plane migration-0001 schema (slug-based, status `active/suspended/archived`);
  - `PlatformLimits` aggregate with usage (`canCreateWorkspace`/`canAddUser` guards);
  - `slugifyName` deterministic slug derivation for company/workspace names.
- Migration `0002_platform_admin.sql` — dedicated `platform_limits` ledger (companies/workspaces already in 0001; limits never embedded in the tenant rows).
- Repository `platform-admin-repository.ts` — `ControlPlanePlatformAdminRepository` over the control database (not the workspace router): list/get/create companies & workspaces, status transitions, `getLimits` with fail-safe defaults, idempotent `updateLimits` upsert, archived-aware workspace counting.
- API `platform-admin-api.ts` — permission-scoped per PERMISSION-MATRIX §10 (`companies.read/manage`, `workspaces.read.all/manage`, `limits.read/manage`): `GET/POST /platform/companies`, `GET/POST /platform/companies/:id/workspaces`, `GET/PUT /platform/companies/:id/limits` with 404 on unknown company.
- Competitive basis: Veeva Vault platform admin console + tenant limits, OCE org provisioning patterns (`COMPETITIVE-ANALYSIS.md` §3).

Acceptance: 26 new focused tests (7 domain + 9 repository + 11 API — plus 2 platform-admin domain guard tests); full suite 76 test files / 455 tests green; typecheck, migrations (control 2 + workspace 10), web+worker builds pass.

### P10-A2 — Platform Audit Center + Data-Route Registry (DONE)

- Domain module `platform-operations.ts`:
  - `PlatformAuditEvent` / `PlatformAuditEventFilter` mirroring the control-plane `platform_audit_events` table (company/workspace/actor/action/target-type/time filters are narrowing-only);
  - `WorkspaceDataRoute` / `UpsertDataRouteInput` mirroring `workspace_data_routes` (`d1/service/sql/other` stores, `active/maintenance/disabled` statuses);
  - deterministic `validateRouteStatusChange` — fail-closed transition guard: a disabled route may only return via `active` (health re-check forced), `disabled → maintenance` is rejected; same-status updates are idempotent.
- Repository `platform-operations-repository.ts` — `ControlPlanePlatformOperationsRepository` over the control database:
  - platform-scope audit reads with optional narrowing filters, `ORDER BY occurred_at DESC, id`, limit clamped (default cap 200);
  - `recordAuditEvent` (serialized metadata) — the write path later admin/support workflows will use to leave auditable traces;
  - data-route list (sorted by workspace id), get, idempotent `upsertDataRoute` preserving `created_at` on conflict.
- API `platform-operations-api.ts` — permission-scoped per PERMISSION-MATRIX §10:
  - `GET /platform/audit-events` + `GET /platform/audit-events/report/summary` (`audit.read.all`) — the summary reuses the deterministic P9-A5 projection, mapping `target_type` onto the shared dimension;
  - `GET /platform/data-routes`, `GET /platform/data-routes/:workspaceId` (404 unknown) (`database_routes.read`);
  - `PUT /platform/data-routes/:workspaceId` (`database_routes.manage`) — 400 `invalid_data_route` on bad payload, 409 `route_transition_invalid` on guarded transitions, 201 create / 200 update.
- Permissions bundle: `database_routes.read` / `database_routes.manage` added to `PLATFORM_ADMIN_PERMISSIONS` (§10 keys `platform.database_routes.read/manage` in matrix notation; `audit.read.all` already present).
- Competitive basis: Veeva Vault platform audit trail + tenant database routing registry (`COMPETITIVE-ANALYSIS.md` §3).

Acceptance: 25 new focused tests (6 domain + 8 repository + 11 API); full suite 84 test files / 518 tests green; typecheck, migrations (control 2 + workspace 10), web+worker builds pass. No new migration (tables from control 0001).

### P10-A3 — Platform Analytics + Audited Support-Access Workflows (DONE)

- Domain module `platform-support.ts`:
  - `SupportAccessGrant` lifecycle (`requested → approved | denied`, `approved → revoked | expired`) with `SUPPORT_ACCESS_DECISION_EVENTS` mapping each decision to its audit action key (`support_access.requested/approved/denied/revoked/expired`);
  - deterministic `validateSupportAccessTransition` — terminal states (`denied`/`revoked`/`expired`) reject every decision so the grant history stays immutable; `isSupportAccessActive` fails closed (only an unexpired `approved` grant is active);
  - `SupportAccessGrantFilter` (narrowing-only reads) and `buildPlatformUsageOverview` — deterministic status rollup for companies/workspaces/data routes.
- Migration `0003_support_access.sql` (control) — `support_access_grants` ledger with status CHECK, workspace FK and workspace/status indexes.
- Repository `platform-support-repository.ts` — `ControlPlanePlatformSupportRepository`:
  - `createSupportAccessGrant` (always starts `requested`), `listSupportAccessGrants` (newest-first, workspace/status narrowing, clamped limit), `getSupportAccessGrant`;
  - `decideSupportAccessGrant` — re-validates the domain transition **before** writing and returns `transition: 'rejected'` without a write otherwise; approval may carry a `durationMs` window that sets `expires_at`;
  - `getUsageOverview` — `GROUP BY status` rollups over companies/workspaces/workspace_data_routes.
- API `platform-support-api.ts` — permission-scoped per PERMISSION-MATRIX §10 ("governed, scoped, and auditable"):
  - `GET /platform/analytics/usage` (`platform.settings.read`);
  - `GET /platform/support-access-grants` (`security.read`) with workspace/status filters (unknown status → 400);
  - `POST /platform/support-access-grants` (`support_access.start`) → 201 + `support_access.requested` audit event;
  - `POST /platform/support-access-grants/:grantId/decision` (`support_access.start`) → 404 unknown, 409 `support_access_transition_invalid` (no audit event written), otherwise the mapped decision audit event with the acting admin as actor.
- Permissions bundle: `users.read`, `security.read`, `workspace_data.read`, `workspace_data.export`, `support_access.start` added to `PLATFORM_ADMIN_PERMISSIONS` (§10).
- Competitive basis: Veeva Vault governed support access + platform usage reporting (`COMPETITIVE-ANALYSIS.md` §3).

Acceptance: 29 new focused tests (10 domain + 7 repository + 12 API); full suite 87 test files / 547 tests green; typecheck, migrations (control 3 + workspace 10), web+worker builds pass.

### P10-A4 — Global Platform Settings + Feature Entitlements (DONE)

- Domain module `platform-settings.ts`:
  - `PlatformGlobalSettings` (self-service provisioning, support-access approval requirement, default support window, default workspace schema version) with `DEFAULT_PLATFORM_GLOBAL_SETTINGS` — fail-safe defaults (self-service off, approval required, 4-hour window);
  - deterministic `normalizePlatformGlobalSettings(base, patch)` — merges over stored values, clamps the support window into `[5 min, 30 days]`, coerces schema version ≥ 1, and falls back to base on malformed numbers;
  - `FeatureEntitlement` + `validateEntitlementWindow` (inverted windows rejected before write) and the fail-closed `resolveEntitlementState` — explicit `disabled`/`expired` stay disabled, not-yet-started schedules resolve to disabled, and a past `ends_at` is disabled (exclusive bound).
- Migration `0004_platform_settings.sql` (control) — `platform_settings` key/value ledger (entitlements already exist as `feature_entitlements` in 0001).
- Repository `platform-settings-repository.ts` — `ControlPlanePlatformSettingsRepository`:
  - `getGlobalSettings` / `updateGlobalSettings` (idempotent upsert keyed `global`; corrupt stored JSON falls back to defaults rather than throwing);
  - `listEntitlements` (company-scoped, sorted by feature key then workspace), `getEntitlement` (company-level `workspace_id IS NULL` vs workspace override), `upsertEntitlement` — natural-key aware insert-or-update that preserves `created_at` and supports explicit window clearing (`null`) versus keep (`undefined`).
- API `platform-settings-api.ts` — permission-scoped per PERMISSION-MATRIX §10:
  - `GET/PUT /platform/settings` (`platform.settings.read` / `platform.settings.manage`), empty patch rejected 400;
  - `GET /platform/companies/:companyId/entitlements` and `PUT /platform/companies/:companyId/entitlements/:featureKey` (`features.manage`) → 201 create / 200 update, 404 unknown on read;
  - every entitlement response carries the computed `effectiveState` (fail-closed) alongside the stored status/window; inverted windows → 409 `entitlement_window_invalid`, unknown status → 400.
- Permissions bundle: `features.manage` added to `PLATFORM_ADMIN_PERMISSIONS` (§10 key `platform.features.manage`).
- Competitive basis: Veeva Vault platform feature/licensing gates + global tenant configuration (`COMPETITIVE-ANALYSIS.md` §3).

Acceptance: 33 new focused tests (11 domain + 8 repository + 14 API); full suite 90 test files / 580 tests green; typecheck, migrations (control 4 + workspace 10), web+worker builds pass.

**P10 status: COMPLETE** — companies/workspaces/limits (A1), workspace database routing registry + platform audit center (A2), platform analytics + audited support/data-access workflows (A3), global settings + feature entitlements (A4).

---

## P11 — Dataset Catalog / Vault / Allocation

Scope: imported/purchased/curated datasets, raw archive, provenance/versioning, normalization/dedup review, practitioner matching, dataset splitting/building, snapshot/live assignment and export/licensing controls.

### Status

| Step | Description | Status |
|------|-------------|--------|
| P11-A1 | Dataset catalog foundation — dataset/version/assignment contracts with fail-closed publication + assignment guards (DATA-MODEL §6), control-plane catalog tables, catalog repository and permission-scoped API (§11) | DONE (2026-09-15) |
| P11-A2 | Import & normalization pipeline — raw archive reference, import ledger, normalization/dedup review | DONE (2026-09-18) |
| P11-A3 | Practitioner matching & dataset splitting/building | DONE (2026-09-18) |
| P11-A4 | Export/licensing controls + assignment enforcement in the tenant data path | DONE (2026-09-18) |

### P11-A4 — Export/Licensing Controls & Tenant Data-Path Enforcement (DONE)

- Domain module `dataset-licensing.ts` (mirrors `DATA-MODEL.md` §6.2/§6.5 and PERMISSION-MATRIX §11 Example F):
  - `DatasetLicense` terms (license reference, export/redistribution flags, per-export record cap, territory) with **fail-closed provenance defaults**: internal/curated datasets export without redistribution, purchased/partner/imported datasets stay locked until a license is registered (`defaultLicenseTerms`, `resolveDatasetLicense`);
  - `normalizeLicenseTerms`: redistribution is treated as a strictly stronger right than export (implies it) and caps are clamped to non-negative integers or unlimited;
  - `evaluateDatasetExport` — the deterministic, ordered export gate: an unpublished version is refused above every other rule, then license denial (including an assignment-level export ban), then assignment inactivity, then mode/version coherence (snapshot must export its pinned version, live must export the published head, platform exports the head only), then the record cap / invalid counts. Every refusal carries a stable machine-readable reason;
  - export ledger with terminal decisions (`pending → completed|rejected`, `validateExportStatusChange`, `isExportDecided`) — `dataset_exports` is the audit record of what left the platform;
  - tenant data-path enforcement: `resolveTenantDatasetAccess` (only assignments active *at `atMs`*, deterministic ordering, fail-closed when nothing is active), `resolveTenantAccessVersionId` (snapshot pinned; an incoherent snapshot resolves to null and never to the head; live follows the published head) and `findTenantDatasetAccess`.
- Migration `0008_dataset_licensing.sql` (control) — `dataset_licenses` (boolean CHECKs plus the `redistribution_allowed = 0 OR export_allowed = 1` coherence CHECK), `dataset_exports` (format taxonomy, non-negative counts, `status = 'pending' OR completed_at IS NOT NULL` decision-integrity CHECK, FK RESTRICT to versions) and the assignment governance column `dataset_assignments.export_allowed` (strict boolean, default true) with a recipient index.
- `DatasetAssignment` gained the optional `exportAllowed` field; both the catalog repository and the license repository select and map it consistently (absent/pre-0008 rows fall back to the DB default).
- Repository `dataset-license-repository.ts` — `ControlPlaneDatasetLicenseRepository`: effective-license resolution (explicit row or provenance default), license up-insert with normalization, export ledger reads and creation that re-runs `evaluateDatasetExport` **before** any row exists (only the effective version is ever ledgered), `decideExport` (terminal, records the rejection reason + decision timestamp) and `listTenantAssignments` (recipient company rows, company-wide or workspace-scoped) as the enforcement read for the tenant data path.
- API `dataset-license-api.ts` — permission-scoped per PERMISSION-MATRIX §11: license/export-ledger reads and tenant access resolution (`datasets.read`), license management, platform + tenant-scoped export requests and export decisions (`datasets.export`); 400 invalid payload, 404 unknown dataset/export, 409 refusals carrying the deterministic `reason` (`license_denied`, `version_not_published`, `assignment_inactive`, `assignment_version_mismatch`, `record_limit_exceeded`) or `export_already_decided`; `GET /platform/tenants/:companyId/datasets/access` is the enforcement surface the data path consults (empty array = serve nothing).
- Migration validator now exercises the P11-A4 schema at the DB level (redistribution-without-export, unknown export format, decided export without a timestamp, non-boolean assignment export flag).
- Competitive basis: IQVIA/Veeva-style dataset licensing & redistribution control with a per-export audit trail (`COMPETITIVE-ANALYSIS.md` §3).

Acceptance: 49 new focused tests (21 domain + 12 repository + 16 API); full suite 102 test files / 765 tests green; typecheck, migrations (control 8 + workspace 10), web+worker builds pass.

**P11 status: COMPLETE** — catalog foundation (A1), import/normalization pipeline (A2), practitioner matching & dataset splitting/building (A3), export/licensing controls with tenant data-path enforcement (A4).

### P11-A3 — Practitioner Matching & Dataset Splitting/Building (DONE)

- Domain module `dataset-matching.ts` (mirrors `DATA-MODEL.md` §6.6/§6.7):
  - `PractitionerSourceRecord` model (§6.7) with the `unmatched|candidate|matched|confirmed_unmatched` taxonomy and the **no-silent-merge policy**: `classifyMatchConfidence` only ever *marks* a review candidate — a link to the canonical registry is written exclusively by an explicit review decision, and a decision (`matched` / `confirmed_unmatched`) is terminal (`validateMatchStatusChange`);
  - deterministic match scoring (no fuzzy heuristics): `scoreMatchEvidence` maps evidence equality (national id, license, phone, name — folded with the P11-A2 Persian normalizers) onto fixed confidence tiers (exact=1, high=0.9, phone+name=0.8, phone=0.6, name=0.5); the clamped `MatchPolicy.candidateMinConfidence` (default 0.6) decides candidate vs no_match;
  - dataset build lineage (§6.3): `DatasetBuild` derives a target version from a **published**, non-empty source version; `validateBuildReadiness` refuses draft/superseded/empty sources and definitions that select nothing; `executeBuildDefinition` deterministically filters record refs by specialty (records without a specialty never survive a specialty-filtered split).
- Migration `0007_dataset_matching.sql` (control) — `practitioner_source_records` (taxonomy CHECKs, `UNIQUE (dataset_version_id, source_record_ref)`, a `match_status <> 'matched' OR practitioner_id IS NOT NULL` integrity CHECK, decided-at coherence CHECK, FK links + review indexes) and `dataset_builds` (lineage FKs with RESTRICT, `UNIQUE (target_version_id)`, non-negative record count).
- Repository `dataset-matching-repository.ts` — `ControlPlaneDatasetMatchingRepository`:
  - source-record registration (default `unmatched`), filtered/sorted listing and guarded review decisions: `linkMatch` requires a non-empty canonical practitioner id and an undecided record; `confirmUnmatched` is the terminal negative decision; both record the deciding admin + timestamp and never write on rejection;
  - `createBuild` re-validates readiness **and** the produced record count before writing — an empty target never enters the lineage ledger; `listBuilds` exposes the split/refresh lineage per source version.
- API `dataset-matching-api.ts` — permission-scoped per PERMISSION-MATRIX §11: record/lineage reads (`datasets.read`), batch registration + review decisions (`datasets.deduplicate`), build creation (`datasets.build`); 400 invalid payload (recordability of the build definition is re-checked at the API boundary), 404 unknown, 409 refused link/decision/build.
- Competitive basis: IQVIA-style practitioner identity resolution + Veeva Vault-style derived-version lineage (`COMPETITIVE-ANALYSIS.md` §3).

Acceptance: 42 new focused tests (18 domain + 12 repository + 12 API); full suite 99 test files / 716 tests green; typecheck, migrations (control 7 + workspace 10), web+worker builds pass.

### P11-A2 — Import & Normalization Pipeline (DONE)

- Domain module `dataset-import.ts` (mirrors `DATA-MODEL.md` §6.4):
  - `DatasetImport` ledger model over the migration-0005 `dataset_imports` table with the `received|normalized|failed` taxonomy and the strict partition invariant (`validateNormalizationCounts`: valid + invalid must account for every row — negative or non-covering counts are refused);
  - deterministic quality gate: `evaluateImportQuality` folds an import whose valid-row share is below the (clamped, defaulted) `ImportQualityPolicy.minValidRatio` — an empty import always fails; the outcome is written as a ledger state (`failed`), never as a rejection;
  - lifecycle guards: a `normalized` import is immutable (it is the provenance of a published version — `received→normalized|failed`, `failed→received` explicit retry, nothing may leave `normalized`);
  - Persian-aware matching for the dedup review: `normalizePersianText` folds NFC + harakat/tatweel/Quranic marks, invisible joiners (ZWNJ/ZWJ behave like a space so "علی‌رضا" ≡ "علی رضا"), Arabic orthography (ي/ى/ئ→ی, ك/ڪ→ک, ة/ۀ→ه, hamza variants→ا, ؤ→و) and Persian/Arabic-Indic digits onto one canonical form; `normalizePhoneKey` folds `+98`/`0098` and trunk zeros; `buildMatchingKey` is deterministic with priority national id (10 digits) > phone (>9 digits) > normalized full name, `null` for unusable records (they must never match);
  - duplicate-review contracts: `DuplicateReviewCandidate` with `pending|merged|kept_both|discarded` taxonomy, terminal decisions (`validateCandidateStatusChange`), `isRecordableCandidate` (a non-empty key + at least two distinct record refs).
- Migration `0006_dataset_duplicates.sql` (control) — `dataset_duplicate_candidates` with taxonomy CHECKs, `UNIQUE (import_id, match_key)`, a `decided_at IS NULL OR status <> 'pending'` integrity CHECK, FK links to `datasets`/`dataset_imports` and a `(dataset_id, match_key, status)` review index.
- Repository `dataset-import-repository.ts` — `ControlPlaneDatasetImportRepository`:
  - import ledger reads/creation (`received` with zero counts) and `completeNormalization` which re-validates the state (`received` only), the partition invariant and the quality policy **before** writing — a `failed` quality outcome is a legitimate ledger write, only guard violations are rejected without one;
  - `retryImport` reopens exactly a `failed` import (`received` has nothing to retry, `normalized` is immutable);
  - duplicate candidates: filtered/sorted listing, `recordCandidate` (guarded recordability, never writes an invalid candidate) and `decideCandidate` (terminal — a repeat decision is refused without a write, with the deciding admin + timestamp recorded).
- API `dataset-import-api.ts` — permission-scoped per PERMISSION-MATRIX §11: ledger reads + duplicate listing (`datasets.read`), import registration + retry (`datasets.import`), normalization completion (`datasets.normalize`), candidate recording + decisions (`datasets.deduplicate`); 400 invalid payload (the partition invariant is re-checked at the API boundary too), 404 unknown, 409 refused normalization/retry/invalid candidate/already-decided candidate.
- Competitive basis: Veeva Vault-style import provenance + IQVIA-style dedup review (`COMPETITIVE-ANALYSIS.md` §3).

Acceptance: 48 new focused tests (21 domain + 12 repository + 15 API); full suite 96 test files / 674 tests green; typecheck, migrations (control 6 + workspace 10), web+worker builds pass.

### P11-A1 — Dataset Catalog Foundation (DONE)

- Domain module `dataset-catalog.ts` (mirrors `DATA-MODEL.md` §6.1–§6.5):
  - `Dataset` / `DatasetVersion` / `DatasetAssignment` models with the documented type, status, source and mode taxonomies (`practitioners|pharmacies|hospitals|clinics|mixed`, `snapshot|live`, …);
  - deterministic lifecycle guards: `validateDatasetVersionStatusChange` (published versions may only be superseded — immutability per §6.3), `isDatasetVersionMutable`, `validatePublicationReadiness` (only a non-empty draft may be published — an empty dataset must never become the assignable truth);
  - assignment guards: `validateAssignmentWindow` (inverted windows rejected), `validateAssignmentMode` (snapshot requires a pinned version, live forbids one) and the fail-closed `resolveAssignmentState` (only an `active` assignment inside its window grants access).
- Migration `0005_dataset_catalog.sql` (control) — `datasets`, `dataset_sources`, `dataset_versions`, `dataset_imports`, `dataset_assignments` with CHECK constraints on every taxonomy, FK links to companies/workspaces, and DB-level mode/version coherence + window ordering CHECKs.
- Repository `dataset-catalog-repository.ts` — `ControlPlaneDatasetCatalogRepository`:
  - dataset/version/assignment reads (sorted, deterministic) and creation;
  - `publishVersion` re-validates readiness **before** writing and, on success, supersedes the dataset's previous published version so exactly one published head exists;
  - `createAssignment` re-validates mode/window guards and never writes on rejection; initial status is derived deterministically (`active` when the window already opened, otherwise `pending`);
  - `revokeAssignment` is terminal — a repeat revocation is reported without a second write; `resolveState` exposes the fail-closed effective state.
- API `dataset-catalog-api.ts` — permission-scoped per PERMISSION-MATRIX §11: catalog reads (`datasets.read`), dataset creation (`datasets.import`), version creation (`datasets.version`), publication (`datasets.build`), assignment (`datasets.assign`) and revocation (`datasets.revoke`); 400 invalid payload, 404 unknown, 409 refused publication/assignment/already-revoked.
- Permissions bundle: `datasets.read|import|normalize|version|build|deduplicate|assign|revoke|export` added to `PLATFORM_ADMIN_PERMISSIONS` (§11 keys `platform.datasets.*`).
- Competitive basis: Veeva Vault dataset/version licensing + IQVIA-style practitioner dataset allocation (`COMPETITIVE-ANALYSIS.md` §3).

Acceptance: 46 new focused tests (10 domain + 15 repository + 21 API); full suite 93 test files / 626 tests green; typecheck, migrations (control 5 + workspace 10), web+worker builds pass.

---

## P12 — Production Hardening & Scale

Scope: security review, rate limiting, privileged MFA, backup/restore/DR, observability, performance/load tests, abuse controls, retention workflows, full E2E regression and release/runbook process.

### Status

| Step | Description | Status |
|------|-------------|--------|
| P12-A1 | Security hardening — deterministic rate limiting & abuse controls, hardened response headers, privileged-role MFA step-up (SECURITY-THREAT-MODEL §9/§28) | DONE (2026-09-18) |
| P12-A2 | Observability — request correlation, structured event logging, metric counters and health/readiness probes (NFR-005) | DONE (2026-09-18) |
| P12-A3 | Data lifecycle & recovery — retention/legal-hold contracts, backup/restore/DR verification ledger and runbook evidence (§29) | DONE (2026-09-18) |
| P12-A4 | Performance & release readiness — bounded-work budgets, load/regression harness and release runbook | DONE (2026-09-18) |


### P12-A1 — Security Hardening (DONE)

- Domain module `security-hardening.ts` (mirrors SECURITY-THREAT-MODEL §9/§28):
  - fixed-window rate limiting (`evaluateRateLimit`/`inspectRateLimit`): deterministic and monotonic — an exhausted window returns the exact `retryAfterMs`, an elapsed window opens cleanly, and a backwards clock never grants extra capacity; per-surface budgets (`RATE_LIMIT_POLICIES`: auth 10/min, export/import 5/min, sync 60/min, generic API 120/min) with a strict normalized fallback;
  - abuse controls: monotonic signal recording (`authFailures|rejectedRequests|exportRequests`), fail-closed risk classification (`normal|watch|blocked` with a normalized policy) and escalations/deescalations for audit (`classifyAbuseTransition`);
  - privileged-role MFA step-up: the explicit `PRIVILEGED_MFA_PERMISSIONS` set (tenant/platform management, `support_access.start`, `workspace_data.export`, `datasets.export`), freshness-scoped `evaluatePrivilegedMfa` (`not_required|satisfied|mfa_required|mfa_stale` — never silently accepted; future-dated verifications treated as stale);
  - deterministic hardened response headers (`buildSecurityHeaders`): HSTS with preload, nosniff, strict referrer policy, locked-down permissions policy, same-origin COOP/CORP, framing denied by default, a `default-src 'self'` CSP that can be suppressed for machine endpoints or extended with explicit frame ancestors.
- Worker middleware `rate-limit.ts` (`RateLimitStore` interface + `InMemoryRateLimitStore`, caller keying by authenticated user else source address, 429 + `retry-after` + `x-ratelimit-*` on the exact window reset), `security-headers.ts` (stamps every response including denials) and `privileged-mfa.ts` (401 before the MFA check, `mfa_required`/`mfa_stale` for privileged callers, distinct `mfa_setup_required` when the session binding is absent).
- Competitive basis: Veeva/IQVIA-grade abuse controls with an auditable escalation trail (COMPETITIVE-ANALYSIS.md §3).

Acceptance: 31 new focused tests (20 domain + 11 worker middleware); full suite 105 test files / 796 tests green; typecheck, migrations (control 8 + workspace 10), web+worker builds pass.

### P12-A2 — Observability (DONE)

- Domain module `observability.ts` (REQUIREMENTS NFR-005 — diagnosable without exposing sensitive data):
  - request correlation: `resolveRequestId` forwards a usable caller-supplied id (8–64 chars, `[A-Za-z0-9_-]`), generates a deterministic fallback otherwise, and marks which happened;
  - structured event logging: `buildLogEvent` normalizes unknown log levels to `info` (a bad level never crashes the pipeline) and scopes to `null`; `sanitizeLogMetadata` recursively redacts sensitive keys (case-insensitive, separator-agnostic, with caller extensions and a fixed depth) so secrets can never leak through structured logs;
  - SLO evaluation: nearest-rank percentiles over a bounded sample, a normalized budget (p50/p95/p99 + error rate, defaults 300 ms/1.2 s/3 s/1 %) and `evaluateSlo` producing deterministic breach labels — an empty sample is a breach, never "healthy";
  - health rollups: fail-closed `rollupHealth` (any unhealthy check → unhealthy, a degraded check degrades, an empty check list reports degraded rather than pretending to be healthy) and `isServableHealthState`.
- Worker middleware `observability.ts`: `requestObservability` gives every request a correlation id (`x-request-id` response header, forwarded when usable), and emits one structured `http.request.completed` event per outcome through a pluggable sink (`InMemoryObservabilitySink` for tests, `ConsoleObservabilitySink` as the deployed default) — handler failures are detected both via the thrown path and Hono's `c.error` and are logged as `uncaught_error`; `emitEvent` is the shared helper for counters/audits.
- Worker route `health-api.ts`: `/health` is the cheap liveness probe (no dependency calls); `/health/ready` runs the registered readiness checks and fails closed — `unhealthy` is 503, `degraded` is 200 but labeled, an unknown state or an unreadable check payload is treated as unhealthy, never silently served.
- Known-kind event taxonomy (`WELL_KNOWN_EVENT_KINDS`: http/auth/permission/rate-limit/abuse/MFA/dataset-export/sync/health) keeps dashboard indexing stable across modules.

Acceptance: 21 new focused tests (12 domain + 4 middleware + 5 health API); full suite 108 test files / 817 tests green; typecheck, migrations (control 8 + workspace 10), web+worker builds pass.

### P12-A3 — Data Lifecycle & Recovery (DONE)

- Domain module `data-lifecycle.ts` (mirrors SECURITY-THREAT-MODEL §29 — suspension, archival, retention expiration, legal hold and final deletion are *separate* concepts, never a casual hard-delete cascade):
  - `LifecycleSubject` + an explicit action transition table (`suspend/resume/archive/restore/request_purge/complete_purge/place_legal_hold/release_legal_hold`); `validateLifecycleAction` enforces the order of operations — a purge is only requestable on archived data, a legal hold blocks every destructive step (`legal_hold_blocked`), retention must have expired (`retention_not_expired`), and `purged` is terminal;
  - `normalizeRetentionPolicy` (30-day floor, default 365) with `retentionDueAtMs` / `isRetentionExpired` — a subject that was never archived can never expire;
  - `replayLifecycleSubject`: the current state is *replayed* from the append-only ledger, so guards evaluate replayed reality instead of a drift-prone status column;
  - backup/DR ledger: `startBackupDrill` (well-formed drills only, workspace drills need a target), `validateDrillCompletion` (only an undecided drill completes; a *passed* drill **must** carry RPO and RTO — `metrics_required` — while a failed one may close with a note) and `isRecoverabilityProven` (the *latest* decided drill must have passed inside the freshness window; a newer failure never inherits an older pass).
- Migration `0009_data_lifecycle.sql` (control) — `company_retention_policies` (≥30-day CHECK), `lifecycle_events` (action taxonomy CHECK limited to governed actions, FK RESTRICT to companies / SET NULL to workspaces, ledger index) and `backup_drills` (scope taxonomy, non-negative RPO/RTO CHECKs, and the `(result IS NULL) = (completed_at_ms IS NULL)` integrity CHECK).
- Repository `data-lifecycle-repository.ts` — `ControlPlaneDataLifecycleRepository`: retention policy up-insert with normalization, append-only lifecycle ledger (non-recordable events are refused **without** a write) and the drill ledger (`startDrill` never writes an invalid drill; `completeDrill` re-guards, never overwrites a decided drill and preserves prior notes/verifier).
- API `data-lifecycle-api.ts` — permission-scoped per PERMISSION-MATRIX §10: retention/lifecycle reads (`companies.read`), lifecycle + retention mutations (`companies.manage`), drill reads (`security.read`) and drill start/complete (`platform.settings.manage`); lifecycle POST replays the ledger, re-validates the action **before** writing and returns 409 with the deterministic reason (`invalid_state`, `legal_hold_blocked`, `retention_not_expired`); drills expose the `recoverabilityProven` verdict (a restore that cannot state its RPO/RTO proves nothing).
- Migration validator now exercises the P12-A3 schema at the DB level (sub-30-day retention, an ungoverned `hard_delete` action, a decided drill without a completion timestamp, an out-of-taxonomy drill result).

Acceptance: 40 new focused tests (17 domain + 9 repository + 14 API); full suite 111 test files / 857 tests green; typecheck, migrations (control 9 + workspace 10), web+worker builds pass.

### P12-A4 — Performance & Release Readiness (DONE)

- Domain module `workload-budget.ts` (SECURITY-THREAT-MODEL §28 mitigation "bounded pagination/quotas" made explicit):
  - per-surface `WORKLOAD_BUDGETS` (audit tightest for interactive reads, sync widest for device batches) with a normalized fail-closed fallback;
  - `resolvePageWindow`: deterministic fail-closed pagination — absent values are plain defaults (not a clamp), present-but-garbage values degrade *and* report `clamped`, oversized page sizes are capped to the budget, and the page index is bounded (`MAX_PAGE_INDEX`) so a deep offset cannot force an unbounded scan (offset returned alongside data so clients never guess);
  - `validateBatchSize` for batch/export ceilings; `normalizeLoadProfile` + `evaluateLoadRun` (SLO evaluation plus the 90 % sample-coverage rule — a run that barely ran proves nothing);
  - `evaluateReleaseReadiness`: every *required* check must have passed — a failure is a blocker, a skip is missing evidence, and both keep the verdict `blocked`; blank evidence is never a pass.
- Bounded work enforced in a live API: workspace audit reads and the audit summary now take their ceilings from the audit surface budget via `resolvePageWindow` (oversized `limit`/`pageSize` are clamped, garbage degrades to the default window, deep pages are bounded) and return the resolved `page` window next to the data.
- Evidence harness: `scripts/validate-release-readiness.mjs` (`pnpm validate:release`, now part of `pnpm check`) — re-runs the migration validator, refuses `.only`/`.skip` test foci, asserts no P11/P12 step is pending and requires the runbook/performance/security/data-model evidence files; exits non-zero on blockers or missing evidence.
- Process docs: `docs/PERFORMANCE-BUDGETS.md` (per-surface ceilings, page-window rules, SLO budgets, load profiles, regression expectations — timing-based tests avoided in favour of deterministic gateway-receive assertions) and `docs/RELEASE-RUNBOOK.md` (ordered release gates, pre-release checklist, deployment/rollback procedures, backup/restore/DR drill cadence with RPO/RTO evidence, §29 lifecycle order, incident severities and post-release verification).

Acceptance: 35 new focused tests (16 domain + 19 bounded-work regression on the audit API surface); full suite 112 test files / 876 tests green; typecheck, migrations (control 9 + workspace 10), web+worker builds pass; the release-readiness probe was observed `BLOCKED` before the A4 close and `READY` after.

**P12 status: COMPLETE** — security hardening (A1), observability (A2), data lifecycle & recovery (A3), performance & release readiness (A4).

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

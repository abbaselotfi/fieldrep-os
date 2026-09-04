# FieldRep OS — Roadmap

**Baseline:** 2026-09-05  
**Current phase:** P0 — Product & Architecture Foundation  
**Current work item:** P0-A5 — calendar/location/offline/AI interfaces

## Product priority

The first production-critical surface is the **Field User Workspace**. The current Excel Plan & Report workbook is its functional baseline.

Architecture must anticipate the full SaaS platform from P0, but implementation priority is:

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

## P0 — Product & Architecture Foundation

Goal: define stable boundaries before application scaffolding.

### Work items

```text
P0-A1  Field User + Excel parity + PWA UX       DONE
P0-A2  Product vision + requirements             DONE
P0-A3  Tenancy/workspace/permission model        DONE
P0-A4  Conceptual domain/data model               DONE
P0-A5  Calendar/location/offline/AI interfaces    CURRENT
P0-A6  Architecture review + ADRs                 NEXT
P1     Application scaffold + authenticated shell
```

### Current documents

- `FIELD-USER-SPEC.md`
- `EXCEL-PARITY-MATRIX.md`
- `FRONTEND-PWA-UX-SPEC.md`
- `UI-DESIGN-DIRECTION.md`
- `PRODUCT-VISION.md`
- `REQUIREMENTS.md`
- `TENANCY-MODEL.md`
- `PERMISSION-MATRIX.md`
- `DATA-MODEL.md`
- `ROADMAP.md`

### Remaining P0 deliverables

- Calendar/activity interface specification
- Location/map-provider interface specification
- Offline/sync interface specification
- AI recommendation interface specification
- Security/threat-model baseline
- Architecture overview
- Initial architecture decision records

### P0 exit gate

- Company / Workspace / Organization Unit terminology is frozen.
- Role and scope are separate.
- Field-user behavior is mapped from Excel.
- Planner/visit/report entities are independent of UI.
- Multi-location customers are supported in the domain.
- Workspace database routing is abstracted.
- Shared practitioner identity cannot leak workspace operational data.
- Offline mutation/idempotency boundaries are defined.
- Maps are provider-independent.
- AI suggestions are explainable and not autonomous official plans.
- P1 can begin without known schema-breaking decisions.

---

## P1 — Authentication + Field User Shell

Goal: create the first real authenticated PWA shell.

Scope:

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

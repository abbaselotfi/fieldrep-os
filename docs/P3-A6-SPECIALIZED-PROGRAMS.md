# FieldRep OS — P3-A6 Specialized Meetings & Programs

**Phase:** P3 — Operational Calendar & Activities  
**Work item:** P3-A6  
**Status:** COMPLETE  
**Baseline:** 2026-09-05

## Domain split

FieldRep OS deliberately does not force every work event into one generic record.

- `internal_meeting` continues to use the generic authoritative `Activity` model because Activity already owns time, location, scope, attendees and Calendar behavior.
- `company_program` is a specialized entity because program type and company/workspace audience matter.
- `doctor_program` is a specialized entity because doctors, products, attendance, cost and report are domain data rather than Calendar decoration.

All three still project into the shared `calendar_events` timeline.

## Company Program

Supported types:

- Launch
- Workshop
- Training
- Conference
- Sales Meeting
- Cycle Meeting
- Other

The model preserves scope, selected users, location and independent flags for working activity, Planner blocking and report inclusion.

## Doctor Program

Supported types:

- RTD
- Dinner Meeting
- Workshop
- Conference
- Webinar
- Hospital Meeting
- Speaker Program
- One-to-One
- Custom

The model stores:

- participating doctors;
- per-doctor attendance state;
- associated products;
- assigned/participating Field Users;
- location and time;
- optional cost in minor currency units plus currency code;
- report text;
- Calendar behavior flags.

## Persistence

Migration `0011_specialized_programs.sql` adds:

- `company_programs`
- `company_program_users`
- `doctor_programs`
- `doctor_program_doctors`
- `doctor_program_products`
- `doctor_program_users`

Database guards verify that Doctor Program doctors are doctor-type customers in the same Workspace and products belong to the same Workspace.

## Calendar and KPI invariant

Program Calendar projections are rebuildable timeline rows. They never manufacture Visit facts.

Database and Domain both enforce:

```text
company_program countsAsVisit = false
doctor_program  countsAsVisit = false
```

Draft/cancelled programs do not become working/report activity. Scheduled programs can honor configured Planner blocking; completed programs remain working/report context but stop blocking future planning.

## Internal Meeting

A second `internal_meetings` table is intentionally avoided. Generic Activity already provides the correct authoritative shape for Internal Meeting and is covered by secured own-activity APIs. Broader Workspace/Company event-management authority will use the same model through scoped management surfaces rather than duplicating the entity.

## Security boundary

A6 establishes authoritative domain/persistence and Calendar projection. Company-wide/Workspace-wide creation permissions belong to Supervisor/Company Admin surfaces and are not granted to ordinary Field User own APIs.

## Exit gate

```text
SQL migrations (11 workspace)      PASS
PWA security validation            PASS
Legacy XLSM extractor              PASS
P2 parity regression               PASS
TypeScript                         PASS
Full unit suite                    PASS
Production build                   PASS
```

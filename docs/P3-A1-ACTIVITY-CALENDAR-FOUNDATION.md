# FieldRep OS — P3-A1 Activity / Calendar Foundation

**Phase:** P3 — Operational Calendar & Activities  
**Work item:** P3-A1  
**Status:** IMPLEMENTED; CI GATE REQUIRED FOR CLOSURE  
**Baseline:** 2026-09-05

## 1. Purpose

P3-A1 turns the Calendar from a presentation-only shell into a domain boundary that can safely unify visits and non-visit work.

The critical rule is:

> Calendar is a projection/index for the operational timeline. It is not the authoritative source for Visit, Frequency or Achievement KPIs.

`Visited` and related call KPIs continue to derive from authoritative completed Actual Visit records.

## 2. Generic Activity domain

The first authoritative non-visit Activity types are:

```text
internal_meeting
company_program
doctor_program
custom_activity
```

Specialized entities such as Leave and Business Trip will receive their own authoritative tables/contracts in later P3 work items and project into the same Calendar timeline.

Activity records include:

- workspace identity;
- creator and optional owner;
- start/end timestamps;
- canonical local start/end dates;
- all-day state;
- scope;
- attendee users;
- planning-block behavior;
- working-activity behavior;
- reporting visibility;
- lifecycle status;
- optional location text.

## 3. Unified Calendar projection

`CalendarItem` supports these timeline categories:

```text
visit
pharmacy_visit
leave
business_trip
internal_meeting
company_program
doctor_program
public_holiday
company_closure
workspace_closure
custom_activity
```

A Calendar item records `sourceType + sourceId` so it can always be traced back to its authoritative domain entity.

## 4. KPI safety invariant

Calendar rows have a `countsAsVisit` projection flag for presentation/report semantics, but the domain and SQL schema enforce:

```text
countsAsVisit = true
ONLY IF
sourceType = Actual Visit
AND type is visit/pharmacy_visit
```

Generic Activity persistence always writes `counts_as_visit = 0`.

This prevents meetings, trips, programs, holidays and future leave records from accidentally increasing doctor frequency or Achievement.

## 5. Scope model

Supported projection scopes:

```text
platform
company
workspace
organization_unit
selected_users
user
```

Domain validation covers:

- workspace scope must match the physical workspace;
- selected-user scope requires explicit attendees;
- attendee IDs must be unique;
- user-scoped owned activities must match the scope user;
- visibility checks do not widen selected-user access.

Organization-unit scope is also guarded at the database layer against cross-workspace references.

## 6. Persistence

Migration:

```text
migrations/workspace/0007_calendar_activity_foundation.sql
```

Tables:

```text
activities
calendar_events
calendar_event_attendees
```

`activities` is authoritative for generic P3 activities.

`calendar_events` is the unified timeline projection/index.

`calendar_event_attendees` stores per-user timeline participation/visibility metadata.

## 7. Atomic write boundary

`WorkspaceCalendarActivityRepository` writes:

```text
Activity
+ Calendar projection
+ attendee rows
```

inside one workspace-local atomic batch.

A partial state such as “Activity exists but Calendar projection is missing” is treated as a failed operation.

The physical workspace ID is injected by the repository; callers do not choose a different workspace through payload fields.

## 8. Security / integrity constraints

SQL/domain guards include:

- valid timestamp/date ranges;
- valid scope shape;
- workspace scope equality;
- organization-unit workspace ownership;
- Calendar Activity projection must reference an existing matching Activity;
- attendee rows must match the same workspace as the Calendar event;
- only an Actual Visit projection may carry visit-KPI semantics.

## 9. Deliberate deferrals

P3-A1 does not yet implement:

- secured HTTP Activity CRUD;
- Leave approval workflow;
- Business Trip workflow;
- working-week/closure resolution;
- planning conflict evaluation;
- official holiday persistence/publishing;
- final Week/Day/Agenda UI.

Those build on this foundation in subsequent P3 work items.

## 10. Exit gate

P3-A1 closes after the branch passes:

```text
SQL migrations
PWA security validation
legacy XLSM extractor validation
P2 parity regression
TypeScript
unit tests
production build
```

with the new Activity/Calendar tests enabled.

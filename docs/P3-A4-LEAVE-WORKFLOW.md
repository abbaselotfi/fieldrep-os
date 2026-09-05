# FieldRep OS — P3-A4 Leave Workflow

**Phase:** P3 — Operational Calendar & Activities  
**Work item:** P3-A4  
**Status:** implementation complete pending final CI gate  
**Baseline:** 2026-09-05

## Purpose

Leave is a first-class operational entity, not a generic Activity and not a Visit.

The leave lifecycle is intentionally separate from Visit/Frequency/Achievement truth:

```text
Draft → Requested → Approved / Rejected
  └──────────────→ Cancelled (owner only before decision)
```

## Planner behavior

Only approved leave blocks planning.

```text
draft       blocks planning = false
requested   blocks planning = false
approved    blocks planning = true
rejected    blocks planning = false
cancelled   blocks planning = false
```

A requested leave is visible on the calendar as pending context but is not treated as an approved absence.

## Data model

Migration `0009_leave_requests.sql` adds `leave_requests` with:

- workspace and user ownership;
- annual / sick / hourly / emergency / other type;
- canonical start/end timestamps and dates;
- all-day or timed range;
- optional reason;
- workflow status;
- decision actor and timestamp audit fields.

Every leave request receives a unified `calendar_events` projection with `source_entity_type = leave_request`.

Database triggers ensure a leave projection references a leave request in the same physical workspace and can never carry `counts_as_visit = 1`.

## Ownership and security

The Field User API exposes only own-leave operations:

- list own leave;
- read own leave;
- create draft;
- submit draft for approval;
- cancel own draft/requested leave.

The server injects the authenticated user identity. Request payloads cannot set:

- workspace identity;
- owner/user identity;
- approved/rejected status;
- decision actor;
- decision timestamp.

There is deliberately no owner `/approve` endpoint.

Approval/rejection exists in the repository/domain as a separate decision operation for the future Supervisor/Admin permission surface. It requires an explicit decision actor and audit timestamp and only accepts `requested` leave.

## KPI invariant

Leave never increments:

- Visit count;
- Frequency;
- Achievement;
- Product Calls.

`calendar_events` remains a timeline projection. Actual Visit records remain the only source of Visit KPI truth.

## API/client contract

The browser client uses cookie-authenticated requests with `credentials: include` and exposes only the own-leave lifecycle supported by the Field User API.

It has no method to approve/reject leave.

## Tests

Coverage includes:

- domain lifecycle validation;
- decision audit fields;
- approved-only planning blocking;
- atomic leave + calendar projection persistence;
- non-KPI Calendar projection;
- owner/date-range read isolation;
- draft → requested transition;
- pre-decision owner cancellation;
- separate approval decision enabling Planner blocking;
- authentication requirement;
- cross-workspace rejection before repository access;
- server-injected owner identity;
- invalid date/range rejection;
- absence of an owner approval endpoint;
- browser client cookie credentials and safe request shape.

## Exit gate

P3-A4 closes only after repository CI passes migrations, PWA/security checks, P2 regression, TypeScript, full unit tests and production build.

# FieldRep OS — P3-A2 Secured Own-Activity API

**Phase:** P3 — Operational Calendar & Activities  
**Work item:** P3-A2  
**Status:** DONE  
**Baseline:** 2026-09-05

P3-A2 exposes owner-scoped Activity CRUD without widening a Field User's authorization scope.

## Own endpoints

```text
GET    /workspaces/:workspaceId/activities?from=&to=
GET    /workspaces/:workspaceId/activities/:activityId
POST   /workspaces/:workspaceId/activities
PATCH  /workspaces/:workspaceId/activities/:activityId
DELETE /workspaces/:workspaceId/activities/:activityId
```

Permissions are separated by operation:

```text
activities.read.own
activities.create.own
activities.update.own
activities.cancel.own
```

## Server-owned identity

For the Field User own endpoint, the server injects:

```text
createdByUserId = authenticated user
ownerUserId     = authenticated user
scope           = authenticated user
workspace       = authorized route / routed physical workspace
```

Client payload fields cannot expand these boundaries.

## Allowed own activity types

Field Users can currently create:

```text
internal_meeting
custom_activity
```

`company_program` and `doctor_program` are deliberately not available through this own endpoint. They require broader scoped permissions and specialized domain fields in later P3 work.

## Persistence semantics

Update and cancellation keep the authoritative `activities` row and its `calendar_events` projection synchronized atomically.

Cancellation is soft/history-preserving.

Every generic Activity projection keeps `counts_as_visit = 0`.

## Web client

`OwnActivityHttpClient` uses cookie-authenticated requests (`credentials: include`) and exposes list/get/create/update/cancel without accepting workspace/owner/scope identity in create requests.

## Verification

Tests cover authentication, permission separation, cross-workspace rejection before repository access, owner scoping, malicious identity fields, forbidden broader program types, date/range validation, update ownership and soft cancellation.

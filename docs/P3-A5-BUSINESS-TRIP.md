# FieldRep OS — P3-A5 Business Trip / Mission

**Phase:** P3 — Operational Calendar & Activities  
**Work item:** P3-A5  
**Status:** implementation pending final CI gate  
**Baseline:** 2026-09-05

## Purpose

Business Trip / Mission is a first-class work entity because destination and travel context affect later Planner conflict detection, map/routing suggestions and AI-assisted planning.

It must not be represented as Leave or a generic Meeting.

## Lifecycle

```text
Draft → Requested → Approved → Completed
                   └→ Rejected
Draft / Requested → Cancelled
```

Field User own endpoints cannot approve/reject a trip. Decision is a separate repository/domain action reserved for a future Supervisor/Admin permission surface.

Approval audit (`decidedByUserId`, `decidedAt`) is preserved after completion.

## Data model

Migration `0010_business_trips.sql` adds:

- `business_trips`;
- `business_trip_destinations`.

The trip stores:

- user/workspace ownership;
- origin city/province;
- purpose;
- transport mode;
- canonical time/date range;
- all-day flag;
- optional `blocksPlanning` policy;
- workflow state;
- decision audit.

Destinations are ordered and support multiple cities from day one. Optional destination time windows must be entirely inside the trip interval.

## Calendar semantics

Every trip has a `calendar_events` projection using `source_entity_type = business_trip`.

Before approval, the trip never blocks planning and is not counted as a working activity.

After approval:

- `countsAsWorkingActivity = true`;
- `blocksPlanning` is honored only if explicitly configured;
- destination remains available to later conflict/routing engines;
- `countsAsVisit = false` always.

Completed trips remain reportable work context and keep approval provenance.

## Why `blocksPlanning` is not always true

A mission can legitimately contain physician/customer visits in the destination city. Treating every mission as an all-day hard blocker would prevent correct planning.

P3 therefore preserves two independent facts:

1. the representative is on a mission to a specific destination;
2. a configured portion/range may block planning.

P3-A8 conflict logic can use destination/city to flag incompatible plans rather than blindly rejecting all visits during a mission.

## Security

Own API operations are:

- list/read own trips;
- create own draft;
- request approval;
- cancel before decision;
- complete an already approved own trip.

Server-side authentication injects the user/workspace identity. Payload fields cannot grant approval or set the decision actor.

## KPI invariant

Business Trips never create Visit/Frequency/Achievement/Product Call facts. Database triggers reject `counts_as_visit != 0` for business-trip Calendar projections.

## Future dependencies

P5 may enrich destinations with canonical location IDs/coordinates and route-provider references. P7 can use destination sequence, city and timing as deterministic planning inputs without changing this workflow model.

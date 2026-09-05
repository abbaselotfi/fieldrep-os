# P2-A4 — Planner Domain Engine

Status: COMPLETE

## Purpose

Turn the Excel-equivalent planning rules into one UI-independent evaluation boundary that can be reused by List, Calendar and Excel planner views.

## Implemented behavior

`evaluatePlanCandidate()` now evaluates a candidate plan entry against:

- active planning-cycle bounds
- same-day duplicate policy
- adjacent-day duplicate policy
- customer route assignment
- doctor frequency progress
- daily target before and after the candidate

Hard errors block the candidate. Warnings remain advisory so the UI can explain them and still allow the field user to continue.

## Isolation rule

Daily-target and duplicate evaluation are scoped to the candidate's `workspaceId + ownerUserId`.

This is important in a multi-tenant field-force system: entries belonging to another workspace or another representative must never inflate a user's daily target or create false duplicate warnings.

## Current issue model

Errors:

- `outside_planning_cycle`
- `duplicate_same_day`

Warnings:

- `duplicate_nearby_day`
- `route_mismatch`
- `frequency_already_achieved`
- `daily_target_exceeded`

## Tests

The unit suite covers:

- valid in-cycle planning
- outside-cycle blocking
- same-day duplicate blocking
- adjacent-day warning
- route mismatch warning
- achieved-frequency warning
- daily-target overage warning
- cross-user daily-target isolation
- cross-workspace daily-target isolation
- cross-user/workspace duplicate isolation

## A5 handoff

P2-A5 may persist only candidates that pass hard planner validation. The persistence/API layer must still enforce workspace/user ownership and database constraints; the domain engine is not a substitute for authorization or tenant isolation.

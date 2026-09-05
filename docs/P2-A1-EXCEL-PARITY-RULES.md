# FieldRep OS — P2-A1 Executable Excel-Parity Rules

**Phase:** P2 — Excel Parity / Core Field User Panel  
**Work item:** P2-A1  
**Status:** COMPLETE

## Purpose

P2-A1 converts the workbook's key implicit calculations and planner warnings into explicit, reusable TypeScript domain rules. The UI must consume these rules rather than reimplementing calculations independently in List, Calendar, Excel, or later Map views.

## Implemented domain contracts

The domain now has stable identifiers for:

- customer
- route
- product
- location
- plan entry
- visit
- planning cycle

Planner/visit contracts now define:

- `PlanningCycleRef`
- `PlanEntry`
- `PlanEntryStatus`
- `PlanEntrySource`
- `CompletedVisitFact`
- `VisitProgress`
- `DailyTargetProgress`
- `DuplicateConflict`
- `DuplicatePolicy`

## Executable parity rules

### Frequency / Visited / Achievement

`deriveVisitProgress(frequency, visited)` implements the Excel semantic baseline:

```text
visited < frequency  -> incomplete
visited = frequency  -> achieved
visited > frequency  -> over_achieved
```

Additional safe behavior:

- inputs must be non-negative integers
- over-achievement remains above 100%
- `frequency = 0` does not divide by zero
- zero-frequency records return `not_required` and a null achievement percentage

`Visited` remains a projection from completed visit facts in the application architecture; it is not intended to become a manually editable counter.

### Daily target

`evaluateDailyTarget(target, planned)` returns:

```text
below_target
target_met
over_target
```

with explicit `remaining` and `overBy` values.

### Duplicate planning

`findDuplicatePlanConflicts()` now provides a reusable duplicate policy.

Initial Excel-parity policy:

- same customer, same user, same workspace, same date -> `error`
- same customer on an adjacent date -> `warning`
- entries outside the configured nearby-day window -> no duplicate conflict
- cancelled and rescheduled entries do not create active duplicate conflicts
- an entry does not conflict with itself during edit
- duplicate checks never cross workspace or user boundaries

The nearby-day window remains a policy object so a company/workspace rule can be introduced later without rewriting planner UI code.

### Daily active count

`countActivePlanEntries()` provides one canonical count for a planner day. Cancelled/rescheduled entries are excluded; planned/completed/missed entries remain part of the day's planning history.

## Date boundary

Planner rules accept canonical application dates as:

```text
YYYY-MM-DD
```

Jalali conversion/presentation belongs to P2-A3 and the UI layer. The domain does not persist `1405/06/14` style strings as its canonical date representation.

## Automated coverage

Unit tests cover:

- incomplete frequency
- exact achievement
- over-achievement
- zero frequency
- invalid negative inputs
- below/exact/over daily target
- same-day duplicate
- adjacent-day duplicate
- duplicate window boundary
- cancelled/rescheduled exclusion
- edit self-exclusion
- workspace/user isolation
- canonical date validation
- active daily count

## CI hardening discovered during P2-A1

P2-A1 also activated the previously written PWA source validator in CI. That exposed two PWA shell gaps which were corrected before closing A1:

- installable PNG icons were added for 192×192 and 512×512 surfaces
- service-worker registration validation was corrected to inspect the actual secure root registration syntax

The final P2-A1 CI gate passes:

- frozen dependency install
- SQL migration validation
- PWA shell/security validation
- TypeScript typecheck
- unit tests
- production build

## Exit decision

P2-A1 is complete. P2-A2 can now implement real doctor/customer and route repositories/APIs against these stable IDs and rules.

# FieldRep OS — P2-A3 Jalali Planning Cycle Engine

**Phase:** P2 — Excel Parity / Core Field User Panel  
**Work item:** P2-A3  
**Status:** COMPLETE

## Goal

Move the workbook's Jalali year/quarter behavior into a canonical, testable planning-cycle engine without storing Persian display strings as the database date format.

## Canonical date rule

FieldRep OS stores planning dates as:

```text
YYYY-MM-DD
```

The Jalali calendar is a product/domain presentation and cycle-selection concern.

## Conversion engine

The domain now provides:

- `canonicalDateToJalali()`
- `jalaliDateToCanonical()`
- `planningCycleBounds()`
- `jalaliQuarterForCanonicalDate()`
- `isDateInPlanningCycle()`
- `addCanonicalDays()`

Reverse Jalali conversion uses the runtime's standards-based `Intl` Persian calendar and a narrow search for the Persian New Year, then validates the requested date by round trip. This avoids maintaining a second independent leap-year algorithm in the application.

## Quarter behavior

The four Excel-compatible quarters are derived from Jalali months:

```text
Q1  Farvardin–Khordad
Q2  Tir–Shahrivar
Q3  Mehr–Azar
Q4  Dey–Esfand
```

Known 1405 boundaries are covered by tests:

```text
Q1  2026-03-21 .. 2026-06-21
Q2  2026-06-22 .. 2026-09-22
Q3  2026-09-23 .. 2026-12-21
Q4  2026-12-22 .. 2027-03-20
```

Tests also cover the leap Esfand day of 1403 and reject Esfand 30 for non-leap 1404.

## Workspace storage

`migrations/workspace/0003_planning_cycles.sql` adds `planning_cycles` with support for:

- Jalali-quarter cycles
- future custom cycles
- canonical start/end dates
- draft / active / closed / archived lifecycle
- only one active cycle per workspace
- unique non-archived Jalali quarter per workspace

The migration validator exercises these constraints on a fresh SQLite database.

## CI gate

P2-A3 passed:

- SQL migrations
- PWA boundary validation
- TypeScript typecheck
- unit tests
- production build

## Exit decision

P2-A3 is complete. P2-A4 can now build the planner domain engine using stable cycle bounds, customer frequency, duplicate policy and daily-target rules.

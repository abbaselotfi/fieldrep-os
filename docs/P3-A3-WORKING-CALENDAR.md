# FieldRep OS — P3-A3 Working Calendar & Closures

**Phase:** P3 — Operational Calendar & Activities  
**Work item:** P3-A3  
**Status:** DONE  
**Baseline:** 2026-09-05

## Purpose

P3-A3 converts a mathematically correct Solar Hijri date into an operational answer:

```text
Can this workspace/user normally be planned on this civil day?
```

The resolver composes three independent layers:

```text
verified annual official calendar
+ configured working-week policy
+ company/workspace overrides
```

Leave, trip and time-overlap constraints are layered in later P3 tasks.

## Official calendar policy

Official/religious holidays are versioned annual source data, not date-math output and not a runtime web request.

For Iran 1405 the repository includes a verified dataset with 26 official holiday dates. Source hierarchy:

1. Calendar Center, Institute of Geophysics, University of Tehran — official annual publication.
2. Time.ir — independent cross-check/reference.

The dataset is validated against `persian-calendar.ts`; stored Solar Hijri and canonical dates must represent the same civil day.

## Conservative precedence

The resolver intentionally fails safe:

- official holiday → non-working / planning blocked;
- company closure → non-working / planning blocked;
- workspace closure → non-working / planning blocked;
- explicit working-day override may open a weekly non-working weekday;
- a normal working-day override cannot silently reopen an official holiday or closure;
- otherwise the configured working-week policy applies.

If a verified annual official dataset is missing, repository resolution throws `official_calendar_dataset_missing`.

If the effective weekday policy is missing, repository resolution throws `working_calendar_policy_missing`.

The application therefore does not guess that an unknown date is a normal working day.

## Persistence

Migration `0008_working_calendar.sql` adds:

```text
official_calendar_versions
official_calendar_events
working_calendar_rules
calendar_overrides
```

Annual versions retain source provenance. Only one verified version per workspace/country/year may be active.

Working rules and overrides retain their origin as `company` or `workspace` projections inside the physical workspace database.

## Runtime service

`WorkspaceWorkingCalendarRepository.resolveDay(companyId, canonicalDate)`:

1. resolves the Solar Hijri year and Saturday-first weekday from the single authoritative calendar engine;
2. requires a verified annual dataset;
3. loads official events for the date;
4. loads the most specific effective working-week rule (workspace before company);
5. loads matching company/workspace overrides;
6. delegates final deterministic composition to `resolveWorkingDay()`.

## Security and integrity

- Physical workspace identity comes from the routed database, not caller data.
- Official event/version rows are workspace-bound by triggers.
- Date ranges are validated.
- Calendar-event projections for official/override sources are guarded against cross-workspace source references.
- No calendar policy record modifies Visit/Frequency/Achievement truth.

## Verification

Automated coverage includes:

- 1405 official dataset date consistency and 26 unique holiday dates;
- sensitive religious/national holiday anchors;
- Friday/non-working behavior under a sample six-day policy;
- explicit working-day override of a weekly non-working day;
- official holiday remaining blocked despite a normal working-day override;
- company/workspace closure precedence;
- missing annual dataset fail-closed behavior;
- missing working-week policy fail-closed behavior;
- atomic official dataset publication and source provenance.

Repository CI after P3-A3:

```text
SQL migration validation          PASS
PWA validation                    PASS
Legacy XLSM extractor             PASS
P2 parity regression              PASS
TypeScript                        PASS
Unit tests                        PASS
Production build                  PASS
```

# FieldRep OS — P2-A10 Persian Calendar Correctness Gate

**Phase:** P2 — Excel Parity / Core Field User Panel  
**Work item:** P2-A10A  
**Risk level:** CRITICAL — date/weekday drift can invalidate plans and reports  
**Status:** CODE GATE PASS — UI integration follows in P2-A10B  
**Baseline:** 2026-09-05

---

## 1. Decision

The legacy workbook remains a functional/UI baseline, but its one-year hard-coded calendar is **not** the production calendar engine.

FieldRep OS uses three independent layers:

```text
1. deterministic Solar Hijri civil-date arithmetic
2. Saturday-first calendar/grid presentation
3. versioned official annual holiday/event datasets
```

These layers must not be collapsed.

Religious/public-holiday dates are annual sourced data and cannot be inferred solely from a tabular lunar-calendar calculation.

---

## 2. Deterministic conversion engine

`packages/domain/src/persian-calendar.ts` owns date arithmetic.

The final P2-A10A conversion core is pinned to the current **Unicode ICU PersianCalendar** 33-year-cycle implementation, including ICU's explicit leap-correction table. No network request is needed to convert a date, and the application does not depend on whatever ICU version happens to be installed in a user's browser/OS.

`Intl` remains an independent differential-test oracle, not the runtime source of truth.

FieldRep OS conversion/test support is bounded to:

```text
1300 .. 1600 SH
```

### Why the implementation changed during the gate

The first implementation used the Borkowski/jalaali-js algorithm and passed all current-year anchors plus the uploaded workbook's 95-day sequence. The exhaustive differential test nevertheless found a one-day disagreement at:

```text
1502/12/30
Borkowski candidate -> 2124-03-20
current Intl/ICU    -> 1503/01/01 on 2124-03-20
```

The gate was therefore stopped rather than weakening the test.

Inspection of the current upstream ICU `PersianCalendar` showed that ICU now has an explicit astronomical correction table and lists **1502 as a non-leap correction year**. The production core was switched to that pinned current ICU logic, after which the exhaustive test passed.

This is exactly why FieldRep OS keeps a large differential regression instead of trusting a calendar algorithm by reputation alone.

### Official-calendar nuance

The Iranian civil calendar is ultimately astronomical. ICU itself documents that the exact location/meridian becomes relevant for sufficiently distant future years. Therefore:

- the deterministic core provides stable date arithmetic and is regression-pinned;
- currently published official annual calendars remain the highest authority for operational years;
- annual public/religious event datasets are versioned separately;
- if the Calendar Center or ICU publishes a future correction, it becomes a reviewed version update rather than a silent runtime change.

The engine exposes:

- Jalali → canonical Gregorian date-only conversion;
- canonical Gregorian → Jalali conversion;
- leap-year validation;
- month length;
- Saturday-first weekday index;
- Saturday-Friday week bounds;
- month-grid generation with previous/next-month spillover;
- UTC date-only day arithmetic.

Operational records continue to store canonical `YYYY-MM-DD` / UTC timestamps. Jalali is a calendar/UI/domain projection, not a replacement storage epoch.

---

## 3. Golden official anchors

The regression suite includes anchors around sensitive boundaries:

```text
1399/01/01  -> 2020-03-20  Friday    (leap year)
1399/12/30  -> 2021-03-20  Saturday
1403/01/01  -> 2024-03-20  Wednesday (leap year)
1403/12/30  -> 2025-03-20  Thursday
1404/01/01  -> 2025-03-21  Friday    (common year)
1405/01/01  -> 2026-03-21  Saturday  (common year)
1405/04/01  -> 2026-06-22  Monday
1405/06/14  -> 2026-09-05  Saturday
1405/06/31  -> 2026-09-22  Tuesday
```

Source hierarchy:

1. **Calendar Center, Institute of Geophysics, University of Tehran** — official annual Iranian calendar publication.
2. **Time.ir** — independent annual/current calendar and event validation.
3. **Unicode ICU** — pinned computational reference and differential oracle family.
4. Other public sources are corroboration only.

References reviewed during this gate:

- `https://calendar.ut.ac.ir/`
- `https://calendar.ut.ac.ir/documents/2139738/7092644/Calendar-1405.pdf`
- `https://www.time.ir/`
- `https://www.time.ir/event-year`
- `unicode-org/icu` — current `PersianCalendar.java`

Time.ir independently reports 1405/06/14 as Saturday 2026-09-05 and identifies 1405 as non-leap.

---

## 4. Uploaded workbook as a dense weekday regression source

The real XLSM Calendar contains 95 consecutive visible Jalali date headers from:

```text
1405/03/30 Saturday
through
1405/06/31 Tuesday
```

The workbook's weekday sequence is:

```text
Saturday Sunday Monday Tuesday Wednesday Thursday Friday
```

A sanitized regression test uses only this date/weekday sequence — no physician, route or address data is committed.

It checks:

- Khordad→Tir transition;
- Tir→Mordad transition;
- Mordad→Shahrivar transition;
- 31-day month handling;
- week rollover;
- Saturday-first indexing;
- absence of progressive weekday drift.

---

## 5. Exhaustive multi-year test policy

For **every valid day from 1300 through 1600** the suite verifies:

1. Jalali → canonical → Jalali round trip.
2. Consecutive valid Jalali dates map to consecutive canonical days with no gap/duplication.
3. The pinned deterministic result matches current ECMAScript `Intl.DateTimeFormat(... u-ca-persian ...)` for the same canonical day.
4. Month lengths agree with leap-year status.

This covers more than 109,000 civil days, including every leap/common boundary in the supported range.

The first execution deliberately failed on the 1502 correction described above. The ICU-corrected implementation subsequently passed the same unchanged exhaustive assertion.

---

## 6. Month-grid invariants

A production month grid is generated from date arithmetic rather than pre-authored weekday offsets.

Required invariants:

- column 0 is always Saturday;
- column 6 is always Friday;
- adjacent grid cells are exactly one canonical day apart;
- current-month cell count equals the exact Jalali month length;
- previous/next-month spillover remains chronologically continuous;
- leap Esfand has 30 days;
- non-leap Esfand rejects day 30;
- browser/server timezone cannot alter a date-only weekday because grid arithmetic uses UTC canonical days.

Examples covered include Farvardin 1404/1405 and leap Esfand 1403.

---

## 7. Official/religious holiday architecture

Holiday/event correctness is separate from Solar Hijri conversion correctness.

`packages/domain/src/official-calendar.ts` defines a versioned annual dataset contract:

```text
countryCode
jalaliYear
version
status
sources[]
events[]
```

Each event stores:

```text
id
Persian date
canonical date
label
kind
isHoliday
source authority/reference/retrievedAt
```

Kinds:

```text
public_holiday
religious
national
observance
```

Dataset validation fails if the stored canonical date and Jalali date do not resolve to the same civil day. Multiple events may exist on one date, and holiday status is explicit.

---

## 8. Religious-holiday policy

FieldRep OS must **not** do this:

```text
Solar Hijri date
→ arithmetic Hijri lunar formula
→ assume official Iranian religious holiday
```

Instead:

```text
Official annual Iranian calendar / verified annual source
→ versioned event dataset
→ civil-date consistency validation
→ published platform calendar version
```

Time.ir is useful as an independent annual validation source and exposes religious events together with their Solar Hijri dates. It is not a runtime dependency queried on every calendar render.

If an official correction changes an event, a new dataset version is published and prior versions remain auditable.

---

## 9. Company calendar overlay

P3 calendar composition will be:

```text
base Jalali civil calendar
+ verified official Iran annual dataset
+ company/workspace holiday overrides
+ working-week policy
+ leave/trip/meeting/program activities
```

Company overrides never alter date-conversion arithmetic.

---

## 10. P2-A10A result

The code-level correctness gate now passes:

```text
SQL migration validation          PASS
PWA security validation           PASS
Legacy XLSM extractor validation  PASS
TypeScript                        PASS
Exhaustive calendar/unit tests    PASS
Production build                  PASS
```

Calendar-specific coverage includes:

- current/official anchors;
- uploaded-workbook 95-date sequence;
- >109,000 day round-trip;
- >109,000 day Intl differential check;
- discovered ICU correction year 1502;
- leap/non-leap Esfand;
- Saturday-first month grids;
- Saturday-Friday week bounds;
- official-calendar dataset validation.

**P2-A10A is complete.** P2-A10B integrates this domain engine into the actual Calendar UI so rendering no longer depends on static/demo month coordinates.

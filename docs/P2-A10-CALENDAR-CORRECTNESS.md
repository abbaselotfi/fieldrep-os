# FieldRep OS — P2-A10 Persian Calendar Correctness Gate

**Phase:** P2 — Excel Parity / Core Field User Panel  
**Work item:** P2-A10A  
**Risk level:** CRITICAL — date/weekday drift can invalidate plans and reports  
**Baseline:** 2026-09-05

---

## 1. Decision

The legacy workbook remains a functional/UI baseline, but its one-year hard-coded calendar is **not** the production calendar engine.

FieldRep OS uses three independent layers:

```text
1. deterministic Solar Hijri date arithmetic
2. Saturday-first calendar/grid presentation
3. versioned official annual holiday/event datasets
```

These layers must not be collapsed.

In particular, religious/public-holiday dates are annual sourced data and cannot be inferred solely from a tabular lunar-calendar calculation.

---

## 2. Deterministic conversion engine

`packages/domain/src/persian-calendar.ts` owns date arithmetic.

The conversion core uses the Borkowski Persian-calendar approach adapted from the MIT-licensed `jalaali-js` implementation. No network request is needed to convert a date.

FieldRep OS operational support is deliberately bounded to Jalali years:

```text
1300 .. 1600
```

This range is inside the documented interval where the Borkowski implementation and ECMAScript `Intl` Persian calendar agree.

`Intl` is retained as an independent differential-test oracle rather than the only runtime source of truth.

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

The regression suite includes anchors around known sensitive boundaries:

```text
1399/01/01  -> 2020-03-20  Friday   (leap year)
1399/12/30  -> 2021-03-20  Saturday
1403/01/01  -> 2024-03-20  Wednesday (leap year)
1403/12/30  -> 2025-03-20  Thursday
1404/01/01  -> 2025-03-21  Friday    (common year)
1405/01/01  -> 2026-03-21  Saturday  (common year)
1405/04/01  -> 2026-06-22  Monday
1405/06/14  -> 2026-09-05  Saturday
1405/06/31  -> 2026-09-22  Tuesday
```

Source hierarchy for golden anchors:

1. **Calendar Center, Institute of Geophysics, University of Tehran** — official annual Iranian calendar publication.
2. **Time.ir** — secondary independent validation and annual event/calendar reference.
3. Other public sources may be used only as corroboration, not as the authoritative production feed.

References used during this gate:

- `https://calendar.ut.ac.ir/` — official Calendar Center publication site.
- `https://calendar.ut.ac.ir/documents/2139738/7092644/Calendar-1405.pdf`
- `https://www.time.ir/`
- `https://www.time.ir/event-year`
- Official 1404 calendar copy identifying the University of Tehran Calendar Center as compiler and 30 Esfand 1403 / 20 March 2025 year-turn boundary.

---

## 4. Uploaded workbook as a dense weekday regression source

The real XLSM Calendar contains 95 consecutive visible Jalali date headers from:

```text
1405/03/30 Saturday
through
1405/06/31 Tuesday
```

The workbook's weekday header pattern is:

```text
Saturday Sunday Monday Tuesday Wednesday Thursday Friday
```

A sanitized regression test uses only this date/weekday sequence — no physician, route or address data is committed.

This provides a dense Q2-1405 check for:

- Tir/Mordad/Shahrivar month transitions;
- 31-day month handling;
- week rollover;
- Saturday-first indexing;
- absence of progressive weekday drift.

---

## 5. Exhaustive multi-year test policy

The test suite is intentionally much broader than a few sample dates.

For **every valid day from 1300 through 1600** it verifies:

1. Jalali → canonical → Jalali round trip.
2. Consecutive valid Jalali dates map to consecutive canonical days with no gap/duplication.
3. The deterministic result matches `Intl.DateTimeFormat(... u-ca-persian ...)` for the same canonical day.
4. Month lengths agree with leap-year status.

This covers more than 109,000 civil days, including all leap/common boundaries inside the supported application range.

The test is allowed a longer timeout in CI because calendar correctness is a release gate, not a micro-unit test optimization target.

---

## 6. Month-grid invariants

A production month grid is generated from date arithmetic rather than pre-authored weekday offsets.

Required invariants:

- column 0 is always Saturday;
- column 6 is always Friday;
- every adjacent grid cell is exactly one canonical day apart;
- current-month cell count equals the exact Jalali month length;
- preceding/following month spillover stays chronologically continuous;
- leap Esfand has 30 days;
- non-leap Esfand rejects day 30;
- no browser/server timezone can change a date-only weekday because grid arithmetic uses UTC canonical days.

Examples covered:

- Farvardin 1405 begins Saturday and requires no leading spillover.
- Farvardin 1404 begins Friday and requires six leading spillover cells.
- Esfand 1403 exercises leap-day behavior.

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

Supported kinds:

```text
public_holiday
religious
national
observance
```

Dataset validation fails if the stored canonical date and Jalali date do not round-trip to the same day.

Multiple events may exist on one date. Holiday state is explicit rather than inferred from an event label.

---

## 8. Religious-holiday policy

Religious dates are especially sensitive because the official Iranian annual calendar can depend on annual religious-calendar determination/official publication.

Therefore FieldRep OS must **not** do this:

```text
Solar Hijri date
→ arithmetic Hijri lunar formula
→ assume official religious holiday
```

Instead:

```text
Official annual Iranian calendar / verified source
→ versioned event dataset
→ conversion-engine consistency validation
→ published platform calendar version
```

Time.ir is useful as an independent annual reference; for example its 1405 annual calendar lists the year's religious events together with Solar Hijri dates. It is not queried on every application page load.

If a later official correction changes an event, a new dataset version is published; historical versions remain auditable.

---

## 9. Company calendar overlay

Later P3 calendar composition will be:

```text
base Jalali civil calendar
+ verified official Iran annual dataset
+ company/workspace holiday overrides
+ working-week policy
+ leave/trip/meeting/program activities
```

Company overrides never modify the base date-conversion engine.

---

## 10. P2-A10A exit gate

P2-A10A can close only when:

- deterministic conversion replaces the previous Intl-only reverse-conversion dependency;
- official golden anchors pass;
- uploaded-workbook 95-date weekday sequence passes;
- exhaustive 1300..1600 round-trip passes;
- exhaustive differential test against Intl passes;
- leap/non-leap Esfand tests pass;
- month-grid and week-boundary tests pass;
- official-calendar dataset validation contract passes;
- legacy P2 planner/report/calendar tests remain green;
- typecheck, unit tests and build pass in CI.

Holiday dataset population for future years is a versioned data workflow; the architectural contract is established here and becomes an operational calendar input in P3.

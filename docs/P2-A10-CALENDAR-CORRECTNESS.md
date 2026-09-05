# FieldRep OS — P2-A10 Persian Calendar & Excel-Parity Closure

**Phase:** P2 — Excel Parity / Core Field User Panel  
**Work items:** P2-A10A / P2-A10B / P2-A10C  
**Risk level:** CRITICAL — date/weekday drift can invalidate plans and reports  
**Status:** COMPLETE / CLOSED  
**Baseline:** 2026-09-05

---

## 1. Decision

The legacy workbook remains a functional baseline, but its one-year hard-coded Calendar is **not** the production calendar engine.

FieldRep OS keeps three independent layers:

```text
1. deterministic Solar Hijri civil-date arithmetic
2. Saturday-first calendar/grid presentation
3. versioned official annual holiday/event datasets
```

Religious/public holidays are sourced annual data. They are not inferred from a generic arithmetic lunar conversion and they never alter civil Solar Hijri conversion rules.

---

## 2. One authoritative Persian calendar engine

`packages/domain/src/persian-calendar.ts` owns civil-date arithmetic.

The final engine is pinned to current **Unicode ICU PersianCalendar** arithmetic, including ICU's explicit correction behavior. FieldRep OS does not rely on whatever ICU version happens to exist in the end user's browser/OS for authoritative conversion.

Planning cycles, legacy import conversion and Calendar UI all delegate to the same domain engine.

Supported/tested application range:

```text
1300 .. 1600 SH
```

Runtime capabilities include:

- Jalali/Solar Hijri → canonical Gregorian date-only conversion;
- canonical Gregorian → Solar Hijri conversion;
- leap-year validation;
- exact month length;
- Saturday-first weekday index;
- Saturday-Friday week bounds;
- month-grid construction with spillover days;
- UTC-safe date-only day arithmetic.

Operational data continues to store canonical `YYYY-MM-DD` and UTC timestamps. Solar Hijri is the calendar/domain/UI projection.

---

## 3. Why Borkowski was rejected as the final engine

The first P2-A10A implementation used a Borkowski/jalaali-js-style conversion and passed current-year anchors plus the real workbook's dense 95-day sequence.

The exhaustive differential test nevertheless found a real one-day divergence at the future correction boundary:

```text
1502/12/30
Borkowski candidate -> 2124-03-20
current ICU/Intl    -> 1503/01/01 on 2124-03-20
```

The test was not relaxed or removed.

Inspection of current Unicode ICU `PersianCalendar` showed an explicit correction table including **1502 as a non-leap correction year**. FieldRep OS therefore switched the authoritative deterministic core to the pinned ICU arithmetic/correction behavior.

After that change, the same exhaustive assertions passed unchanged.

This failure is retained conceptually as the reason calendar correctness is treated as a release gate rather than a visual utility.

---

## 4. Exhaustive correctness policy

For **every valid Solar Hijri day from 1300 through 1600**, automated tests verify:

1. Solar Hijri → canonical → Solar Hijri round trip.
2. Consecutive valid days map to consecutive canonical days with no gap or duplicate.
3. The pinned deterministic result agrees with the current ECMAScript `Intl` Persian calendar oracle for the same canonical day.
4. Month length agrees with leap-year status.

Coverage exceeds 109,000 civil days for both round-trip and differential assertions.

Additional invariants verify:

- leap Esfand has 30 days;
- non-leap Esfand rejects day 30;
- Saturday is grid column 0;
- Friday is grid column 6;
- adjacent grid cells are exactly one day apart;
- spillover across month/year boundaries remains continuous;
- Saturday-Friday week bounds remain correct.

---

## 5. Golden/current anchors

Regression anchors include:

```text
1399/01/01  -> 2020-03-20  Friday
1399/12/30  -> 2021-03-20  Saturday
1403/01/01  -> 2024-03-20  Wednesday
1403/12/30  -> 2025-03-20  Thursday
1404/01/01  -> 2025-03-21  Friday
1405/01/01  -> 2026-03-21  Saturday
1405/04/01  -> 2026-06-22  Monday
1405/06/14  -> 2026-09-05  Saturday
1405/06/31  -> 2026-09-22  Tuesday
```

Annual operational-date source hierarchy:

1. **Calendar Center, Institute of Geophysics, University of Tehran** — primary official annual Iranian calendar publication.
2. **Time.ir** — independent current/annual/event cross-check.
3. **Unicode ICU** — pinned computational reference/correction behavior.
4. Other public sources — corroboration only.

Official annual publications remain particularly important for public/religious holidays and for reviewing sufficiently distant future-year corrections.

---

## 6. Real XLSM as a dense weekday regression

The uploaded XLSM contributes 95 consecutive visible Solar Hijri date headers:

```text
1405/03/30 Saturday
through
1405/06/31 Tuesday
```

The sequence crosses Khordad→Tir, Tir→Mordad and Mordad→Shahrivar while exercising 31-day months and repeated Saturday→Friday rollover.

The test uses only sanitized date/weekday facts; no physician/customer data is committed.

All 95 workbook date/weekday headers agree with the authoritative engine.

---

## 7. P2-A10B — real Calendar UI integration

`apps/web/src/pages/CalendarPage.tsx` now renders civil dates from the domain engine rather than from demo month geometry.

It uses:

```text
buildPersianMonthGrid()
canonicalDateToPersian()
canonicalWeekdayIndex()
persianDateToCanonical()
PERSIAN_WEEKDAY_NAMES
```

The UI now supports:

- exact Solar Hijri month length;
- Saturday-first columns;
- previous/next month navigation;
- Today using Iran timezone;
- previous/next-month spillover cells;
- selected-day state;
- Friday visual state;
- activity/company-closure indicators;
- selected-day agenda panel.

Removed failure-prone patterns include:

```text
hard-coded leadingBlankDays
hard-coded 31-day month arrays
independent JavaScript weekday interpretation in the agenda panel
```

Visual direction is a modern clean enterprise/pharma workspace: restrained status colors, strong typography, whitespace, large touch targets and clear operational emphasis rather than a public-calendar/consumer-site aesthetic.

Activity overlays are still demo data at P2; P3 replaces them with persisted/scoped operational activities.

---

## 8. Official/religious holiday architecture

`packages/domain/src/official-calendar.ts` defines a versioned annual dataset contract containing source provenance and explicit event/holiday state.

Conceptually:

```text
countryCode
jalaliYear
version
status
sources[]
events[]
```

Each event carries both Solar Hijri and canonical date values and fails validation if they do not resolve to the same civil day.

Kinds include:

```text
public_holiday
religious
national
observance
```

Multiple events can coexist on one day; `isHoliday` is explicit.

P3 composes:

```text
base Solar Hijri civil calendar
+ verified annual Iran dataset
+ working-week policy
+ company/workspace closures/overrides
+ leave/trip/meeting/program activities
```

Company overrides never change the civil conversion engine.

---

## 9. P2-A10C — dedicated Excel-parity closure gate

A sanitized structural manifest of the exact XLSM is stored at:

`fixtures/p2/legacy-workbook-structure.json`

It contains counts/layout invariants only, with no physician names or addresses.

A dedicated validator is now part of CI:

```text
pnpm validate:p2-parity
```

It protects the verified workbook/import contracts and runs a focused P2 test set covering:

- planner/frequency/duplicate/target rules;
- one authoritative Solar Hijri engine;
- official-calendar validation;
- legacy workbook adapter;
- clean-name + combined-label alias resolution;
- import preview/no-fabricated-history policy;
- customer/plan/visit/import repositories;
- secured customer/plan/visit APIs;
- planner/visit/report preview projections;
- Calendar UI dependence on the domain month-grid engine.

Verified real-workbook golden facts include:

```text
Physision physician rows            122
Calendar week blocks                 16
Visible date headers                 95
Matched Calendar Plan cells         359
Unknown Calendar customers            0
Daily-count mismatches                0
Traceable Report physician rows      79
Report route-marker rows              14
Unknown non-marker Report customers   0
```

---

## 10. Final P2-A10 result

Final closure gate:

```text
SQL migration validation           PASS
PWA security validation            PASS
Legacy XLSM extractor validation   PASS
P2 Excel-parity focused gate       PASS
TypeScript                         PASS
Full unit suite                    PASS
Production build                   PASS
```

**P2-A10A, P2-A10B and P2-A10C are CLOSED / DONE.**

P2 can advance to P3 without a calendar correctness or workbook-availability blocker. No production Cloudflare/D1 deployment is claimed by this code-level closure.

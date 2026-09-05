# FieldRep OS — P2-A9 Workbook Import / Migration Path

**Phase:** P2 — Excel Parity / Core Field User Panel  
**Work item:** P2-A9  
**Status:** COMPLETE / CLOSED  
**Real-workbook compatibility gate:** PASS  
**Baseline:** 2026-09-05

---

## 1. Purpose

P2-A9 provides a controlled migration path from the legacy Plan & Report XLSM workbook into FieldRep OS without treating spreadsheet display/summary values as authoritative operational history.

```text
XLSX/XLSM
→ non-executing OOXML extraction
→ legacy-workbook adapter
→ normalized validation/reconciliation preview
→ staged import manifest/rows
→ explicit apply stage
```

The exact user-provided XLSM was used for compatibility verification. The raw workbook contains customer data and is **not** committed to the public repository. Source-controlled regression artifacts are synthetic or sanitized structural metadata only.

---

## 2. File safety and provenance

`scripts/extract-legacy-workbook.py` reads the OOXML ZIP/XML container directly with the Python standard library.

It does not:

- execute VBA/macros;
- invoke Excel/COM;
- execute formulas;
- follow external workbook links;
- execute embedded objects.

CI constructs a synthetic `.xlsm` containing a dummy `vbaProject.bin` and verifies extraction without executing the payload.

Every import records:

- source filename;
- SHA-256 of the exact source bytes;
- parser version;
- original sheet/row/cell provenance.

Exact duplicate source fingerprints are rejected per workspace.

---

## 3. Verified real workbook inventory

Verified source ranges relevant to parity:

```text
Calendar       A1:M177
Physision      A1:L123
Sheet1         A1:F121
Report         A1:I106
Lists_Helper   A1:N8
```

The workbook also contains helper/report-helper sheets used by the Excel implementation.

### Physision

The master sheet has 122 physician rows and 122 unique physician names. Headers include:

```text
Column1
نام پزشک
تخصص
Class
مسیر
آدرس
frequency
Visited
Status
% Achivment
Soliqua
Toujeo
```

Important semantic distinction discovered during the real-workbook closure gate:

- `نام پزشک` is the clean canonical physician/customer name.
- `Column1` is a workbook display/selection label combining the name with Class or other suffix context.
- Calendar and much of Report use that combined label rather than the clean name.

FieldRep OS therefore keeps the clean name as canonical identity and stores the combined Excel label only as a migration `legacyAlias`.

The importer builds an alias map:

```text
legacy combined label → canonical customer natural key
```

Alias collisions fail closed with `duplicate_customer_alias` rather than silently attaching a Plan/Report to the wrong customer.

Class is workspace-defined reference data and is not constrained to A/B/C. Real labels such as half-weight or other classes are preserved.

The workbook-only holiday pseudo-customer is excluded from customer import.

### Report

Verified aggregate structure:

```text
Traceable physician rows          79
Route-marker rows                 14
Unknown non-marker customer rows   0
```

Behavior:

- the date is explicit only on the first row of some daily blocks;
- following report rows inherit/carry forward the most recent valid date;
- route labels are marker rows, not Actual Visits;
- combined physician labels resolve through the legacy alias map;
- Jalali string dates and Excel serial dates are supported;
- products and visit-report text are retained when traceable.

### Calendar

The formatted Calendar grid was verified directly from the XLSM. It consists of 16 repeated week blocks and 95 visible Jalali date headers spanning:

```text
1405/03/30 → 1405/06/31
```

Each week block follows Saturday→Friday. Operational columns are:

```text
Saturday    A + optional second session B
Sunday      C + optional second session D
Monday      E + optional second session F
Tuesday     G + optional second session H
Wednesday   I + optional second session J
Thursday    K + optional second session L
Friday      M only in this workbook layout
```

Each available session has:

- its own route cell;
- up to seven physician rows.

Each day has a stored count row. Source-cell provenance such as `A5`/`B5` is retained so same-date sessions do not collapse into the same import identity.

Real-workbook reconciliation result:

```text
Verified week blocks          16
Visible date headers          95
Matched physician Plan cells 359
Unknown Plan customers         0
Daily-count mismatches         0
```

All 359 populated physician Plan cells resolve through the Physision clean-name/legacy-alias master mapping. Holiday sentinel slots are excluded from Plans.

Product association is left empty unless explicitly traceable; cell formatting/color is never treated as product evidence.

---

## 4. Historical fact policy

Canonical FieldRep OS rules remain:

```text
Visited = count(completed Actual Visit records in the relevant range)
Achievement = Visited / Frequency
```

Workbook summary cells are reconciliation evidence only:

- `Visited` is compared with traceable Report rows;
- `Achievement` is recomputed;
- product counters are retained for reconciliation;
- **no Actual Visit is fabricated from Visited, Achievement or product counters**.

If summary values and traceable facts disagree, Preview produces warnings instead of manufacturing history.

---

## 5. Validation and normalization

`previewWorkbookImport()` produces normalized review entities:

- routes;
- customers;
- products;
- traceable Actual Visits;
- verified Calendar Plans.

Validation includes:

- missing customer name;
- invalid frequency;
- missing route warning;
- duplicate canonical physician rows;
- duplicate/colliding legacy aliases;
- invalid report/plan date;
- unknown report/plan customer;
- Visited vs traceable Report mismatch;
- non-authoritative Achievement warning;
- untraceable product-counter warning.

Persian text normalization handles Arabic/Persian Yeh/Kaf variants and zero-width joiner differences before natural-key comparison.

---

## 6. Staging, isolation and idempotency

Migration `0006_workbook_imports.sql` adds:

```text
workbook_imports
workbook_import_rows
```

Safeguards:

- unique `(workspace_id, source_sha256)` blocks accidental exact re-import;
- staging is separate from operational customer/plan/visit tables;
- rows retain sheet/row/entity/action/natural-key/payload/issues provenance;
- workspace-bound triggers fail closed on cross-workspace staging;
- manifest + rows use the atomic workspace batch abstraction.

Lifecycle states reserve:

```text
previewed
approved
applying
applied
rejected
failed
```

P2 validates the migration path but does not perform or claim a production Cloudflare/D1 data import. The first real operational apply remains an isolated deployment/data operation.

---

## 7. Regression coverage

Automated coverage includes:

- exact legacy header spellings/shape using sanitized fixtures;
- clean-name + combined-label alias resolution;
- alias collision fail-closed behavior;
- Persian-character normalization;
- non-A/B/C class preservation;
- holiday pseudo-customer exclusion;
- Report date carry-forward;
- route-marker exclusion;
- Jalali/Excel-serial conversion;
- traceable Report → Actual Visit conversion;
- no fabricated history from summary/product counters;
- verified two-session Calendar structure;
- seven physician slots per available session;
- Saturday→Friday layout;
- source-cell Plan provenance;
- daily-count reconciliation;
- source SHA-256 validation;
- staging atomicity and duplicate-fingerprint protection.

The sanitized real-workbook golden metadata lives in:

`fixtures/p2/legacy-workbook-structure.json`

It contains structural counts/invariants only and no physician/customer names or addresses.

---

## 8. Exit decision

**P2-A9 is CLOSED / DONE.**

The exact XLSM compatibility dependency is resolved. Workbook availability no longer blocks P2. The import path is now protected by the dedicated P2 Excel-parity regression gate introduced in P2-A10C.

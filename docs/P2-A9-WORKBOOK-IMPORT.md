# FieldRep OS — P2-A9 Workbook Import / Migration Path

**Phase:** P2 — Excel Parity / Core Field User Panel  
**Work item:** P2-A9  
**Status:** COMPLETE  
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

The source XLSM is private customer data and is **not** committed to the public repository. Regression fixtures contain only synthetic/sanitized structures.

---

## 2. File safety and provenance

`scripts/extract-legacy-workbook.py` reads the OOXML ZIP/XML container directly with the Python standard library.

It does not:

- execute VBA/macros;
- invoke Excel/COM;
- execute formulas;
- follow external workbook links;
- execute embedded objects.

CI also constructs a synthetic `.xlsm` containing a dummy `vbaProject.bin` and verifies that extraction succeeds without executing the payload.

Every import records:

- source filename;
- SHA-256 of the exact source bytes;
- parser version;
- original sheet/row/cell provenance.

---

## 3. Verified real workbook inventory

The uploaded production-reference workbook was inspected directly through OOXML.

Verified sheets include:

```text
Calendar
Physision
Report
Helper
Lists_Helper
Report_Helper
```

The compatibility test deliberately records only structural/aggregate information in source control; physician names and addresses are not copied into GitHub.

### Physision

The real source uses Persian/English mixed headers, including historical spellings/typos such as:

```text
نام پزشک
تخصص
Class
مسیر
آدرس
frequency
Visited
% Achivment
Soliqua
Toujeo
```

The adapter normalizes Persian/Arabic character variants and preserves workspace-defined Class labels. Class is **not** constrained to A/B/C because the source legitimately contains additional labels and half-weight variants.

A workbook-only holiday pseudo-record is detected and excluded from customer import.

### Report

Verified behavior:

- the date is present only on the first row of a day's block;
- following report rows inherit/carry forward that date;
- route names can appear as marker rows and must not become customers;
- all real physician report rows reconcile to the physician source after marker filtering;
- Jalali string dates and Excel serial dates are supported;
- product and visit-report text are retained when traceable.

### Calendar

The exact formatted grid is now verified, not guessed.

Each repeated week block uses seven day pairs:

```text
A:B  Saturday
C:D  Sunday
E:F  Monday
G:H  Tuesday
I:J  Wednesday
K:L  Thursday
M:N  Friday
```

For each day:

- the pair shares the date header;
- the two columns represent two operational route/session slots;
- each session has its own route cell;
- each session has up to seven physician rows;
- the day has a stored total/count row;
- source-cell provenance such as `A5` / `B5` is preserved so two sessions on the same date never collapse into one import identity.

The real workbook's stored daily counts reconcile with the observed populated slot cells. Holiday sentinel slots are excluded from Plan import. Real populated physician slots reconcile with the physician source.

Plan product association is intentionally left empty unless explicitly traceable from source data; visual cell styling is not treated as evidence.

---

## 4. Historical fact policy

FieldRep OS canonical rules remain:

```text
Visited = count(completed Actual Visit records in the relevant range)
Achievement = Visited / Frequency
```

Therefore workbook summary cells are reconciliation evidence only:

- `Visited` is compared with traceable Report rows;
- `Achievement` is recomputed;
- product counters are retained for reconciliation;
- no Actual Visit is fabricated from `Visited`, Achievement or product counters.

If summary values and traceable facts disagree, preview produces warnings rather than manufacturing records.

---

## 5. Validation and normalization

`previewWorkbookImport()` produces reviewable normalized entities:

- routes;
- customers;
- products;
- traceable Actual Visits;
- verified Calendar Plans.

Validation includes:

- missing physician/customer name;
- invalid frequency;
- missing route;
- duplicate normalized physician rows;
- invalid report/plan date;
- unknown report/plan customer;
- workbook Visited vs traceable Report mismatch;
- non-authoritative Achievement warning;
- untraceable product-counter warning.

Persian text normalization handles Arabic/Persian Yeh/Kaf variants and zero-width joiner differences before natural-key comparison.

Class labels are treated as workspace reference data and preserved rather than coerced to a platform enum.

---

## 6. Staging and idempotency

Migration `0006_workbook_imports.sql` adds:

```text
workbook_imports
workbook_import_rows
```

Safeguards:

- unique `(workspace_id, source_sha256)` prevents accidental exact re-import;
- staging is separate from operational customer/plan/visit tables;
- rows carry sheet/row/entity/action/natural-key/payload/issues provenance;
- workspace-bound triggers fail closed on cross-workspace staging;
- manifest + rows are written through the atomic workspace batch abstraction.

Lifecycle states reserve:

```text
previewed
approved
applying
applied
rejected
failed
```

The first real operational apply remains a deployment/data-operation concern; P2-A9 establishes and validates the migration path without touching production Cloudflare data.

---

## 7. Regression coverage

Automated tests now cover:

- real workbook header spellings/shape using sanitized fixtures;
- Persian-character normalization;
- non-A/B/C class preservation;
- holiday pseudo-customer exclusion;
- Report date carry-forward;
- route-marker exclusion;
- Jalali and Excel-serial date conversion;
- traceable Report → Actual Visit conversion;
- no fabrication from summary/product counters;
- verified two-session Calendar day layout;
- seven physician slots per session;
- Saturday→Friday week layout;
- source-cell Plan provenance;
- holiday Calendar sentinel exclusion;
- daily-count reconciliation;
- source SHA-256 validation;
- staging atomicity and duplicate-fingerprint protection.

Latest compatibility branch gate:

```text
SQL migration validation          PASS
PWA security validation           PASS
Legacy XLSM extractor validation  PASS
TypeScript typecheck              PASS
Unit tests                        PASS
Production build                  PASS
```

Both CI executions for the real-workbook compatibility commit completed successfully.

---

## 8. P2-A9 exit decision

**P2-A9 is CLOSED / DONE.**

The exact uploaded workbook has now been used to verify the migration layout. The remaining P2 work is no longer blocked on workbook availability.

Calendar *date correctness* is deliberately promoted into P2-A10 hardening because it is a higher-order requirement than merely reproducing the workbook's one-year layout: FieldRep OS must remain correct across years, leap years, weekday alignment and official holiday datasets without depending on the workbook's hard-coded annual calendar.

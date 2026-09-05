# FieldRep OS — P2-A9 Workbook Import / Migration Path

**Phase:** P2 — Excel Parity / Core Field User Panel  
**Work item:** P2-A9  
**Implementation status:** CODE COMPLETE; REAL-WORKBOOK COMPATIBILITY VERIFICATION PENDING  
**Baseline:** 2026-09-05

---

## 1. Purpose

P2-A9 provides a controlled migration path from the legacy Plan & Report Excel workbook into FieldRep OS.

The import path is deliberately not a blind spreadsheet-to-database copy. The workbook contains both source facts and derived/display values, so migration must preserve traceability and avoid converting spreadsheet summaries into fabricated operational history.

The pipeline is:

```text
XLSX/XLSM file
→ non-executing OOXML extraction
→ legacy workbook adapter
→ normalized import snapshot
→ validation / reconciliation preview
→ staged import manifest + rows
→ explicit apply step after compatibility review
```

No production or remote Cloudflare database is required for the current implementation stage.

---

## 2. Macro and File Safety

`scripts/extract-legacy-workbook.py` reads the OOXML ZIP/XML container directly using the Python standard library.

It supports:

```text
.xlsx
.xlsm
```

It does **not**:

- execute VBA/macros;
- load Excel automation/COM;
- run workbook formulas;
- follow external workbook links;
- execute embedded objects.

Formula cells expose only the cached value already stored inside the workbook XML.

The extractor records:

- source filename;
- SHA-256 of the exact source bytes;
- parser version;
- worksheet names;
- original Excel row numbers;
- extracted cell values.

This creates a deterministic source fingerprint and preserves provenance.

---

## 3. Legacy Workbook Adapter

`adaptLegacyWorkbookTabular()` converts extracted sheet data into the P2 import contracts.

Current supported reference-data mapping includes the legacy `Physision` sheet and common English/Persian header aliases for:

- physician/customer name;
- specialty;
- class;
- route;
- address;
- frequency;
- visited value for reconciliation only;
- workbook achievement value for reconciliation only;
- product counters where product columns can be recognized.

Current report mapping includes:

- report/visit date;
- physician/customer;
- product(s);
- visit report / notes.

Date conversion supports:

- canonical `YYYY-MM-DD`;
- Jalali strings such as `1405/06/15`;
- numeric Excel serial dates.

Multiple products in one report cell can be separated by common delimiters.

---

## 4. Historical Fact Policy

The workbook may contain values such as:

```text
Visited
Achievement
Toujeo counter
Soliqua counter
other product counters
```

These values are not automatically authoritative historical facts.

FieldRep OS uses the following rule:

```text
Visited = count(completed Actual Visit records in the relevant range)
Achievement = Visited / Frequency
```

Therefore:

- workbook `Visited` is used for reconciliation;
- workbook `Achievement` is recalculated, not imported as an authoritative value;
- product counters are retained for reconciliation;
- **no Actual Visit is fabricated from a product counter or Visited cell**;
- traceable report rows are the preferred source for historical Actual Visits.

If workbook summary values disagree with traceable Report rows, the import preview produces warnings instead of silently reconciling the mismatch.

---

## 5. Import Preview and Validation

`previewWorkbookImport()` normalizes the extracted snapshot into reviewable entities:

- routes;
- customers;
- products;
- visits;
- plans when a verified plan mapping is available.

Validation currently covers, among other cases:

- missing physician/customer name;
- invalid frequency;
- unknown class;
- missing route;
- duplicate normalized physician rows;
- invalid report date;
- report customer absent from the physician/customer source;
- workbook Visited vs traceable report-count mismatch;
- non-authoritative Achievement values;
- product counters that cannot independently prove historical Actual Visits.

Preview result contains:

```text
warnings
errors
canApply
entity counts
normalized payloads
source provenance
```

Any validation error makes `canApply = false`.

---

## 6. Staging / Idempotency

Migration `0006_workbook_imports.sql` adds staging tables:

```text
workbook_imports
workbook_import_rows
```

`workbook_imports` stores the source manifest and status.

`workbook_import_rows` stores normalized review rows, actions, payload JSON, issue JSON and source row coordinates.

Important safeguards:

- unique `(workspace_id, source_sha256)` prevents accidental repeat import of the same exact workbook;
- workspace-bound triggers fail closed on cross-workspace import rows;
- staging is separate from operational customer/plan/visit tables;
- manifest + staged rows are persisted through an atomic workspace batch;
- source/parser fingerprints remain available for audit and troubleshooting.

The staging lifecycle reserves:

```text
previewed
approved
applying
applied
rejected
failed
```

P2-A9 currently stops before an unverified real-workbook apply operation.

---

## 7. Calendar / Plan Mapping Safety

The legacy workbook `Calendar` sheet is a formatted planning grid rather than a simple tabular source.

Although the historical workbook layout is documented at a high level, the exact current XLSM binary is not available in the active File Library during this implementation run.

For this reason the adapter intentionally emits:

```text
calendar_present:plan_cell_mapping_requires_verified_workbook_layout
```

and does **not** guess Calendar plan cells.

This is intentional fail-safe behavior. The final Calendar adapter must be verified against the exact workbook file before historical plan rows are accepted.

---

## 8. Real Workbook Compatibility Gate

Code-level P2-A9 is complete when all repository gates pass.

The remaining external compatibility check requires the exact legacy XLSM/XLSX file to be available and consists of:

1. Run the non-executing extractor against the source workbook.
2. Confirm expected sheet inventory.
3. Verify `Physision` header/column mapping.
4. Verify `Report` mapping and date/product parsing.
5. Reconcile source counts against the workbook UI/macros.
6. Inspect all adapter diagnostics.
7. Verify exact `Calendar` cell/block layout.
8. Add the verified Calendar plan adapter and golden regression fixture.
9. Confirm re-import fingerprint/idempotency behavior.
10. Keep the first real apply operation isolated from production.

Until this gate is performed, the importer must not claim exact compatibility with every cell of the current XLSM.

---

## 9. Security and Tenant Boundary

Import persistence is workspace-bound.

The architecture assumes the eventual import API will also require explicit import permissions and will inject authenticated actor/workspace identity server-side.

The source workbook itself must not be treated as authorization evidence. A row naming another user, workspace or company never expands the caller's scope.

Raw source-file retention, when enabled later through R2/Data Vault, must preserve tenant provenance and follow the platform dataset/import governance rules.

---

## 10. Tests / Engineering Gate

P2-A9 currently has automated tests for:

- normalization of physician, route and product data;
- traceable Report → Actual Visit conversion;
- no fabrication from Visited/product counters;
- Achievement recomputation policy;
- unknown-customer fail-closed behavior;
- duplicate physician handling;
- source SHA-256 validation;
- import manifest/row atomic staging;
- duplicate source fingerprint protection;
- Jalali report-date conversion;
- Excel serial-date conversion;
- multi-product report parsing;
- missing-sheet diagnostics;
- Calendar mapping remaining disabled until verified.

Repository gate after implementation:

```text
SQL migration validation   PASS
PWA security validation    PASS
TypeScript typecheck       PASS
Unit tests                 PASS
Production build           PASS
```

---

## 11. P2-A9 Exit Status

### Complete without user action

- Safe XLSX/XLSM extraction architecture.
- No macro execution.
- SHA-256 provenance.
- Legacy physician/report adapter.
- Jalali/Excel date conversion.
- Preview/validation engine.
- Visited/Achievement reconciliation policy.
- Staging schema and repository.
- Import idempotency foundation.
- Automated tests and CI gate.

### Pending exact source workbook

- Exact compatibility verification against the user's current XLSM binary.
- Exact Calendar grid/cell mapping.
- Golden regression fixture derived from that workbook.

The pending items are compatibility verification, not a redesign of the importer architecture.

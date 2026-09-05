# FieldRep OS — Excel Parity Matrix

**Source workbook:** `Plan And Report-ّFinal Q2.xlsm`  
**Purpose:** Acceptance baseline for P2 — Core Field User Panel

---

## 1. Rule

The workbook is treated as a functional baseline. P2 cannot be considered complete if a core workflow in Excel is missing from the application unless the difference is documented as an approved product improvement.

---

## 2. Workbook-to-Application Mapping

| Excel Area | Observed behavior | FieldRep OS target | P2 status |
|---|---|---|---|
| Calendar | Jalali quarter/year context | Jalali planning cycle selector | Required |
| Calendar | Week/day blocks | Excel-style planner view | Required |
| Calendar | Date + weekday | Jalali date/weekday rendering | Required |
| Calendar | Route/territory per day | Route selector per day | Required |
| Calendar | Doctor selection below route | Doctor picker filtered by route | Required |
| Calendar | Daily visit count | Live daily count | Required |
| Calendar | Repeated doctor planning visible | Duplicate detection/warning | Required |
| Calendar | Product planning context | Product context in plan/visit | Required |
| Physision | Doctor name | Doctor master data | Required |
| Physision | Specialty | Specialty field/filter | Required |
| Physision | Class | Class field/filter/badge | Required |
| Physision | Route | Route association | Required |
| Physision | Address | First customer location | Required |
| Physision | Frequency | Required visit frequency | Required |
| Physision | Visited | Calculated completed visit count | Required |
| Physision | Status | Incomplete / achieved / over-achieved | Required |
| Physision | Achievement % | Completed / required frequency | Required |
| Physision | Soliqua count | Configurable product visit counter | Required |
| Physision | Toujeo count | Configurable product visit counter | Required |
| Report | Jalali date | Visit/report date | Required |
| Report | Weekday | Derived weekday | Required |
| Report | Doctor | Customer link | Required |
| Report | Product | Product selection | Required |
| Report | Visit report | Report text field | Required |
| Report | Weekly grouping | Week filter/grouping | Required |
| Report | Monthly grouping | Month filter/grouping | Required |
| Helper/List logic | Filtered doctor list | Explicit query/filter service | Required |

---

## 3. Core Calculation Parity

### 3.1 Visited

Workbook behavior:

```text
Visited = Sum(product-specific visit counters)
```

Application behavior:

`Visited` must be derived from actual completed visit records, with product aggregation available as a projection/report. It must not be stored as a manually maintained spreadsheet-style total.

Parity outcome:

```text
completed visits for doctor in active cycle -> Visited
```

### 3.2 Status

Required semantic parity:

```text
Visited < Frequency  -> incomplete
Visited = Frequency  -> achieved
Visited > Frequency  -> over-achieved
```

UI may replace workbook icons with accessible badges, but meaning must remain.

### 3.3 Achievement

```text
Achievement = Visited / Frequency
```

Rules to define during P2 implementation:

- Safe handling when frequency is zero
- Percentage formatting
- Over-achievement > 100%

---

## 4. Planner Acceptance Cases

### Case P2-PLAN-001 — route first

Given a user selects a date and route, the doctor picker must be able to show doctors belonging to that route.

### Case P2-PLAN-002 — add doctors

User can add one or more doctors to the selected day without using fixed spreadsheet rows.

### Case P2-PLAN-003 — duplicate feedback

If the same doctor is planned more than once according to the duplicate rule set, the application surfaces a clear warning.

### Case P2-PLAN-004 — daily total

The displayed daily total updates immediately when plan entries change.

### Case P2-PLAN-005 — frequency context

The doctor picker and/or plan card exposes enough context to see current progress against required frequency.

### Case P2-PLAN-006 — three equivalent views

The same plan can be edited/viewed through:

1. Excel-style
2. Calendar-style
3. Mobile/list

Changing view must not create separate or divergent plan data.

---

## 5. Doctor Master Acceptance Cases

### P2-DOC-001

User can search by doctor name.

### P2-DOC-002

User can filter by route.

### P2-DOC-003

User can filter by class.

### P2-DOC-004

User can filter by specialty.

### P2-DOC-005

Doctor detail shows:

```text
Name
Specialty
Class
Route
Address/location
Frequency
Visited
Achievement
Product visit summary
```

### P2-DOC-006

The existing workbook address is migrated as the doctor's initial primary location; the schema supports additional locations without migration redesign.

---

## 6. Visit and Report Acceptance Cases

### P2-VISIT-001

A planned visit can be completed into an actual visit.

### P2-VISIT-002

An unplanned visit can be recorded.

### P2-VISIT-003

User can select one or more configured products according to product policy.

### P2-VISIT-004

User can enter visit report text.

### P2-VISIT-005

Completing a visit updates doctor Visited/Achievement projections without manual recalculation.

### P2-VISIT-006

User can distinguish:

```text
planned
completed
missed
cancelled
rescheduled
```

where implemented in the P2 workflow.

---

## 7. Reporting Acceptance Cases

### P2-REPORT-001

Daily report lists visit records for the selected Jalali day.

### P2-REPORT-002

Weekly report aggregates the same underlying records without duplication.

### P2-REPORT-003

Monthly report aggregates the same underlying records without duplication.

### P2-REPORT-004

Report output can show at least:

```text
Date
Weekday
Doctor
Product
Visit report
```

### P2-REPORT-005

Totals reconcile with doctor Visited values for the same scope/cycle according to the defined calculation policy.

---

## 8. Improvements Allowed Without Breaking Parity

The following are intended improvements, not parity failures:

- Unlimited plan entries instead of fixed spreadsheet rows
- Responsive cards instead of cells on mobile
- Searchable doctor picker
- Faster route filtering
- More readable status badges
- Multiple locations instead of one address field
- Explicit plan vs actual visit state
- Autosave/sync state
- Offline queue
- Calendar navigation
- Undo or safe confirmation for destructive actions

---

## 9. Features Deferred Beyond P2

These are designed in P0 but do not block Excel parity:

```text
Map View
Neshan/Google integration
Nearby customers
Route optimization
GPS visit verification
Leave approval workflow
Business-trip workflow
Company events
Doctor events
AI recommendations
Supervisor reporting
Company admin
Platform admin
Dataset marketplace/catalog
```

---

## 10. P2 Closure Gate

P2 is green only when:

- All required rows in this matrix have an implemented equivalent.
- Core calculations are covered by automated tests.
- The same plan is rendered consistently in all three views.
- Daily/weekly/monthly reports reconcile.
- An imported workbook sample can be used end-to-end.
- A field user can perform the normal Excel workflow without opening Excel for missing core functionality.

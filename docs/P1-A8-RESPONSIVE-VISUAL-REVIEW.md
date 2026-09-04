# FieldRep OS — P1-A8 Responsive Visual Review

**Phase:** P1-A8  
**Scope:** Representative sample data + responsive UI review  
**Data policy:** All names/addresses in the demo fixture are synthetic and must not be treated as production/company data.

## 1. Review baseline

Reviewed against:

- `FRONTEND-PWA-UX-SPEC.md`
- `UI-DESIGN-DIRECTION.md`
- `DESIGN-SYSTEM.md`
- Field User first product priority in `ROADMAP.md`

Primary viewport classes used for the source-level responsive audit:

```text
360px   compact field phone
390px   common modern phone
768px   tablet / narrow landscape
1024px  compact desktop
1440px  wide desktop
```

A browser screenshot pass should be repeated after the installable PWA preview exists in P1-A9; P1-A8 does not claim pixel-perfect device certification.

## 2. Representative fixture

`apps/web/src/data/demo-field-workspace.ts` now provides one coherent synthetic workspace instead of unrelated placeholders:

- Diabetes workspace / Mashhad territory context
- doctors, pharmacy and clinic customer types
- A/B/C classifications
- per-customer frequency progress
- multiple locations for a customer
- Route 6/7/8 examples
- daily plan with completed/next/planned states
- five-day planning sample
- operational calendar events
- leave, trip, meeting and company closure examples
- AI suggestion preview with structured reasons
- daily report summary
- product chips for visit capture

The fixture is presentation-only. It is not an application persistence layer and must not become a substitute for Workspace DB repositories.

## 3. Planner review

The Planner now exposes four selectable presentation modes backed by the same sample records:

```text
List      mobile/default execution view
Calendar  workload-oriented week cards
Excel     high-density horizontally scrollable table
Map       provider-neutral layout placeholder until P5
```

Key responsive decisions:

- View selector remains four equal touchable segments on phone.
- List rows collapse to stacked content before `sm`.
- Calendar cards move from one column to two and then five columns.
- Excel view deliberately uses horizontal scrolling rather than shrinking table controls below usable size.
- Map view becomes one column until large screens, then map/list split.
- AI suggestions remain below the main planner on narrow screens and become a right rail on wide desktop.

## 4. Calendar review

Changes made during review:

- Added the leading blank day for the displayed month shell rather than forcing day 1 into the first column.
- Weekday labels collapse to single-character Persian labels on compact screens.
- Calendar grid gaps and radii reduce on phones while day targets retain a minimum vertical touch size.
- Event dots remain compact; event text stays in the selected-day detail card.
- Company closure is visually distinct from normal visit markers.

Authoritative holiday/week-day computation remains a P3 domain concern; this P1 screen is a visual shell with representative events.

## 5. Home / Customers / Reports / Visit review

### Home

- Metrics are derived from the shared demo plan instead of disconnected hard-coded numbers.
- Next activity displays customer, route and selected location.
- Timeline truncates long customer/location text instead of forcing horizontal overflow.

### Customers

- Mobile rows are semantic cards with type/location context.
- Large-screen layout becomes a six-column customer table.
- Frequency and multi-location counts are visible before opening detail.

### Reports

- Period selector is protected with horizontal overflow for very narrow widths.
- Metrics and charts use the shared report fixture.
- A chronological daily-actual list is present below summary cards.

### Visit capture

- Customer selector uses the representative dataset.
- Product selection uses large chip controls.
- Submit/draft actions stack on phones and align horizontally from `sm` upward.
- Location verification remains an explicit future capability rather than pretending GPS evidence already exists.

## 6. Findings carried forward

Not defects for P1-A8, but required later:

- Real customer search/filter behavior — P2.
- Accurate operational holiday rules and calendar persistence — P3.
- IndexedDB/offline states — P4.
- Real map renderer/geocoding/routing — P5.
- GPS/geofence verification — P6.
- Real recommendation scoring — P7.
- Role-aware supervisor/admin UI — P8–P10.

## 7. P1-A8 exit criteria

```text
coherent synthetic data across field-user screens        PASS
real selectable Planner presentation modes               PASS
mobile-first list behavior                               PASS
high-density Excel view protected by horizontal scroll   PASS
provider-neutral Map placeholder                         PASS
calendar compact-screen treatment                        PASS
customer/report/visit responsive cleanup                 PASS
no production/company data dependency                    PASS
CI typecheck/test/build                                   REQUIRED BEFORE CLOSE
```

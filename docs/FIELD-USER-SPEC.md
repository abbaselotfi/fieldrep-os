# FieldRep OS — Field User Workspace Specification

**Phase:** P0 Foundation  
**Primary implementation phases:** P1–P2  
**Source baseline:** `Plan And Report-ّFinal Q2.xlsm`  
**Status:** Initial approved product definition

---

## 1. Purpose

The Field User Workspace is the first production-critical surface of FieldRep OS.

Its first success criterion is simple:

> A field user must be able to replace the existing Excel Plan & Report workflow without losing the planning, frequency, visit, product, achievement, or reporting behavior they already rely on.

The Excel workbook is therefore treated as the **functional baseline**, not merely as a visual reference.

The web/PWA experience may improve navigation, clarity, mobility, offline behavior, mapping, and automation, but core Excel behavior must not be silently removed.

---

## 2. Workbook Baseline Observed

The supplied workbook currently contains these relevant functional areas:

### `Calendar`

- Jalali quarter/year planning
- Week-based daily columns
- Day/date display
- Route/territory selection
- Doctor selection beneath each day
- Daily visit totals
- Product-related planning context

### `Physision`

The active doctor table contains fields equivalent to:

- Display name
- Doctor name
- Specialty
- Class
- Route
- Address
- Frequency
- Visited
- Status
- Achievement %
- Product visit counts (currently Soliqua / Toujeo)

Observed calculation model:

```text
Visited = sum(product visit counters)
Achievement = Visited / Frequency
```

Status semantics in the workbook:

```text
Visited < Frequency  -> incomplete
Visited = Frequency  -> achieved
Visited > Frequency  -> over-achieved
```

### `Report`

- Jalali date
- Weekday
- Doctor
- Product
- Visit report text
- Monthly and weekly grouping/filter context

### Helper sheets

The workbook also uses helper/list structures that support filtered doctor lists and report/calendar behavior. These are implementation details in Excel and must become explicit application/domain logic in FieldRep OS.

---

## 3. Field User Information Architecture

Initial Field User navigation:

```text
Home
Calendar
Planner
Customers
Visits
Reports
More
```

`More` initially contains:

```text
Activities
Settings
Sync status
Help/About
```

On mobile, the primary bottom navigation should remain intentionally small:

```text
Home | Planner | + Visit | Reports | More
```

Calendar and Customers remain one tap away from Home/More or contextual shortcuts.

On desktop/tablet, use a persistent side navigation.

---

## 4. Home / Today Dashboard

The Home screen is not a management dashboard. It is an execution dashboard for the current user.

Priority order:

1. What do I need to do today?
2. What is next?
3. Am I on target?
4. Is anything blocking or conflicting with my plan?

Core cards:

```text
Today's planned visits
Today's completed visits
Daily target
Remaining visits
Current route / city
Next activity
```

Secondary indicators:

```text
Cycle achievement
A/B/C coverage or company-defined classes
Upcoming meeting/trip/leave
Offline/sync status
```

Primary actions:

```text
Start today's plan
Add visit
Open calendar
View nearby customers (P5)
Generate suggestions (P7)
```

Avoid large analytics charts on the first mobile screen.

---

## 5. Planner

Planner is the core module and must support three first-class views from the first parity release.

### 5.1 Excel View

Purpose: preserve familiarity for existing Excel users.

Requirements:

- Week/day layout visually inspired by the workbook
- Jalali date and weekday
- Route per day
- Doctor rows/cards under the date
- Daily count
- Duplicate indicators
- Class visibility
- Quick product context where useful
- Horizontal scrolling on small devices only when unavoidable

This view should feel familiar but must not reproduce spreadsheet limitations such as fixed row counts or fragile merged-cell layouts.

### 5.2 Calendar View

Purpose: visual planning and rapid navigation.

Requirements:

- Month/week/day navigation
- Jalali dates
- Planned visit count per day
- Activity/holiday indicators
- Tap day -> open day plan
- Drag/drop rescheduling on capable devices in a later increment

### 5.3 Mobile/List View

Purpose: fastest field workflow.

Example:

```text
شنبه 15 شهریور
Route: منطقه 8
Target: 9

Dr A            A   2/6
Dr B            B   3/4
Dr C            A   5/6
```

Each item should support:

- Open customer
- Mark/start visit
- Reorder where permitted
- Change location if customer has multiple locations
- Remove/reschedule

### 5.4 Map View — P5

Map View uses the same plan entries, not a separate planning model.

It later adds:

- Customer pins
- Multiple customer locations
- Distance
- Nearby customers
- Route optimization
- External navigation

---

## 6. Planning Rules

The application domain must explicitly implement rules that are currently implicit in the workbook.

Initial rules include:

- Jalali planning cycle selection
- Daily target
- Route-based customer selection
- Doctor frequency requirement
- Duplicate detection
- Visit count per doctor
- Product visit counters
- Achievement calculation
- Daily/weekly/monthly grouping

The UI may warn but should not silently delete or alter a user's plan.

Examples:

```text
Doctor already planned this week
Doctor frequency already achieved
Doctor belongs to another route
Day is company holiday
User is on approved leave
Meeting conflicts with planned visit
```

Hard-block vs warning behavior must be configurable by later company policy where appropriate.

---

## 7. Customer Model in User Workspace

The first parity release focuses on doctors, but UI terminology should use the broader concept `Customer` so pharmacies and other entities can be added without redesign.

Initial customer types:

```text
Doctor
Pharmacy (foundation / later full UI)
```

Future-compatible types:

```text
Hospital
Clinic
Laboratory
Other customer
```

### Doctor list

Fields required from the current workbook:

```text
Name
Specialty
Class
Route
Address
Frequency
Visited
Achievement
Product visit counts
```

Filters:

```text
Search
Class
Specialty
Route
Achievement status
Frequency gap
```

### Doctor detail

Sections:

```text
Summary
Locations
Planning status
Visit history
Products
Notes (permission-dependent)
```

The existing single Excel address must migrate into the first doctor location. The domain model must support multiple locations from the beginning.

---

## 8. Visits and Reports

Plan and Report are separate concepts.

```text
Plan   = intended visit
Visit  = actual performed interaction
Report = structured/text result of the visit
```

A planned visit may become:

```text
completed
missed
cancelled
rescheduled
```

An unplanned visit may also be recorded.

### Visit capture — first release

Required:

- Doctor/customer
- Date/time
- Planned vs unplanned
- Product(s)
- Visit report text
- Selected customer location when known

Future-ready fields:

- Check-in
- Check-out
- Location evidence
- Attachments
- Structured outcomes

### Reporting views

Field user must be able to review:

```text
Today
Week
Month
Planning cycle / quarter
Custom range (later)
```

The application should preserve the workbook's daily/weekly/monthly reporting behavior while improving readability and filtering.

---

## 9. Activities in the Field User Timeline

The user's workday is broader than visits.

Calendar/timeline must anticipate:

```text
Doctor visit
Pharmacy visit
Leave
Business trip / mission
Internal meeting
Company program
Doctor program/event
Company holiday
Public holiday
Custom activity
```

These activities must not incorrectly increase doctor frequency or visit achievement.

They may count as working activity according to company configuration.

---

## 10. Operational Calendar

Calendar is a complete work timeline, not merely a date picker.

Required visual direction is based on the approved reference shared during P0:

- Rounded month container
- Large touch-friendly day targets
- Clear previous/next controls
- Strong selected-day state
- Separate today state
- Clear holiday state
- Small event/activity indicators rather than crowded text

Required views over time:

```text
Month
Week
Day
Agenda
```

A day opens the corresponding day plan.

---

## 11. Working Days and Holidays

User planning must respect calendar policy provided by company/workspace configuration.

Sources:

```text
Public holidays
Company closure days
Workspace closure days
Working weekday rules
```

Field users can see the policy but normally cannot edit company-level holidays.

---

## 12. Trips / Missions

A trip affects both calendar and planning context.

Example:

```text
Origin: Mashhad
Destination: Bojnourd
Start/end
Purpose
```

During the trip, recommendation and map logic should prioritize the destination context rather than the user's normal territory when policy allows.

---

## 13. Leave

Field user can create a leave request/record according to company policy.

Foundation statuses:

```text
draft
requested
approved
rejected
cancelled
```

Leave blocks or warns against visit planning according to policy.

---

## 14. PWA Behavior

The user workspace is the primary offline-capable area.

Target behavior:

```text
Open app without connectivity
View authorized cached customers
View current plan
Add/edit plan where allowed
Record visit/report
Queue sync
Reconnect
Sync automatically or explicitly
```

The UI must always make sync state understandable without being intrusive.

States:

```text
Synced
Syncing
Offline — changes saved on device
Needs attention
Conflict
```

---

## 15. Location Foundation

Each doctor/pharmacy may have multiple locations.

A location belongs to the domain, not to a map vendor.

Required foundation:

```text
label
address
city/province/district
latitude
longitude
primary flag
active flag
source
```

P5 adds map provider integration.

P6 adds visit-location verification.

---

## 16. AI-Assisted Planning Foundation

The Field User UI must leave room for future recommendations without making AI mandatory for normal planning.

Entry points:

```text
Suggest tomorrow
Suggest next working day
Suggest next week
Fill remaining cycle gaps
```

Suggestions are visually distinct from confirmed plans.

User actions:

```text
Accept all
Accept day
Accept item
Reject
Edit
Reschedule
```

Every suggestion must expose `Why this visit?` with structured reasons.

AI never silently publishes an official plan.

---

## 17. User Preferences

Persist at least:

```text
Preferred planner view
Language / RTL preferences when localization expands
Default calendar view
Compact vs comfortable density
Last selected workspace
Optional default route
```

Company policy may override only settings that genuinely require central control.

---

## 18. P1/P2 Scope Boundary

### P1

Build:

- Login/session shell
- Workspace context
- Navigation
- Jalali UI foundation
- User settings foundation
- Empty/placeholder routes for core modules

### P2

Build complete Excel-parity user workflow:

- Doctors
- Routes
- Planner
- Three planner views
- Frequency
- Daily target
- Duplicate detection
- Products
- Plan
- Visit/report
- Visited
- Achievement
- Daily/weekly/monthly reports
- Initial Excel data import

Not required to close P2:

- Maps
- GPS verification
- AI recommendations
- Supervisor UI
- Company admin UI
- Platform admin UI

Their domain interfaces are anticipated in P0 but implementation stays phased.

---

## 19. Field User Definition of Done

The first Field User milestone is complete only when a representative can:

1. Log in.
2. Open the correct workspace.
3. See the authorized doctor list.
4. Build a Jalali visit plan using any of the three planner views.
5. Select routes and doctors.
6. See frequency/achievement context.
7. Receive duplicate/conflict feedback.
8. Record actual visits and products.
9. Enter visit report text.
10. Review daily, weekly, and monthly results.
11. Use the application comfortably on phone and desktop.
12. Perform the agreed workflow without returning to the Excel workbook for missing core functionality.

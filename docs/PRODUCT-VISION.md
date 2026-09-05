# FieldRep OS — Product Vision

**Phase:** P0 — Product & Architecture Foundation  
**Status:** Baseline product definition  
**Primary initial user:** Field User / Medical Representative

---

## 1. Product Statement

FieldRep OS is a multi-tenant, multi-workspace field-force planning and intelligence platform designed first for pharmaceutical and healthcare field teams, while keeping the core domain broad enough for other field-force use cases.

The platform combines:

- Visit planning
- Visit reporting
- Customer master data
- Operational calendar
- Territory and route context
- Maps and multi-location customers
- Offline-first PWA workflows
- Visit-location evidence
- Team and company reporting
- Dataset management
- Explainable AI-assisted planning

The first product milestone is not a generic CRM. It is a reliable replacement for the existing Plan & Report Excel workflow used by an individual field user.

---

## 2. Product North Star

A field user should be able to answer, at any moment:

```text
What should I do today?
Who should I visit next?
Where are they?
Am I on target?
What did I actually complete?
What must I still complete before the cycle ends?
```

A supervisor should later be able to answer:

```text
What is my team planning?
What was completed?
Who is behind target/frequency?
Where are operational conflicts?
```

A company should later be able to answer:

```text
How is each workspace/team performing?
How is master data maintained?
Which users have which access?
Which company policies affect planning?
```

The platform operator should later be able to answer:

```text
Which companies/workspaces exist?
Which capabilities are licensed?
How are databases routed?
Which datasets are available/assigned?
What administrative/security events occurred?
```

---

## 3. First Product Success Criterion

The first major success criterion is:

> A field user can log in to FieldRep OS and complete the same core planning/reporting workflow currently performed in the supplied Excel workbook, without returning to Excel because of missing core functionality.

This includes:

- Jalali planning context
- Routes
- Doctor selection
- Doctor class
- Required frequency
- Duplicate/conflict awareness
- Daily target
- Product selection
- Visit reporting
- Visited count
- Achievement calculation
- Daily/weekly/monthly reporting

---

## 4. Product Hierarchy

FieldRep OS uses the following business hierarchy:

```text
Platform
└── Company
    └── Workspace
        └── Organization Unit / Team
            └── User Membership
```

### Platform

The FieldRep OS service as a whole.

### Company

A customer organization using FieldRep OS.

Example:

```text
Pharma Company A
```

### Workspace

A strong isolation boundary within a company, typically corresponding to a business unit or field-force population with its own users, products, datasets, plans, reports, and potentially its own physical database.

Examples:

```text
Diabetes
Cardiology
Neurology
```

A workspace is not merely a team.

### Organization Unit / Team

A hierarchical operational grouping inside a workspace.

Examples:

```text
East Region
└── Mashhad
    └── Team A
```

Organization units can be hierarchical and typed, for example:

```text
business_unit
region
area
team
custom
```

---

## 5. User Roles

Initial platform role families:

```text
platform_admin
company_admin
workspace_admin
supervisor
user
```

Roles do not define data scope by themselves.

Example:

```text
role = supervisor
scope = organization_unit:team-a
```

The same supervisor role can therefore apply to different teams without hard-coded logic.

---

## 6. Core Product Surfaces

### 6.1 Field User Workspace — first priority

Primary modules:

```text
Home
Calendar
Planner
Customers
Visits
Reports
Activities
Settings
```

Planner presentation modes:

```text
Excel view
Calendar view
Mobile/List view
Map view (P5)
```

The first three are required for Excel-parity milestone P2.

### 6.2 Supervisor Workspace

Future modules:

```text
Team dashboard
User drill-down
Plans
Reports
Coverage/frequency
Activity calendar
Location-verification summary
```

### 6.3 Company/Workspace Administration

Future modules:

```text
Users
Roles
Teams
Working calendar
Company holidays
Customers
Products
Routes
Targets
Imports
Reports
Feature settings
Audit
```

### 6.4 Platform Administration

Future modules:

```text
Companies
Workspaces
Limits
Feature entitlements
Database routing
Dataset catalog
Dataset imports
Dataset versions
Dataset assignment
Security/Audit
Platform analytics
```

---

## 7. Customer Domain

The initial application is doctor-first but the domain must support multiple customer categories.

Initial/future categories:

```text
Doctor
Pharmacy
Hospital
Clinic
Laboratory
Other
```

A customer may have multiple physical locations.

Example:

```text
Dr X
├── Private Office
├── Hospital
└── Clinic
```

Location identity must be independent from any specific map provider.

---

## 8. Shared Practitioner Identity vs Workspace Data

The platform may maintain a canonical practitioner identity to recognize that the same physician appears in multiple datasets/workspaces.

However, workspace-specific operational attributes must remain isolated.

Example:

```text
Canonical practitioner: Dr X

Diabetes workspace:
  class = A
  frequency = 6
  product interest = Product D

Cardiology workspace:
  class = B
  frequency = 3
  product interest = Product C
```

Shared identity must never imply shared operational notes, plans, visits, targets, or reports.

---

## 9. Dataset Vision

FieldRep OS must support datasets originating from:

```text
Platform-provided data
Purchased/licensed data
Company imports
Workspace imports
Curated/normalized data
```

A dataset may contain:

```text
Doctors
Pharmacies
Hospitals
Clinics
Other reference/customer data
```

The platform must later support:

- Dataset versioning
- Source/provenance
- Normalization
- Duplicate candidate detection
- Dataset filtering/splitting
- Snapshot assignment
- Live assignment
- Assignment/revocation

Platform administrative access to imported datasets must be supported technically, governed by explicit contractual/privacy terms, and audited.

---

## 10. Calendar Vision

Calendar is an operational timeline, not just a date picker.

It combines:

```text
Doctor visits
Pharmacy visits
Leave
Business trips
Internal meetings
Company programs
Doctor programs
Company closures
Public holidays
Custom activities
```

Company/workspace policy determines which activities block planning and which count as working activity.

The interface is Jalali-first for the initial Persian/RTL release.

Backend date/time representation remains canonical and timezone-aware.

---

## 11. Maps and Location Vision

Location capabilities must be provider-independent.

Future map functions:

- Search
- Geocoding
- Reverse geocoding
- Customer pins
- Nearby customers
- Distance calculation
- Routing
- Multi-stop optimization
- External navigation

Initial provider candidates include Neshan and Google Maps through adapters.

Map view is contextual and on-demand; it is not permanently shown on every planning screen.

---

## 12. Visit Location Verification Vision

A company may optionally enable visit-location evidence.

Evidence may include:

```text
Target customer location
Captured coordinates
Accuracy
Capture time
Server receipt time
Distance from target
Verification status
```

Suggested statuses:

```text
verified
nearby
unverified
outside
```

This feature is evidence of reported location, not guaranteed proof of physical presence.

Continuous employee tracking is outside the initial scope and, if introduced later, must be a separate feature with its own policy and permissions.

---

## 13. AI Planning Vision

AI-assisted planning is a recommendation system, not an autonomous scheduler.

Initial recommendation logic should combine deterministic inputs such as:

```text
Required frequency
Completed frequency
Days since last visit
Doctor class
Remaining cycle time
Route/city
Distance
Doctor availability
Daily target
Holidays
Leave
Business trips
Meetings
Company programs
Product/campaign priorities
```

Every suggestion must be explainable.

Example:

```text
Recommended because:
- Class A
- 3 visits remain
- 21 days remain in cycle
- 27 days since last visit
- Same route as 4 other priority doctors
```

AI suggestions require user acceptance before becoming official plans.

---

## 14. Offline/PWA Vision

Field users must be able to perform essential work during poor connectivity.

Target offline flow:

```text
Open installed/browser PWA
View authorized cached data
View plan
Create/edit plan
Record visit/report
Save locally
Reconnect
Synchronize
```

The user must always understand whether data is:

```text
Synced
Pending
Offline-saved
Conflicted
Failed
```

---

## 15. Visual Product Character

The UI direction is **Modern Clinical Enterprise**.

Characteristics:

- Clean white/light surfaces
- Strong whitespace
- Clear typography hierarchy
- Minimal visual noise
- Rounded but restrained components
- One primary accent token
- Status color only where meaningful
- Mobile-first field execution
- Desktop productivity without dashboard clutter
- RTL-first initial experience
- Accessible contrast and touch targets

The product should feel premium because it is fast, clear, consistent, and purposeful—not because it contains many widgets or decorative effects.

---

## 16. Non-Goals for Early Releases

The following are intentionally not P1/P2 goals:

```text
Full CRM
General messaging/chat
Payroll
Continuous employee tracking
Complex billing engine
Native mobile rewrite
Autonomous AI agent
Advanced marketing automation
```

They must not delay the first usable Field User release.

---

## 17. Product Principles

1. **Field execution first.**
2. **Preserve Excel business behavior, not spreadsheet limitations.**
3. **Role and scope remain separate.**
4. **Workspace is a strong isolation boundary.**
5. **Master identity does not leak operational data.**
6. **Offline behavior is explicit and trustworthy.**
7. **Maps are provider-independent.**
8. **AI recommendations are explainable and user-approved.**
9. **Administrative access is explicit, governed, and auditable.**
10. **Complex future capabilities must not make today's user workflow complicated.**

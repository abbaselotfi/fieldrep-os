# FieldRep OS — Frontend & PWA UX Specification

**Phase:** P0 Foundation  
**Primary audience:** Field User  
**Status:** Initial visual/product direction

---

## 1. UX Principle

The field user is usually mobile, time-constrained, and task-oriented.

The UI should optimize for:

```text
clarity
speed
large touch targets
few taps
visible status
minimal typing
strong offline feedback
```

The application must not feel like a spreadsheet on a phone even though Excel behavior is preserved in the domain.

Excel familiarity is provided through one dedicated planner view, not by making the entire product spreadsheet-like.

---

## 2. Responsive Strategy

### Mobile

Primary target for daily field execution.

Use:

- Bottom navigation
- Cards
- Sheets/drawers for selection
- Sticky primary actions
- Large touch targets
- One-column task flows

### Tablet

Use:

- Side navigation when space allows
- Two-column layouts
- Planner + detail split where useful

### Desktop

Use:

- Persistent sidebar
- Wider tables
- Multi-column dashboards
- Excel-style planner is most comfortable here

The same routes and domain data are shared across all sizes.

---

## 3. Visual Language

Recommended character:

- Calm clinical/professional visual style
- Light surfaces
- Rounded cards
- Clear whitespace
- Strong typography hierarchy
- Minimal decorative elements
- Color used primarily for meaning/status

Avoid:

- Dense enterprise-dashboard clutter
- Excessive gradients
- Tiny spreadsheet controls
- Large numbers of simultaneous charts
- Color-only status communication

Initial design tokens should support company branding later without coupling the interface to one company color palette.

---

## 4. Navigation

### Mobile bottom navigation

```text
Home
Plan
+ Visit
Reports
More
```

`+ Visit` is visually emphasized because recording field activity is a primary action.

### Desktop/tablet sidebar

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

Future role-aware entries should be added without changing the Field User core navigation model.

---

## 5. Home Screen

Top area:

```text
Greeting / user context
Today — Jalali date
Workspace / team context
Connectivity/sync indicator
```

Primary execution card:

```text
Today's Plan
7 / 9 completed
Next: Dr. X
[Open today's plan]
```

Secondary compact cards:

```text
Daily target
Remaining visits
Current route
Cycle achievement
```

Upcoming timeline:

```text
10:30 Doctor visit
13:00 Internal meeting
16:30 Doctor visit
```

Do not place company-wide analytics on this screen.

---

## 6. Calendar UI

The approved calendar reference establishes the interaction direction.

### Month header

- Large rounded month/year selector
- Previous/next controls
- Jalali month/year
- Optional tap to jump to month/year picker

### Day grid

- Large circular/rounded day targets
- Strong selected-day state
- Distinct today state
- Holidays clearly differentiated
- Small event dots/markers below or within days
- Do not fill every day with event text

### Calendar day detail

Tapping a date opens a bottom sheet/mobile panel or side panel/desktop containing:

```text
Visits
Meetings
Leave
Trips
Programs
Holiday information
```

Primary action:

```text
Open Day Planner
```

---

## 7. Planner — Excel View

Purpose: familiarity and high-density planning.

Desktop/tablet-first but available on mobile.

Visual design:

- Week bands
- Day header
- Jalali date
- Route chip/select
- Doctor plan items
- Daily total footer

Do not reproduce merged spreadsheet cells.

Each doctor appears as a compact semantic item containing:

```text
Doctor name
Class badge
Frequency progress
Optional conflict indicator
```

Mobile behavior:

- Horizontal week scroll
- Snap to day/week sections
- Sticky date/route header

---

## 8. Planner — Calendar View

Month/week view emphasizes workload rather than detailed names.

A day cell may show:

```text
9 visits
1 meeting
```

or compact indicators.

Selecting the day opens the day's plan list.

Useful states:

```text
empty
suggested (future P7)
planned
partially completed
completed
holiday
leave
```

---

## 9. Planner — Mobile/List View

This should be the recommended default on phones.

Example card:

```text
Dr. Ali Rezaei                      A
Internal Medicine
Route 8 · 3/6 visits
Ahmadabad Clinic

[Start visit]                     ⋯
```

Day header:

```text
Saturday 15 Shahrivar
Route: Area 8
Target 9 · Planned 8
```

Quick actions should include:

- Add doctor
- Reorder
- Move to another day
- Change location
- Remove from plan

Use swipe only as an optional accelerator; all actions must remain discoverable through buttons/menu.

---

## 10. Customer Picker

Opening `Add doctor` should use a full-screen mobile picker or desktop dialog.

Header:

```text
Search doctors
```

Filter chips:

```text
Route
Class
Specialty
Needs visit
Nearby (P5)
```

Doctor result:

```text
Dr. X                      A
Internal · Route 8
4 / 6 visits
```

High-value contextual information should be visible before selection.

---

## 11. Doctor Detail

Mobile layout uses sections/cards:

### Summary

```text
Name
Specialty
Class
Route
Frequency progress
```

### Locations

Each location card:

```text
Private office
Address
Primary
[Map] [Navigate] — P5
```

### Cycle progress

```text
Required 6
Completed 4
Remaining 2
Achievement 67%
```

### Recent visits

Compact timeline.

Primary action:

```text
Add to plan
```

or when context is today:

```text
Start visit
```

---

## 12. Visit Capture

The visit form should be fast.

Recommended flow:

```text
1. Customer
2. Location
3. Product(s)
4. Visit report
5. Save
```

Where customer/location are already known from a planned visit, steps are prefilled.

Use product chips/toggles rather than dropdowns when product count is small.

Report field supports multiline text.

Future sections (collapsed until implemented):

```text
Location verification
Structured outcomes
Attachments
```

Primary action should remain visible near the bottom of the screen.

---

## 13. Reports

Field user reports prioritize personal execution.

Top filters:

```text
Day
Week
Month
Cycle
```

Summary:

```text
Planned
Completed
Achievement
```

Then a chronological list/table.

On mobile use cards; on desktop use a sortable table.

Avoid turning every report into a chart dashboard. Charts are added only where they improve understanding.

---

## 14. Status Design

Status must always use icon/text + color.

Examples:

```text
Incomplete      4/6
Achieved        6/6
Over target     7/6
```

Do not rely on red/green alone.

For planner conflicts:

```text
Warning — already planned this week
Warning — company holiday
Conflict — approved leave
```

---

## 15. Empty States

Every core empty state should offer the next action.

Examples:

```text
No visits planned for today.
[Add visits]
```

```text
No doctors match these filters.
[Clear filters]
```

```text
No report has been recorded yet.
[Record visit]
```

---

## 16. Offline UX

Connectivity should be understandable but unobtrusive.

### Online/synced

Small neutral sync indicator.

### Offline

Persistent but compact banner/chip:

```text
Offline — changes will sync later
```

### Pending

```text
3 changes waiting to sync
```

### Conflict/error

Use an attention state that opens a sync issues page.

Never make users guess whether their report was saved locally.

---

## 17. PWA Install Experience

The application should be useful in-browser without requiring install.

After meaningful usage, show a non-blocking install suggestion when browser/platform supports it.

Do not force installation during login/onboarding.

Installed PWA goals:

- App icon
- Standalone window
- Fast startup
- Offline field-user shell
- Cached authorized data

---

## 18. RTL and Persian UX

The initial field user experience is Persian/RTL-first.

Requirements:

- Correct RTL layout
- Jalali date presentation
- Persian text alignment
- Numeric values remain readable
- Mixed Latin product names do not break layout
- Map addresses can contain mixed Persian/Latin strings

The domain/API must remain language-neutral for later localization.

---

## 19. Accessibility and Ergonomics

Minimum expectations:

- Touch target ~44px or larger
- Visible keyboard focus
- Sufficient contrast
- Semantic labels
- Form validation messages adjacent to fields
- No critical gesture-only actions
- Color not the sole status indicator

Field usage may occur outdoors; contrast and tap size matter more than decorative density.

---

## 20. Performance UX

The Field User shell should feel immediate.

Prefer:

- Skeletons only where loading is expected
- Local cache for authorized frequently used doctor lists
- Optimistic UI for safe local actions
- Background sync where supported
- Route-level lazy loading for heavier admin/future modules

Planner and customer search must remain responsive for large customer datasets.

---

## 21. Frontend Component Families

Create reusable components instead of page-specific copies:

```text
AppShell
BottomNav
Sidebar
JalaliDateHeader
MonthCalendar
DaySummary
PlanItem
DoctorCard
ClassBadge
FrequencyProgress
RouteSelector
CustomerPicker
LocationCard
ProductSelector
VisitForm
StatusBadge
SyncIndicator
EmptyState
ConflictBanner
FilterChips
```

The UI package should be token-driven to allow future company branding.

---

## 22. Suggested Frontend Stack

Target direction for P1:

```text
React
TypeScript
Vite
Tailwind CSS
React Router
PWA plugin/service worker
```

State architecture should distinguish:

```text
server state
local UI state
offline domain state
```

Do not use one global store for everything.

Exact libraries for server-state/offline persistence are finalized in the implementation ADR.

---

## 23. User Preferences

Persist per user:

```text
preferred planner view
calendar default view
UI density
last route filter
last workspace
```

A user changing from Excel View to Mobile View is changing presentation only; underlying plan records remain identical.

---

## 24. P1 Visual Deliverables

Before P2 feature implementation is considered underway, P1 should establish polished responsive shells for:

```text
Login
Home
Calendar
Planner — empty/skeleton + view switcher
Customers
Visit form shell
Reports
Settings
Offline/sync states
```

P1 should include representative sample data so UI behavior can be reviewed before connecting the full planner engine.

---

## 25. Design Acceptance Rule

When simplicity and Excel visual fidelity conflict:

- Preserve **Excel behavior/data semantics**.
- Prefer the **simpler PWA interaction**.
- Keep the Excel-style planner as the familiarity view.

The product should feel like a purpose-built field application, not an Excel workbook embedded in a browser.

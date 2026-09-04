# FieldRep OS — Calendar & Activity Specification

**Phase:** P0-A5  
**Implementation focus:** P3, with P1/P2 hooks

---

## 1. Purpose

The FieldRep OS calendar is the user's operational work timeline. It must combine planning and non-visit work without turning every activity into a visit or KPI event.

The calendar is not the Planner itself. Planner specializes in visit scheduling; Calendar shows the complete work context and links into Planner.

---

## 2. Event Categories

Initial categories:

```text
visit
pharmacy_visit
leave
business_trip
internal_meeting
company_program
doctor_program
public_holiday
company_closure
workspace_closure
custom_activity
```

Each category must define whether it:

```text
blocks_planning
counts_as_working_activity
counts_as_visit
appears_in_report
requires_approval
```

`counts_as_visit` is false for non-visit activities.

---

## 3. Unified Calendar Projection

Domain-specific entities remain separate, but calendar rendering consumes a unified projection.

```ts
export interface CalendarItem {
  id: string;
  workspaceId: string;
  type: CalendarItemType;
  sourceType: string;
  sourceId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  scope: CalendarScope;
  blocksPlanning: boolean;
  countsAsWorkingActivity: boolean;
  status: string;
  location?: CalendarLocationRef;
}
```

The projection can be rebuilt from authoritative domain records.

---

## 4. Scope

Calendar items may target:

```text
platform
company
workspace
organization_unit
selected_users
user
```

Examples:

```text
Public holiday         -> platform/country calendar
Company closure        -> company
Diabetes cycle meeting -> workspace
Mashhad team meeting   -> organization unit
Personal leave         -> user
```

Access and visibility are permission-scoped.

---

## 5. Working Calendar Rules

Workspace planning must resolve an effective working calendar from layered rules:

```text
public calendar
+ company working-day policy
+ company closures/overrides
+ workspace policy
+ workspace closures/overrides
+ user leave/trip/activity context
```

Suggested resolver:

```ts
interface WorkingCalendarService {
  getDayContext(input: {
    workspaceId: string;
    userId: string;
    localDate: string;
  }): Promise<WorkingDayContext>;
}
```

Result:

```ts
interface WorkingDayContext {
  localDate: string;
  isWorkingDay: boolean;
  planningAllowed: boolean;
  reasons: CalendarConstraintReason[];
  blockingItems: CalendarItem[];
  informationalItems: CalendarItem[];
}
```

---

## 6. Conflict Engine

Planner must ask Calendar/Constraint services before confirming a plan change.

Conflict types may include:

```text
company_closure
workspace_closure
approved_leave
business_trip_city_mismatch
blocking_meeting
program_overlap
manual_time_overlap
non_working_day
```

Severity:

```text
info
warning
block
```

The engine returns reasons; it does not silently modify the user's plan.

```ts
interface PlanningConflict {
  code: string;
  severity: 'info' | 'warning' | 'block';
  messageKey: string;
  sourceItemId?: string;
  metadata?: Record<string, unknown>;
}
```

Company policy may later upgrade/downgrade configurable conflicts where safe.

---

## 7. Calendar UI Views

Required eventual views:

```text
Month
Week
Day
Agenda
```

### Month

Purpose:
- Date navigation
- Workload overview
- Holidays/leave/trip/activity markers

Avoid filling cells with long text.

### Week

Purpose:
- Time-aware planning context
- Meeting/trip/visit overlap visibility

### Day

Purpose:
- Full daily timeline
- Link to Day Planner

### Agenda

Purpose:
- Compact chronological list, especially useful on mobile

---

## 8. Jalali Presentation

Initial UI is Persian/RTL and Jalali-first.

The service/domain API remains calendar-neutral and timezone-aware.

UI responsibilities:

```text
Gregorian/canonical date -> Jalali display
weekday localization
month localization
RTL layout
```

Do not store formatted Jalali labels as authoritative event dates.

---

## 9. Calendar Visual States

Minimum semantic states:

```text
today
selected
working day
public holiday
company/workspace closure
leave
trip
has visits
has meeting/program
suggested plan future
completed day
```

Status cannot rely on color alone.

On month grid, prefer compact dots/badges/icons rather than event text overload.

---

## 10. User Flow: Calendar -> Planner

```text
Open Calendar
→ Select date
→ View day summary
→ Open Day Planner
→ Edit plan
→ Return to same calendar date
```

Calendar and Planner share the date context but remain separate modules.

---

## 11. Leave Contract

```ts
interface LeaveRequest {
  id: string;
  workspaceId: string;
  userId: string;
  type: 'annual' | 'sick' | 'hourly' | 'emergency' | 'other';
  startsAt: string;
  endsAt: string;
  status: 'draft' | 'requested' | 'approved' | 'rejected' | 'cancelled';
  reason?: string;
}
```

Only approved leave is a default hard planning constraint; draft/requested leave can be informational according to policy.

---

## 12. Business Trip Contract

```ts
interface BusinessTrip {
  id: string;
  workspaceId: string;
  userId: string;
  origin?: PlaceContext;
  destination: PlaceContext;
  startsAt: string;
  endsAt: string;
  purpose?: string;
  transport?: string;
  status: string;
}
```

Trip destination becomes planning/recommendation context for the affected period.

---

## 13. Meeting Contract

```ts
interface Meeting {
  id: string;
  workspaceId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  scope: CalendarScope;
  locationId?: string;
  blocksPlanning: boolean;
  countsAsWorkingActivity: boolean;
  status: string;
}
```

---

## 14. Company/Doctor Program Contract

Program base:

```ts
interface ProgramBase {
  id: string;
  workspaceId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  locationId?: string;
  blocksPlanning: boolean;
  countsAsWorkingActivity: boolean;
  appearsInReport: boolean;
  status: string;
}
```

Doctor programs additionally relate to practitioner participants and potentially products/users.

---

## 15. Reporting Integration

Daily reports should separate:

```text
Visit activity
Non-visit working activity
Leave/non-working time
Travel/mission context
```

Example:

```text
Doctor visits: 8
Pharmacy visits: 2
Internal meeting: 1
Business trip: 90 min
Doctor program: 1
```

A meeting must never increase doctor visit frequency.

---

## 16. Company Admin Controls — Future P9

Authorized admins should later configure:

```text
working weekdays
closures
workspace-specific closures
meeting/program defaults
whether activity blocks planning
whether activity appears in reports
approval requirements
```

Field users normally have read visibility, not policy-management rights.

---

## 17. Planner Integration API

Suggested service boundary:

```ts
interface CalendarConstraintService {
  getDayContext(input: DayContextInput): Promise<WorkingDayContext>;
  checkPlanEntry(input: PlanConstraintInput): Promise<PlanningConflict[]>;
  checkPlanDay(input: PlanDayConstraintInput): Promise<PlanningConflict[]>;
}
```

The Planner Engine must not query UI calendar components.

---

## 18. AI Integration

Recommendation Engine consumes normalized calendar constraints, not raw UI events.

Example:

```ts
interface RecommendationCalendarContext {
  localDate: string;
  planningAllowed: boolean;
  availableWindows: TimeWindow[];
  destinationContext?: PlaceContext;
  blockers: CalendarConstraintReason[];
}
```

---

## 19. P0-A5 Acceptance Criteria — Calendar

1. Calendar and Planner responsibilities are separate.
2. Non-visit activities cannot accidentally increment visit KPIs.
3. Working-day/closure/leave/trip constraints have a service interface.
4. Company/workspace/user scope is explicit.
5. Calendar can render one unified timeline from domain-specific entities.
6. AI can consume calendar constraints without depending on UI code.
7. Jalali is presentation behavior, not storage identity.

# FieldRep OS — UI Design Direction

**Phase:** P0 Foundation  
**Audience:** Field User first; reusable across Supervisor / Company / Platform panels  
**Status:** Approved design direction baseline

---

## 1. Design Goal

FieldRep OS should feel like a modern enterprise life-sciences application, but it must remain fast and calm enough for daily field use.

The target character is:

```text
Clinical
Calm
Professional
Modern
Focused
Trustworthy
Fast
```

The product should not visually imitate any specific pharmaceutical company product. Public interfaces from large life-sciences platforms are used only as usability benchmarks.

---

## 2. Benchmark Conclusions

### Veeva CRM / life-sciences field tools

Useful patterns:

- Home surfaces actionable information instead of decorative analytics.
- Tile/card layouts provide fast scanning.
- Mobile navigation keeps high-frequency destinations available.
- Schedule + map can use a split view on large screens.
- Recent Veeva mobile UI uses consistent rounded cards and a very light neutral background.

What FieldRep OS should improve:

- Avoid too many dashboard tiles at once.
- Avoid unexplained icon-only actions.
- Keep daily plan more prominent than platform statistics.

### Novo Nordisk public digital products

Useful patterns:

- One clear primary task per screen.
- Strong whitespace.
- Simple progress visualization.
- Friendly but restrained visual feedback.
- Minimal navigation.
- Motion should guide status/feedback rather than decorate.

### Sanofi digital accessibility direction

Useful principles:

- Accessibility by design.
- WCAG-oriented contrast.
- Do not use color as the only status signal.
- Controls and important graphics require strong visual distinction.

### Salesforce Life Sciences concepts

Useful product pattern:

- Recommended/next-best engagements belong close to planning context.
- Map and engagement planning should complement the schedule, not replace it.

---

## 3. Evaluation of the Supplied PULSE Reference

The supplied reference is useful because it combines:

```text
calendar
activity schedule
map
field-user navigation
```

However, FieldRep OS should not reproduce the entire composition.

Problems to avoid:

1. Too many competing regions on one page.
2. Calendar is visually secondary even though date selection is important.
3. Map consumes permanent space even when the user is not navigating.
4. Several small icon-only actions are difficult to interpret quickly.
5. Same light-blue treatment is repeated across many components, weakening hierarchy.
6. Desktop-first density will not translate well to phones.
7. Sidebar contains more items than a field user needs during normal daily execution.

The useful idea to retain is:

> Date selection + today's activities + optional geographic context should be tightly connected.

---

## 4. FieldRep Visual System

### 4.1 Backgrounds

Use a very light neutral application background.

```text
App background: off-white / very light neutral
Primary surface: white
Secondary surface: soft neutral
```

Avoid blue-tinted backgrounds across the whole application.

### 4.2 Brand color

FieldRep OS has one primary accent token.

```text
--brand-primary
--brand-primary-soft
--brand-on-primary
```

The accent can later be overridden per company within accessibility constraints.

The company logo/accent may change; information architecture and component behavior must not.

### 4.3 Semantic colors

Color is reserved mainly for meaning:

```text
success
warning
danger
info
holiday
suggested
```

Always pair semantic color with text/icon/shape.

### 4.4 Corners

Recommended default:

```text
small controls: 10–12px
cards: 14–16px
large sheets/panels: 18–20px
```

Do not make every element pill-shaped.

### 4.5 Shadows

Use minimal elevation.

Prefer borders and surface contrast before shadows.

---

## 5. Typography

Persian/RTL is the first production language.

Recommended direction:

- Test `Vazirmatn` and `Noto Sans Arabic` for Persian UI.
- Use a single primary UI family where possible to avoid mixed-metric layouts.
- Product names and technical Latin strings must align cleanly inside Persian sentences.

Hierarchy:

```text
Page title        24–28px
Section title     18–20px
Card title        15–17px
Body              14–16px
Metadata          12–13px
```

Numbers used for targets/visit counts may use stronger weight, not oversized dashboard typography.

---

## 6. Spacing and Density

Use an 8px spacing system.

Common values:

```text
4
8
12
16
24
32
```

FieldRep supports different information densities by context:

```text
Comfortable  -> mobile/default
Compact      -> desktop lists/tables
Excel Dense  -> dedicated Excel planner only
```

Do not globally make the application dense merely because the Excel source is dense.

---

## 7. Icons

Use one consistent icon family.

Recommended implementation candidate:

```text
Lucide
```

Rules:

- Icon + text for important actions.
- Icon-only only for universally understood actions or when a tooltip/accessible label exists.
- No row containing several cryptic icons like the supplied reference.

Examples:

```text
Add visit
Navigate
Open details
More
Reschedule
```

---

## 8. Desktop Shell

For RTL Field User mode:

```text
┌──────────────────────────────────────────────────────┐
│ Top bar: Page context                     User/Sync │
├───────────────┬──────────────────────────────────────┤
│ Right sidebar │ Main content                         │
│               │                                      │
│ Home          │                                      │
│ Calendar      │                                      │
│ Planner       │                                      │
│ Customers     │                                      │
│ Reports       │                                      │
│ More          │                                      │
└───────────────┴──────────────────────────────────────┘
```

Sidebar should be collapsible.

Field User sidebar should stay short; role-specific admin navigation belongs to admin shells.

---

## 9. Mobile Shell

Primary bottom navigation:

```text
Home | Plan | + Visit | Reports | More
```

Rules:

- Maximum five primary destinations.
- Central visit action is visually prominent but not oversized.
- Calendar is reachable from Home/Plan in one tap.
- Customers is reachable through Plan/Home/More and contextual search.

---

## 10. Recommended Home Screen

The home screen should answer:

```text
What should I do now?
What remains today?
Am I on target?
Is anything blocking me?
```

Desktop concept:

```text
┌────────────────────────────────────────────────────────────┐
│ شنبه 15 شهریور 1405          Diabetes · Mashhad    Synced │
│ Good morning, Abbas                                       │
├───────────────────────────────┬────────────────────────────┤
│ TODAY                         │ MINI CALENDAR              │
│ 7 of 9 completed              │                            │
│ ███████████████░              │ Sep / Shahrivar            │
│                               │ selected/today/events      │
│ Next                          │                            │
│ 15:00 Dr. X                   │ [Open calendar]            │
│ Ahmadabad Clinic              │                            │
│ [Start visit]                 │                            │
├───────────────────────────────┴────────────────────────────┤
│ Timeline                                                   │
│ 10:00 Dr A  ✓     13:00 Meeting     15:00 Dr X            │
├────────────────────────────────────────────────────────────┤
│ Target 9     Remaining 2     Route 8     Cycle 78%         │
└────────────────────────────────────────────────────────────┘
```

Do not show a permanent map on Home.

Map is opened when:

- user taps a customer location,
- user opens Map View,
- user requests Nearby,
- user requests route optimization/navigation.

---

## 11. Planner Desktop Layout

Recommended default:

```text
┌───────────────────────────────────────────────────────────────┐
│ Planner   15–19 Shahrivar     [Excel][Calendar][List][Map]  │
│ Route: Area 8        Target: 9             + Add customer    │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│ Main planner content                                          │
│                                                               │
│ Context panel appears only when needed:                       │
│ - filters                                                     │
│ - doctor detail                                               │
│ - mini calendar                                               │
│ - map                                                         │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

Key principle:

> Do not permanently display calendar + plan list + map at the same time on ordinary laptop widths.

Use responsive drawers/split panels instead.

---

## 12. Day Plan / List View

Recommended mobile-first structure:

```text
Saturday 15 Shahrivar
Area 8
8 planned · Target 9

[ + Add doctor ]

09:00
Dr. A                                  A
Internal Medicine
Private Office · 3/6
[Start visit]                       [More]

10:30
Dr. B                                  B
Cardiology
Hospital · 4/4
Target achieved

13:00
Internal Meeting
Company Office
```

A field user must understand the day without opening details for every record.

---

## 13. Calendar Design

Preserve the approved rounded calendar direction but simplify it.

Month view:

- Large Jalali month/year header
- Previous/next navigation
- Comfortable day targets
- Today and selected day are different states
- Holidays use text/icon + styling, not red alone
- Maximum 2–3 compact event dots/markers per day
- Overflow becomes a count

Example:

```text
          ‹ شهریور 1405 ›

ش   ی   د   س   چ   پ   ج
        1   2   3   4   5
6   7   8   9  10  11  12
13 [14] 15  16  17  18  19
      •  ••
```

Below the calendar on mobile, show the selected day's agenda.

On desktop, agenda may open beside the calendar.

---

## 14. Map UI

Map is a task mode, not permanent decoration.

Desktop Map View can use a Veeva-like split concept:

```text
┌────────────────────────┬──────────────────────────────────┐
│ Planned / Nearby list  │ Map                              │
│                        │                                  │
│ Dr A   0.3 km          │   1      3                       │
│ Dr B   1.2 km          │      2                           │
│ Dr C   1.8 km          │                                  │
│                        │                                  │
│ [Optimize route]       │                                  │
└────────────────────────┴──────────────────────────────────┘
```

Mobile:

- full-screen map,
- draggable bottom sheet for customers/route,
- selected customer card,
- one obvious navigation action.

---

## 15. Doctor / Customer Cards

Avoid oversized cards for every row on desktop.

Mobile card:

```text
Dr. Saeideh Shariati                  A
Internal Medicine
Route 8 · 4/6 visits
Ahmadabad Clinic

[Start visit]                    [More]
```

Desktop compact row:

```text
Dr. Saeideh Shariati | Internal | A | Route 8 | 4/6 | Start Visit
```

Same domain data, different responsive presentation.

---

## 16. Visit Form

Design priority: minimum friction.

If launched from today's plan, prefill:

```text
Doctor
Location
Date/time
Planned status
```

User primarily completes:

```text
Product(s)
Visit report
Optional outcome fields
```

Use a sticky save action on mobile.

Do not display future advanced fields until enabled.

---

## 17. AI Recommendations UI — Future P7

Recommendations belong inside planning, not in a separate chatbot-first experience.

Example:

```text
Suggested for Monday

Dr. X                                  High priority
Class A · 3 visits remaining
Same route as 4 planned doctors
27 days since last visit

[Add to Monday]    [Why?]    [Dismiss]
```

Optional assistant panel may explain or refine a plan, but the primary workflow remains visual and actionable.

---

## 18. Motion

Use motion only to communicate:

```text
saved
synced
expanded
moved
completed
error
```

Transitions should be short and subtle.

Avoid decorative animation in daily field workflows.

---

## 19. Accessibility Baseline

Target WCAG 2.2 AA for production UI.

Minimum rules:

- Text contrast >= 4.5:1 where applicable.
- Active UI/non-text controls should remain clearly distinguishable.
- Never communicate status through color alone.
- Keyboard focus must be visible.
- Touch targets approximately 44px minimum.
- Important actions require accessible text labels.
- Outdoor mobile readability is a design requirement.

---

## 20. Company Branding

Future white-label customization may include:

```text
company logo
primary accent
secondary accent (limited)
login illustration/background
```

It must NOT allow companies to break:

```text
contrast
status semantics
navigation hierarchy
component spacing
accessibility
```

FieldRep OS remains visually consistent across tenants.

---

## 21. Design Tokens to Establish Before P1

At minimum:

```text
color.background
color.surface
color.surfaceMuted
color.text
color.textMuted
color.border
color.primary
color.primarySoft
color.success
color.warning
color.danger
color.info

radius.sm
radius.md
radius.lg

space.1 ... space.6

font.body
font.size.*

shadow.card

layout.sidebarWidth
layout.contentMaxWidth
```

Do not hard-code company colors throughout components.

---

## 22. P1 Visual Acceptance Screens

Before P1 visual shell closes, review at least these representative screens with realistic sample data:

1. Login — desktop/mobile
2. Home — desktop/mobile
3. Calendar — desktop/mobile
4. Planner List — desktop/mobile
5. Planner Excel — desktop/tablet/mobile behavior
6. Planner Calendar
7. Customer picker
8. Doctor detail
9. Visit form
10. Reports
11. Offline state
12. Empty/error/loading states

---

## 23. Final UI Rule

When choosing between a visually impressive dashboard and a faster field workflow:

> Choose the faster field workflow.

FieldRep OS should look premium because hierarchy, typography, spacing, responsiveness, accessibility, and feedback are excellent — not because the screen contains more widgets.

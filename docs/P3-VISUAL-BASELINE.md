# FieldRep OS — P3 Visual Baseline

**Phase:** P3 Operational Calendar & Activities  
**Status:** APPROVED BASELINE  
**Direction:** Clinical Enterprise — visually rich enough for rapid field scanning, still restrained and professional

## 1. Decision

FieldRep OS uses a subtle combination of:

- a thin semantic status rail on the logical start edge of a card;
- a compact text/icon status badge inside the card;
- neutral white/light surfaces for the main card body.

The two indicators reinforce each other but never compete for attention.

## 2. Status rail

Recommended behavior:

- width: approximately 3–4 px;
- follows RTL/LTR logical start edge rather than a hard-coded left/right side;
- no gradient;
- no glow;
- no heavy shadow;
- semantic color only;
- may be omitted for neutral/informational cards when the badge alone is sufficient.

The rail exists primarily for fast visual scanning in Calendar, Agenda and Planner lists.

## 3. Status badge

Badge rules:

- always includes readable text;
- optional small icon when it improves recognition;
- soft semantic background rather than saturated fill;
- normal/medium type weight;
- compact but not tiny;
- color is never the sole state signal.

Example states:

```text
برنامه‌ریزی شده
انجام شد
از دست رفته
جلسه
ماموریت
مرخصی
تعطیل
تداخل زمانی
نیاز به توجه
```

## 4. Card hierarchy

A field activity card should normally contain:

```text
Primary identity/title
Secondary context
Time / route / location
Progress or key metadata when applicable
Status badge
Primary action only when actionable
```

Do not overload every card with all available fields.

## 5. Semantic palette behavior

Semantic intent is stable even if tenant branding changes:

```text
success   completed / approved
danger    missed / blocking conflict
warning   attention / pending issue
info      meeting / informational context
brand     planned / selected / primary action
neutral   inactive / cancelled / metadata
```

Company branding may change the primary brand accent but must not redefine the meaning of success/warning/danger.

## 6. Calendar month cells

Month cells remain visually quiet.

Use:

- selected/today state;
- max 2–3 event dots or micro-markers;
- compact overflow count;
- holiday/closure semantic marker;
- avoid inserting full activity-card styling inside each date cell.

The richer card treatment belongs to the selected-day panel, Week/Day views and Agenda.

## 7. Activity cards

Examples:

### Visit

- subtle brand/success rail depending on state;
- badge such as `Planned` or `Completed`;
- customer, specialty/class, location, frequency progress.

### Internal meeting

- subtle info rail;
- `Meeting` badge;
- time, scope/team, location;
- blocking indicator only if it blocks planning.

### Business trip

- subtle info/brand rail;
- `Mission` badge;
- destination and period;
- planning-context indicator.

### Leave

- warning/info rail while requested;
- success/neutral semantic state when approved according to context;
- explicit `Approved leave` text rather than color-only treatment.

### Conflict

- danger rail only for blocking conflicts;
- clear `Conflict` / `Blocked` badge;
- human-readable reason and resolution action.

## 8. Elevation and density

- Prefer border + surface contrast before shadow.
- Use one subtle card shadow level at most.
- Mobile uses comfortable spacing.
- Desktop supports a more compact density without reducing tap/interaction clarity.
- Excel View remains the only intentionally dense surface.

## 9. Accessibility

- Semantic rail is supplementary only.
- Badge text or an equivalent accessible label is mandatory.
- Contrast must remain WCAG-oriented.
- Focus states remain visible around the whole interactive card/action.
- Do not hide status details exclusively behind hover.

## 10. Final visual rule

> Richness comes from hierarchy, useful status information and carefully controlled semantic detail — not from decoration.

This baseline applies to P3 Calendar/Activity UI and should remain the default visual language for later Supervisor and Admin operational cards unless a role-specific density requires adaptation.

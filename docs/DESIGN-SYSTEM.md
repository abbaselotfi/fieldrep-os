# FieldRep OS — Design System Foundation

**Phase:** P1-A6  
**Direction:** RTL-first, mobile-first, Modern Clinical Enterprise

## Principles

- One dominant action per field workflow.
- Calm surfaces, strong hierarchy, minimal decorative UI.
- Status is never communicated by color alone.
- Touch targets are at least 44px.
- Desktop uses a right-side workspace navigation rail; mobile uses bottom navigation.
- Planner views share one domain model; List, Calendar, Excel and Map are presentations, not separate data stores.
- Map is on demand rather than permanently occupying the field-user workspace.
- Reduced-motion preference is respected.

## Semantic tokens

The initial reusable TypeScript token contract lives in `packages/ui` and the web implementation maps semantic CSS variables in `apps/web/src/styles.css`.

Core semantics:

```text
surface-app       application background
surface-raised    cards/sidebar/top-level raised surfaces
surface-soft      low-emphasis containers
text-primary      headings/actionable content
text-secondary    supporting copy
text-tertiary     metadata
border-subtle     non-dominant separation
accent            primary action/active state
accent-soft       selected/background emphasis
success           confirmed/synced state
```

Company branding may later override the accent family, but must not change workflow semantics or remove contrast requirements.

## Persian/Jalali rules

- Canonical backend timestamps remain Gregorian/UTC/timezone-safe values.
- Jalali is a presentation/business-calendar layer.
- Initial field timezone default is `Asia/Tehran`, overridable by workspace configuration.
- UI formatting uses the platform `Intl` Persian calendar (`fa-IR-u-ca-persian`) to avoid a calendar dependency for basic display.
- Date arithmetic that later requires complex recurrence/range logic must remain isolated behind calendar utilities; UI components must not embed ad-hoc Jalali calculations.

Reusable helpers currently provide:

```text
getJalaliDateParts
formatJalaliLongDate
formatJalaliMonthTitle
formatPersianWeekday
```

## Accessibility baseline

- Keyboard focus remains visible.
- Interactive controls must have accessible names.
- Selected/complete/error states require text or iconography in addition to color.
- Motion is reduced when `prefers-reduced-motion` is enabled.
- Dense Excel-style planning is a desktop/tablet enhancement; the default mobile workflow remains list/action based.

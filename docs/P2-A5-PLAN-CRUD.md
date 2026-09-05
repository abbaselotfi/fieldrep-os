# P2-A5 — Plan CRUD + Shared Planner Views

Status: COMPLETE

## Outcome

P2-A5 establishes one plan record model that can be created, edited, listed and soft-cancelled without mixing planned work with visit actuals.

## Persistence

Workspace migration `0004_plan_entries.sql` adds durable plan entries with:

- workspace + owner isolation
- planning-cycle reference
- customer reference
- canonical plan date
- optional route
- plan status and source
- created/updated timestamps

Database guards reject:

- a plan outside its referenced cycle
- inaccessible/user-private customer ownership mismatches
- cross-workspace routes
- duplicate active/completed same-customer same-day plans for one representative

Cancellation is history-preserving (`status = cancelled`) rather than hard deletion.

## Repository and API

`WorkspacePlanEntryRepository` provides owner-scoped list/get/create/update/cancel operations through the workspace data-store abstraction.

The secured plan API requires the matching `plans.*.own` permission and active workspace. The authenticated user ID is injected server-side; client payloads cannot select another owner.

Stable write errors include:

- `outside_planning_cycle`
- `customer_not_found`
- `invalid_route`
- `duplicate_same_day`

The web package now also has an `OwnPlanHttpClient` that uses cookie credentials and the same API contract. It is ready for authenticated runtime composition when the Cloudflare auth/database environment is enabled.

## Planner UI

The Pages/static preview intentionally remains synthetic and server-independent, but it now exercises real CRUD behavior in one shared mutable plan model:

- add a customer to a day
- edit/move a plan entry
- soft-cancel a plan entry
- same-day duplicate blocking
- adjacent-day duplicate warning
- daily-target warning

List, Calendar and Excel views read the same plan state. A mutation in one view is immediately visible in the others. The Excel view now renders enough visit columns for the configured demo daily target instead of truncating the plan at six columns.

## Runtime boundary

GitHub Pages must not pretend to be the authenticated production application. It does not call tenant APIs or persist business data. The production HTTP client exists separately and will be activated when authenticated Worker runtime composition is deployed.

## Gate

The final A5 branch state passed:

- migration validation
- PWA boundary validation
- TypeScript typecheck
- unit tests
- production build

## A6 handoff

P2-A6 must keep actual visits separate from plan records. A completed/unplanned visit may reference a plan entry, and product-call counters belong to actual visit/report data rather than to the plan row itself.

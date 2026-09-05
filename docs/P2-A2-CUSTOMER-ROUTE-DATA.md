# FieldRep OS — P2-A2 Customer / Route Data Layer

**Phase:** P2 — Excel Parity / Core Field User Panel  
**Work item:** P2-A2  
**Status:** COMPLETE

## Goal

Replace the workbook's physician/route helper-table assumptions with explicit workspace-scoped customer and route data contracts, storage, repositories, and secured API endpoints.

## Domain contracts

The domain now supports:

- doctors
- pharmacies
- hospitals
- clinics
- laboratories
- other customer types
- workspace-owned master records
- user-private records
- primary and secondary routes
- doctor specialty/class/frequency profile
- multiple locations per customer

The P2 UI may focus first on doctors, but the storage/API boundary no longer requires a future redesign to add pharmacies or multi-location customers.

## Workspace migration

`migrations/workspace/0002_customers_routes.sql` adds:

```text
routes
customers
customer_doctor_profiles
customer_route_assignments
customer_locations
```

Important constraints include:

- every row is tied to the physical workspace identity
- user-private customers require an owner user
- workspace-master customers cannot carry a private owner
- doctor profiles can only belong to doctor customers
- one primary route per customer
- one active primary location per customer
- latitude/longitude ranges are validated
- route/customer/location workspace relationships fail closed

The migration validator executes both workspace migrations on fresh SQLite and tests these constraints.

## Repository layer

`WorkspaceCustomerReadRepository` provides:

- `listRoutes()`
- `listCustomers(viewerUserId, filters)`
- `getCustomer(viewerUserId, customerId)`

Visibility rule:

```text
workspace master records
+
private records owned by the authenticated user
```

The repository never returns another user's private customer through its normal read methods.

Filters currently support:

- search
- route
- class
- specialty

Values are bound parameters. Search wildcard characters are escaped before use in `LIKE`.

## Workspace data router extension

`WorkspaceDataStore` now exposes bound query methods only after `WorkspaceDataRouter` has verified the physical database `workspace_identity`.

This preserves the architecture rule:

> business repositories do not directly choose or trust a physical workspace binding.

## API module

A secured dependency-injected API module now implements:

```text
GET /workspaces/:workspaceId/routes
GET /workspaces/:workspaceId/customers
GET /workspaces/:workspaceId/customers/:customerId
```

The module requires `customers.read.assigned` and uses the existing fail-closed workspace authorization middleware.

Tests cover:

- unauthenticated request -> 401
- missing permission -> 403
- cross-workspace request -> 403 before repository resolution
- route listing
- sanitized filters
- authenticated user propagation
- visible customer detail
- hidden/nonexistent customer -> non-enumerating 404

The route module is intentionally dependency-injected. Remote Cloudflare binding/wiring is not claimed until the isolated Worker/D1 environment is provisioned.

## CI gate

P2-A2 passed:

- frozen dependency install
- SQL migration validation
- PWA security/installability validation
- TypeScript typecheck
- unit tests
- production build

## Exit decision

P2-A2 is complete. P2-A3 can now implement the Jalali planning-cycle/quarter engine on top of stable customer, route, frequency and canonical-date contracts.

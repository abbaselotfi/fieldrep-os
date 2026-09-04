# ADR-0002 — Workspace Data Isolation and Routing

**Status:** Accepted; P1 fixed-binding D1 router implemented  
**Date:** 2026-09-05

## Context

A company may contain independent business units such as Diabetes, Cardiology, and Neurology. These workspaces may require physically separate databases, while the same doctor may appear in several workspaces.

A single shared operational database with only `tenant_id` filters does not satisfy the desired isolation/flexibility model as the sole architecture.

At the same time, business logic must not depend on fixed D1 binding names or a particular database technology.

## Decision

Treat `Workspace` as the primary operational isolation boundary and require all workspace repositories/services to access data through a `WorkspaceDataRouter` abstraction.

Conceptually:

```ts
interface WorkspaceDataRouter {
  get(workspaceId: string): Promise<WorkspaceDataStore>;
}
```

Control-plane metadata maps each workspace to a physical store.

Operational data for different workspaces may therefore live in different databases.

Canonical practitioner identity and dataset catalog remain logically separate from workspace operational state.

## P1 implementation

P1 uses a deliberately small, auditable D1 binding registry:

```text
CONTROL_DB.workspace_data_routes
        ↓ store_identifier
Worker deployment binding registry
        ↓
physical D1 workspace database
        ↓ verify workspace_identity
WorkspaceDataStore
```

The control-plane route stores a logical `store_identifier`; it does not store Cloudflare API credentials. Deployment configuration supplies the actual D1 bindings.

Before returning a store, the router must verify:

1. the route exists and is active;
2. the configured store type is supported;
3. the named deployment binding exists;
4. the physical database has a `workspace_identity` row;
5. the database identity equals the requested workspace;
6. the database schema version is at least the route's required version.

This prevents a configuration mistake from silently sending Workspace A traffic to Workspace B's database.

This fixed-binding implementation is intentionally a P1/P2 topology, not a commitment to an unlimited static binding list.

## Production Routing Options

The architecture permits later implementation through one of the following without changing domain services:

```text
per-workspace Worker/service with dedicated D1 binding
Workers for Platforms/dispatch with per-tenant resources
secure data-proxy layer
alternative SQL backend through the same repository contract
```

## Invariants

- Every operational record resolves to exactly one workspace.
- Cross-workspace access is denied by default.
- No business service refers directly to a tenant-specific binding name.
- No cross-database foreign key is required for global user/practitioner identifiers.
- Shared practitioner identity never exposes another workspace's plans/visits/reports/classifications.
- A physical workspace database must self-identify before it is accepted by the router.

## Consequences

Positive:

- Strong isolation option per business unit.
- Easier company/workspace data lifecycle and migration.
- Can move selected workspaces to different storage technologies later.
- Reduced blast radius compared with one giant operational database.
- Mis-bound databases fail closed instead of exposing another workspace.

Tradeoffs:

- Cross-workspace aggregate reporting requires controlled application-layer aggregation/projections.
- Database provisioning/migrations become platform capabilities.
- Large-scale dynamic D1 routing still requires a deliberate Cloudflare topology rather than an ever-growing static binding list.

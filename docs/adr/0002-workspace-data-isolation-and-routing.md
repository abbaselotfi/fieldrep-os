# ADR-0002 — Workspace Data Isolation and Routing

**Status:** Accepted architecture boundary; production routing implementation deferred  
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

## Production Routing Options

The architecture permits implementation through one of the following without changing domain services:

```text
per-workspace Worker/service with dedicated D1 binding
Workers for Platforms/dispatch with per-tenant resources
secure data-proxy layer
alternative SQL backend through the same repository contract
```

The first P1/P2 environment may use a small fixed number of workspace stores for development and validation.

## Invariants

- Every operational record resolves to exactly one workspace.
- Cross-workspace access is denied by default.
- No business service refers directly to a tenant-specific binding name.
- No cross-database foreign key is required for global user/practitioner identifiers.
- Shared practitioner identity never exposes another workspace's plans/visits/reports/classifications.

## Consequences

Positive:

- Strong isolation option per business unit.
- Easier company/workspace data lifecycle and migration.
- Can move selected workspaces to different storage technologies later.
- Reduced blast radius compared with one giant operational database.

Tradeoffs:

- Cross-workspace aggregate reporting requires controlled application-layer aggregation/projections.
- Database provisioning/migrations become platform capabilities.
- Large-scale dynamic D1 routing requires a deliberate Cloudflare topology rather than an ever-growing static binding list.

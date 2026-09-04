# ADR-0001 — Monorepo and Initial Application Stack

**Status:** Accepted for P1 baseline  
**Date:** 2026-09-05

## Context

FieldRep OS will contain a Field User PWA, later supervisor/company/platform surfaces, a Cloudflare backend, and shared domain engines. Splitting these into unrelated repositories would duplicate types, permissions, UI primitives, and release coordination.

The first implementation must remain simple enough to move quickly while preserving strong module boundaries.

## Decision

Use a TypeScript monorepo with `pnpm workspaces`.

Initial stack:

```text
Frontend: React + TypeScript + Vite + React Router + Tailwind CSS
Backend: Cloudflare Workers + Hono + TypeScript
Validation: Zod at trust boundaries
Offline: IndexedDB; Dexie is the initial candidate abstraction
Relational data: D1 initially where appropriate behind repositories/router
Object storage: R2
Testing: Vitest + Playwright
```

Initial repository shape:

```text
apps/web
apps/worker
packages/domain
packages/auth
packages/permissions
packages/database
packages/planner-engine
packages/reporting-engine
packages/calendar-engine
packages/maps
packages/sync
packages/recommendations
packages/ui
packages/shared
```

Do not add a heavy monorepo orchestration framework until task/build complexity demonstrates a need.

## Consequences

Positive:

- One language/type system across frontend/backend/domain.
- Shared schemas/types/permissions without copy-paste.
- Easier atomic changes across API/UI.
- Strong fit for PWA + Cloudflare deployment.

Tradeoffs:

- Module boundaries must be enforced by convention/tests/linting rather than repository separation.
- Large future admin surfaces require route-level lazy loading and package discipline.

## Guardrails

- Domain packages must not import React/Hono/D1/provider SDKs.
- Infrastructure adapters implement domain/application interfaces.
- UI is not the authorization boundary.
- One global state store must not own server state + offline domain state + UI state simultaneously.

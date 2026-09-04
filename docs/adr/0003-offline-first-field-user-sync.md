# ADR-0003 — Offline-First Field User Synchronization

**Status:** Accepted architecture boundary  
**Date:** 2026-09-05

## Context

Field users may work with unreliable connectivity. The application must remain trustworthy when reports/plans are created offline, and retries must not create duplicate visits.

A browser cache alone is not sufficient because business mutations require domain-aware synchronization, user/workspace isolation, idempotency, and conflict handling.

## Decision

Use structured IndexedDB-backed local domain storage for the Field User PWA and a dedicated synchronization layer.

Every offline mutation receives a stable `operationId` and is processed idempotently by the server.

Conceptual flow:

```text
local domain mutation
→ IndexedDB commit
→ enqueue sync operation
→ show locally-saved state
→ push when connected
→ server auth + validation + idempotency
→ apply/conflict/reject
→ reconcile local state
```

Service Worker owns application-shell/static caching and supported background hooks, but core sync logic must also run while the application is open.

## Conflict Policy

Do not use blind last-write-wins for all domains.

Examples:

- Duplicate create retry: idempotent apply.
- Concurrent plan move: explicit conflict.
- Derived totals: server recomputes from authoritative visits.
- Permission revoked while offline: server rejects stale unauthorized mutation.

## Security

Local data is partitioned by user/workspace and must not be readable by the next user after logout/session switch.

## Consequences

Positive:

- Reliable field workflow in poor connectivity.
- Clear local-save/sync state.
- Duplicate visit prevention.
- Stronger auditability of capture vs server receipt time.

Tradeoffs:

- Requires local schema migrations.
- Requires conflict UX and sync tests.
- PWA update lifecycle must preserve pending mutations.

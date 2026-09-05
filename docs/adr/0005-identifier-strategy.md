# ADR-0005 — Identifier Strategy

**Status:** Accepted  
**Date:** 2026-09-05

## Context

FieldRep OS will create entities in multiple physical workspace databases and later create records offline in the PWA before server synchronization.

Sequential integer IDs create avoidable coupling to one database and require temporary-ID remapping for offline creation.

## Decision

Use **UUID v4** opaque string identifiers for FieldRep OS durable domain entities unless an external system requires a separate natural/source key.

Generate IDs with platform-native cryptographically secure APIs:

```ts
crypto.randomUUID()
```

This is available in modern browsers and Cloudflare Workers.

## Rules

- IDs are opaque; business logic must not parse meaning from them.
- Do not expose sequential row IDs as cross-service identity.
- Preserve source/vendor IDs in separate provenance fields.
- Medical license/council numbers are natural identity attributes, not primary database keys.
- Offline-created entities may generate their UUID before synchronization.
- Sync operations have their own UUID `operationId` for idempotency.

## Why UUID v4 Instead of ULID

UUID v4 is chosen initially because:

- Native generation requires no dependency.
- Supported in both target runtimes.
- No timestamp-ordering behavior is required by the domain.
- Avoids exposing creation-time information through IDs.

If future storage/index benchmarks justify UUIDv7/ULID, that is a migration/performance decision rather than an initial domain requirement.

## Consequences

Positive:

- Simple offline creation.
- No cross-database collision coordination.
- No ID remapping after sync.
- Provider/runtime independent.

Tradeoffs:

- Random identifiers are not naturally sortable.
- Database indexes may be less locality-friendly than time-ordered IDs at very large scale.

The tradeoff is acceptable for the initial architecture.

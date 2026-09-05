# FieldRep OS — Offline PWA & Synchronization Specification

**Phase:** P0-A5  
**Implementation focus:** P4, with P1/P2 foundations

---

## 1. Purpose

Field users may work with unreliable connectivity. FieldRep OS must support a trustworthy offline workflow without compromising tenant isolation or silently losing data.

Offline behavior is primarily a Field User capability. Supervisor/Admin surfaces may remain mostly online.

---

## 2. Offline Goals

A previously authenticated/authorized Field User should eventually be able to:

```text
open the PWA
view cached authorized customers
view current plan
create/edit plan entries where allowed
record visits/reports
save changes locally
reconnect
synchronize safely
```

The user must always understand whether data is saved locally, synced, pending, conflicted, or failed.

---

## 3. Offline Non-Goals

P4 does not require:

```text
full offline company administration
full offline supervisor reporting
arbitrary offline dataset imports
background tracking while app is closed
silent conflict overwrite
```

---

## 4. Local Storage Boundary

Use IndexedDB for offline domain data; do not use localStorage as the primary domain database.

Local data must be partitioned by trusted user/workspace context.

Conceptual namespace:

```text
user_id + workspace_id + local_store_version
```

No query may accidentally return cached data for another authenticated user/workspace.

---

## 5. Local Data Categories

### Cache/reference data

Examples:

```text
assigned doctors/customers
specialties/classes
routes
products
calendar policy/current events
locations required for current work
```

### Mutable offline data

Examples:

```text
plan edits
visit records
visit reports
activity records
location evidence
```

Cache eviction rules may differ from mutation retention rules.

---

## 6. Sync Operation Envelope

Every offline mutation must have a stable client-generated operation identity.

```ts
export interface SyncOperation {
  operationId: string;
  clientInstanceId: string;
  userId: string;
  workspaceId: string;
  entityType: string;
  entityId: string;
  operationType: 'create' | 'update' | 'delete' | 'transition';
  baseVersion?: string;
  clientOccurredAt: string;
  payload: unknown;
  status: SyncOperationStatus;
  retryCount: number;
}
```

Status:

```text
pending
sending
applied
conflict
failed
superseded
```

---

## 7. Idempotency

Server APIs receiving offline mutations must recognize duplicate `operationId` and return the prior result rather than create duplicate business records.

Critical example:

```text
Visit save request succeeds on server
network response is lost
client retries
server must not create a second visit
```

---

## 8. Entity Identifiers

Where suitable, the client may create globally unique entity IDs before synchronization.

This reduces temporary-ID remapping and makes idempotent offline creation easier.

Exact UUID/ULID format is an ADR decision.

---

## 9. Server Version / Conflict Detection

Mutable records that can be edited from multiple clients should expose a version token or equivalent concurrency field.

Conceptual:

```text
version
updated_at
etag/revision
```

Offline update can include:

```text
baseVersion = version originally edited
```

Server detects stale edits rather than blindly overwriting newer state.

---

## 10. Conflict Categories

Not every conflict needs the same behavior.

### Safe merge / server derivation

Examples:

```text
locally created separate visit records
read-only reference refresh
```

### User-resolvable conflict

Examples:

```text
same plan entry moved on another device
report text edited on two devices
```

### Policy conflict

Examples:

```text
plan created offline for date that later became blocked
customer removed from user's authorization before sync
```

### Authorization conflict

If permission/membership changed while offline, server authorization wins.

The client must not force synchronization based on stale permissions.

---

## 11. Conflict Contract

```ts
export interface SyncConflict {
  operationId: string;
  entityType: string;
  entityId: string;
  code: string;
  localPayload?: unknown;
  serverState?: unknown;
  resolutionOptions: Array<'keep_server' | 'retry_with_update' | 'manual_merge' | 'discard_local'>;
}
```

Not all options are valid for every domain.

---

## 12. Recommended Domain Conflict Policy

### Visits

Once a completed visit is successfully created, duplicate create retries are idempotent.

Editing an existing completed visit later may require version checking/history.

### Plan entries

Moving/rescheduling the same entry concurrently should create a conflict rather than silently last-write-win.

### Derived totals

Visited/Achievement are recalculated server-side from authoritative records; never conflict-merge local totals.

### Reference data

Server/latest authorized version generally wins, unless local mutation is an explicit workspace/user-created record.

---

## 13. Sync Pipeline

Recommended logical flow:

```text
local mutation
→ write domain state locally
→ enqueue SyncOperation
→ UI shows locally saved
→ network available
→ send operation
→ server auth + validation + idempotency
→ apply or return conflict
→ update local canonical state
→ mark operation applied/conflict
```

The UI should not wait for network before confirming that an offline-capable form was saved locally.

---

## 14. Pull Synchronization

Client also needs server changes.

Conceptual API:

```ts
interface SyncPullRequest {
  workspaceId: string;
  cursor?: string;
  datasets: string[];
}

interface SyncPullResponse {
  changes: SyncChange[];
  nextCursor: string;
  serverTime: string;
}
```

Exact implementation may use per-domain endpoints rather than one universal feed, but cursor/checkpoint semantics must be explicit.

---

## 15. Authorization During Sync

Every push/pull is authorized using the current server session/membership/permissions.

Never trust cached client authorization as sufficient.

If access was revoked:

```text
server denies
client marks affected sync operations for attention
local cache is pruned/locked according to policy
```

---

## 16. Logout Behavior

On explicit logout:

- Clear or cryptographically/inaccessibly isolate sensitive cached business data according to implementation policy.
- Remove active session tokens.
- Ensure next user cannot browse previous user's local records.
- Pending unsynced work requires a deliberate product rule before logout completes.

Recommended UX when unsynced mutations exist:

```text
3 changes have not synced yet.
[Sync now] [Keep safely on this device and log out if supported] [Cancel]
```

Do not silently discard pending work.

---

## 17. Session Expiry While Offline

Offline read/use may continue only according to a defined local authorization window/policy.

When connectivity returns, server session state is authoritative.

P0 does not freeze the exact offline session duration; it must be an explicit security ADR.

---

## 18. Service Worker Responsibilities

Service Worker should primarily handle:

```text
application shell/static asset caching
safe GET cache strategies where appropriate
PWA lifecycle/update
optional background sync hooks where supported
```

Do not place all business synchronization logic only in Service Worker because browser support/lifecycle differs.

Core sync engine should also run reliably while the app is open.

---

## 19. Cache Strategy

Suggested categories:

### Static assets

Versioned/cache-first after deployment integrity.

### User/customer reference data

Local IndexedDB + network refresh strategy.

### Sensitive dynamic API responses

Avoid generic service-worker HTTP caching unless explicitly designed; prefer structured local domain storage.

### Maps

Do not assume map tiles/provider content can be cached offline unless provider terms/SDK support it.

---

## 20. Offline UI States

Required user-visible states:

```text
Synced
Syncing
Offline — saved on device
N changes pending
Conflict — action required
Sync failed — retrying/needs attention
```

A saved visit must never visually appear lost merely because it has not reached the server.

---

## 21. Update Safety

PWA application updates must not destroy unsynced IndexedDB mutations.

Local schema migrations need their own versioned strategy.

Before a breaking local schema change:

```text
migrate pending operations
or block activation until safe
```

Never use `clear all IndexedDB` as a routine upgrade technique.

---

## 22. Offline Maps / Location Evidence

Visit-location capture can be stored offline as structured evidence.

Example:

```text
captured coordinates
accuracy
captured_at
capture_mode = offline
```

Server later evaluates/stores receipt time on sync.

Route/search/geocode features may be unavailable offline unless previously cached/provider-supported; the UI must degrade clearly.

---

## 23. Clock Trust

Client timestamp is useful but not fully trusted.

For offline records keep both:

```text
client_occurred_at / captured_at
server_received_at
```

Server can apply sanity checks and audit suspicious/time-inconsistent values later.

---

## 24. Sync Service Interface

```ts
interface OfflineSyncService {
  enqueue(op: SyncOperation): Promise<void>;
  pushPending(): Promise<SyncPushSummary>;
  pullChanges(): Promise<SyncPullSummary>;
  listConflicts(): Promise<SyncConflict[]>;
  resolveConflict(input: ResolveConflictInput): Promise<void>;
  getStatus(): Promise<SyncStatus>;
}
```

UI components consume sync status/events; they do not directly implement transport/idempotency logic.

---

## 25. Test Scenarios Required in P4

At minimum:

1. Create plan offline -> reconnect -> one server plan entry.
2. Record visit offline -> retry after lost response -> one server visit.
3. Edit same plan on two clients -> conflict detected.
4. Logout user A -> user B cannot access A cache.
5. Permission revoked while A offline -> server rejects later unauthorized push.
6. PWA update with pending operations -> pending work survives.
7. Location evidence captured offline -> original capture time preserved after sync.
8. Derived achievement reconciles with server authoritative visits after sync.

---

## 26. P0-A5 Acceptance Criteria — Offline

1. Offline mutations have globally stable operation identity.
2. Duplicate network retries are idempotent.
3. Workspace/user local data isolation is explicit.
4. Server authorization always wins during sync.
5. Conflicts are modeled, not hidden by blind last-write-wins.
6. PWA updates cannot casually erase pending work.
7. Visit/report creation can remain trustworthy during poor connectivity.
8. Sync business logic is not dependent exclusively on Service Worker lifecycle.

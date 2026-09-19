# FieldRep OS — Release & Operations Runbook

Phase: **P12-A4**. Companion documents: `PERFORMANCE-BUDGETS.md`,
`SECURITY-THREAT-MODEL.md` (§9 auth/MFA, §28 abuse, §29 lifecycle/retention),
`TENANCY-MODEL.md`, `DATA-MODEL.md`.

This runbook is the operational procedure for cutting, verifying and (if
necessary) rolling back a release, plus the recovery drills that keep the
backup/DR claims honest. It is evidence-driven: every step names the artefact
it produces.

## 1. Release gates (all must pass, in order)

| Step | Command | Evidence |
|---|---|---|
| 1 | `pnpm validate:migrations` | `control: 9` + `workspace: 10` migrations validated, `foreign_key_check` + `integrity_check` clean |
| 2 | `pnpm typecheck` | 7 package/project typechecks clean |
| 3 | `pnpm test` | full vitest suite green (no `.only`/`.skip`) |
| 4 | `pnpm build` | web + worker bundles build; worker upload dry-run reports no unintended bindings |
| 5 | `pnpm validate:release` | fail-closed readiness: `READY`, no blockers, no missing evidence |

`pnpm check` runs the whole chain; `validate:release` is the final verdict and
exits non-zero on blockers or missing evidence.

## 2. Pre-release checklist

1. Roadmap reflects reality: no P11/P12 step `PENDING`; the header records the
   current phase and work item.
2. Migrations are additive and ordered (`control/00NN_*.sql`); nothing edits an
   applied migration.
3. Security posture unchanged or improved: rate-limit budgets, privileged-MFA
   permission set (`PRIVILEGED_MFA_PERMISSIONS`), hardened headers and the
   observability event taxonomy are intact.
4. Recovery evidence is fresh: the latest `backup_drills` row for every scope is
   `passed` **with RPO and RTO recorded** and within the 90-day freshness
   window (`isRecoverabilityProven`).
5. Retention policy per company is deliberate (`company_retention_policies`,
   ≥ 30 days); no company is silently on a default nobody reviewed.
6. No legal hold is left forgotten: `lifecycle_events` replay shows the expected
   subject state per company.

## 3. Deployment procedure

1. Apply control-plane migrations first, then workspace migrations — the
   validator's ordering is authoritative.
2. Deploy the worker; confirm `GET /api/v1/health` returns `status: ok`.
3. Confirm readiness: `GET /api/v1/health/ready` must not return 503. A
   `degraded` result is a release-time decision, recorded with its reason.
4. Smoke-check one privileged flow end to end (auth → permission → MFA
   step-up) and one dataset export, and confirm an `http.request.completed`
   event with a correlation id was emitted for each.
5. Record the release: version, commit SHA, gate results, operator, timestamp.

## 4. Rollback procedure

1. Roll back the worker deployment first (stateless) — the API surface is
   versioned under `/api/v1`.
2. Database changes are additive by policy; do **not** drop tables or columns
   during an incident. Disable the affecting feature/permission instead.
3. If data shape is wrong, restore from the most recent verified backup
   reference (§5) into a separate database, verify, then swap routes.
4. After rollback: record the incident, the root cause, and add the missing
   regression test that would have caught it.

## 5. Backup / restore / DR drills

A drill is only evidence when it is closed with measurements.

1. Start: `POST /platform/backup-drills` with `scope`
   (`control_plane` | `workspace`), a target (`targetId` for workspace scope)
   and the concrete `backupReference` being proven.
2. Restore into an isolated environment from that exact reference.
3. Verify row counts and spot-check tenant isolation (workspace A data must not
   be visible from workspace B).
4. Complete: `POST /platform/backup-drills/:drillId/complete` with
   `result: "passed"` **and both `rpoMinutes` and `rtoMinutes`**. A `passed`
   drill without metrics is refused (`metrics_required`); a failed drill closes
   with a note instead.
5. `GET /platform/backup-drills` exposes `recoverabilityProven`; a stale
   (> 90 days) or failed latest drill means recoverability is *unproven*.

Target cadence: control plane monthly, each active workspace quarterly, and
before any migration that touches tenant data at scale.

## 6. Data lifecycle procedures (SECURITY-THREAT-MODEL §29)

Never hard-delete. The order is always:

1. **Suspend** (`suspend`) — reversible; the tenant keeps its data.
2. **Archive** (`archive`) — starts the retention countdown.
3. **Wait** for retention to expire (`company_retention_policies`).
4. **Request purge** (`request_purge`) — refused while a legal hold is active
   (`legal_hold_blocked`) or while retention is running
   (`retention_not_expired`).
5. **Complete purge** (`complete_purge`) — terminal; the ledger row stays.

Legal hold (`place_legal_hold`) may be placed at any point and blocks every
destructive step; `release_legal_hold` re-enables the normal path. The company
subject state is always the *replay* of `lifecycle_events` — never a cached
status column.

## 7. Incident severities and first actions

| Severity | Example | First action |
|---|---|---|
| SEV-1 | Cross-tenant data exposure, auth bypass | Disable the affected permission/route, force session revocation, start incident log, retain evidence for the security review |
| SEV-2 | Privileged action without MFA, exporter abuse | Block the actor (abuse escalation), revoke assignments, verify audit-trail completeness |
| SEV-3 | Latency/SLO breach, degraded readiness | Consult `PERFORMANCE-BUDGETS.md`, confirm budgets are enforced (clamping) and whether a surface needs a tighter ceiling |
| SEV-4 | Cosmetic/UX defect | Normal backlog |

For every severity the diagnosis starts from the correlation id
(`x-request-id`) and the structured events, which carry scope (user/company/
workspace) but never secrets — metadata sanitization redacts sensitive keys.

## 8. Post-release verification (first 24 hours)

1. `http.request.completed` error rate within the SLO budget.
2. No `rate.limited` spikes beyond the expected baseline.
3. No `auth.denied` / `permission.denied` anomalies.
4. Readiness stayed non-503; any `degraded` interval has a recorded reason.
5. Export ledger (`dataset_exports`) shows only expected, licensed exports.
# FieldRep OS — Performance Budgets & Load Profiles

Phase: **P12-A4** (production hardening & scale). Companion documents:
`SECURITY-THREAT-MODEL.md` §28 (abuse/quotas), `RELEASE-RUNBOOK.md`.

## 1. Why budgets are enforced in code

Every ceiling in this document is a *domain guard*
(`packages/domain/src/workload-budget.ts`), not a frontend convention. A caller
cannot widen a window by asking for more: an oversized request is **clamped to
the surface budget**, and a garbage value degrades to the default window rather
than to "everything". Bounded work per request is therefore a property of the
API layer, verified by tests, not a hope.

## 2. Workload budgets per surface

| Surface | `maxPageSize` | `maxBatchSize` | `maxExportRecords` |
|---|---|---|---|
| `audit` (interactive reads) | 200 | 200 | 5 000 |
| `export` | 200 | 1 000 | 50 000 |
| `import` | 200 | 1 000 | 50 000 |
| `sync` (device batches) | 500 | 2 000 | 50 000 |

Defaults (`DEFAULT_WORKLOAD_BUDGET`): page 200, batch 1 000, export 50 000.
`normalizeWorkloadBudget` rejects non-positive/non-finite values back to the
baseline, so a misconfigured budget can never disable the ceiling.

## 3. Page-window rules (`resolvePageWindow`)

1. Absent `page`/`pageSize` → defaults (page 1, page size 50, or the surface
   ceiling when it is smaller). Not reported as clamped.
2. Present-but-invalid (`NaN`, `0`, negative, fractional → floored) → degraded
   to the default window **and reported as `clamped: true`**.
3. `pageSize` above the surface ceiling → clamped to the ceiling,
   `clamped: true`.
4. `page` above `MAX_PAGE_INDEX` (10 000) → clamped, so a deep offset cannot be
   used to force an unbounded scan.
5. `offset = (page - 1) × pageSize` — the API returns the resolved window
   alongside the data so clients never guess.

Applied surfaces today: workspace audit reads and the audit summary projection
(`audit-admin-api.ts`).

## 4. Service-level objectives (`DEFAULT_SLO_BUDGET`)

| Metric | Budget |
|---|---|
| p50 latency | 300 ms |
| p95 latency | 1 200 ms |
| p99 latency | 3 000 ms |
| error rate | 1 % |

`evaluateSlo` returns the observed percentiles plus deterministic breach labels
(`p50_latency`, `p95_latency`, `p99_latency`, `error_rate`, `no_samples`). An
empty sample set is a breach — never a pass.

## 5. Load profiles (`DEFAULT_LOAD_PROFILE`)

| Field | Baseline |
|---|---|
| `requestsPerSecond` | 20 |
| `durationSeconds` | 30 |
| `concurrency` | 4 |

`evaluateLoadRun(profile, samples)` combines the SLO evaluation with **sample
coverage**: fewer than 90 % of the expected samples is itself a breach
(`insufficient_samples`), because a run that barely ran proves nothing.

## 6. How to run the evidence

```bash
pnpm typecheck            # 7 packages
pnpm validate:migrations   # control 9 + workspace 10
pnpm test                  # full vitest suite
pnpm build                 # web + worker bundles
pnpm validate:release      # fail-closed release-readiness checklist
```

`pnpm validate:release` is part of `pnpm check`. It re-runs the migration
validator, refuses focused/skipped tests (`.only`/`.skip` would silently shrink
the suite), asserts the roadmap has no pending P11/P12 step, and requires the
runbook/threat-model/data-model evidence files. Missing evidence blocks the
release rather than passing quietly.

## 7. Regression expectations

* Any new list/batch surface must take its ceiling from `WORKLOAD_BUDGETS`
  (add a surface if needed) and return the resolved `page` window.
* Any new endpoint that reads tenant data should be covered by an
  observability event (`http.request.completed`) and the latency budget applies
  to it automatically.
* Timing-based tests are avoided. Bounded-work regressions assert *what the
  gateway receives* (limits/offsets) instead of wall-clock durations, so the
  suite stays deterministic in CI.
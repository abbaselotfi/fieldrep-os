# FieldRep OS — Competitive Best-Practice Analysis

**Phase:** P3 closure / standing reference  
**Scope:** Veeva Vault CRM, IQVIA OCE (Orchestrated Customer Engagement), Sanofi "Concierge for Field"  
**Rule of engagement:** FieldRep OS adopts behavioral patterns and product principles only. No competitor UI is copied, no vendor data model is imported, and every adoption must fit the existing tenancy/isolation model, the advisory-AI boundary (`AI-PLANNER-SPEC.md`) and the provider-independence rule (`ARCHITECTURE.md` §26).

---

## 1. Sources and confidence

| Product | Source basis | Confidence |
| --- | --- | --- |
| Veeva Vault CRM | Official Veeva Vault CRM Suite product materials (2026), including the Agentic Engagement Platform positioning, Commercial Evidence™, Agentic Call Report and AI-powered media search; long-standing public Veeva CRM feature corpus (My Schedule, calls, CLM, Approved Email, samples, events, territory/consent management). | High — public vendor materials |
| IQVIA OCE | Established public module structure of the OCE suite (OCE Sales, OCE Planner, OCE Connect, OCE Content, OCE Email, OCE Events, admin/IA capabilities) as commonly documented across life-sciences industry literature. | Medium — module map public, exact feature details vary by release |
| Sanofi "Concierge for Field" | Internal Sanofi application; public documentation is limited. Analysis is based on the publicly observable product pattern (a unified field-facing concierge/assistance layer over enterprise systems) and must be validated with the product owner before the P7/P8 backlog items are finalized. | Low-medium — internal app; patterns marked "validate" |

Where public detail is thin, this document extracts the **pattern** rather than claiming specific implementation facts.

---

## 2. What each product is best at

### 2.1 Veeva Vault CRM — engagement + compliance depth

Strengths relevant to a field representative replacing a Plan & Report workbook:

```text
My Schedule / day-first call planning
Structured call capture (objectives, next steps, channel)
CLM / closed-loop content presentation tracking
Approved Email / compliant multi-channel follow-up
Sample & inventory accountability
Events management (speaker programs, booths)
Territory alignment + rostering
Consent/privacy capture on the HCP profile
My Insights (embedded, in-context KPIs)
Agentic Call Report (AI-drafted call report, human-edited)
Commercial Evidence (interaction data → insight)
Signals/highlights on the account timeline
```

Principles worth adopting: the day-first execution surface; every interaction recorded against the correct customer with an explicit channel; compliance-critical actions (samples, consent) carry their own evidence; AI drafts, humans approve.

### 2.2 IQVIA OCE — planning discipline + orchestration

Strengths relevant to FieldRep OS:

```text
OCE Planner: cycle plans vs actuals, coverage/frequency metrics
OCE Sales: configurable call capture, suggested targets
OCE Connect: remote engagement with content follow-up
OCE Content: per-asset lifecycle + effectiveness analytics
OCE Email: tracked, approved communications
OCE Events: structured event management
Channel orchestration: journeys/sequences across channels
Strong offline-first sync engine with checkpoints
Admin configurability of capture layouts and rules
```

Principles worth adopting: plan-vs-actual discipline as a first-class metric pair; explicit sync queue/checkpoints with idempotent operations; suggested targets are advisory and user-accepted; capture layouts are workspace policy, not hard-coded UI.

### 2.3 Sanofi Concierge for Field — field-user support layer

Publicly observable pattern (to validate with the product owner):

```text
One-stop assistance surface for field users
Fast answers to policy/process/IT questions
Service requests/tickets with routing and status
Personalized notifications and daily briefing
Reduction of app fatigue: one entry point over many systems
```

Principles worth adopting: the field user's daily entry point should answer "what do I do today and what is blocking me" before showing analytics; help/support must live inside the work tool, not a separate portal; a daily briefing (today/next/blocked) matches FieldRep OS's Home execution dashboard.

---

## 3. Feature-by-feature mapping to FieldRep OS

| # | Best practice (source) | FieldRep OS decision | Where it lives |
| --- | --- | --- | --- |
| 1 | Day-first schedule (Veeva My Schedule) | Calendar is an execution surface; Home answers "what next"; month/week/day/agenda views shipped in P3 | P3 (done) — `CalendarPage`, `working-calendar.ts` |
| 2 | Non-visit work never mutates visit KPIs (OCE) | `countsAsVisit=false` enforced per category in domain policy and at the schema level | P3 (done) — `CALENDAR_ACTIVITY_POLICIES`, migration 0007 |
| 3 | Working calendar + closures + leave/trip blocking (OCE/Veeva territory reality) | Layered `resolveWorkingDayContext` with versionable policy; working weekdays configurable per workspace | P3 (done) |
| 4 | Plan conflicts return reasons, never silent edits (OCE) | Conflict engine with info/warning/block + planner hard error `day_not_plannable` | P3 (done) |
| 5 | Suggested targets are advisory (OCE suggested targets) | Recommendation batches stay separate from plan entries until accepted | P7 (spec exists) |
| 6 | Explainable AI + human-approved AI drafts (Veeva Agentic Call Report) | Deterministic scoring mandatory; optional LLM drafting of visit reports/suggestions as an **editable suggestion layer**; LLM never publishes plan/report records | P7 — extends `AI-PLANNER-SPEC` |
| 7 | In-context KPIs (Veeva My Insights) | Home/dashboard cards use small, permission-scoped summaries; heavy analytics stays in Reports/Supervisor | P3 Home (partially done), P8 |
| 8 | Sync queue with checkpoints + idempotency (OCE) | `sync_operations`/`sync_checkpoints` entities already in the data model; implement with explicit retry/conflict states | P4 |
| 9 | Check-in verification states (Veeva) | `verified / nearby / unverified / outside` evaluation with geofence + evidence, company toggle | P6 |
| 10 | Coverage/frequency dashboards (OCE Planner) | Supervisor drill-down over plans/visits/activities with permission-scoped exports | P8 |
| 11 | Workspace-configurable capture (OCE admin) | Visit report fields and calendar policies become workspace settings, not code | P9 |
| 12 | One-stop field assistance + daily briefing (Sanofi Concierge — validate) | "Today briefing" card on Home; Help/AI workspace assistant restricted to authorized, minimal context with structured answers only | P7/P8 backlog item |
| 13 | Approved/compliant outbound content (Veeva/OCE) | Out of scope for the Field User MVP; revisit as a workspace-admin governed module after P9 | Deferred (P11+) |
| 14 | Sample/inventory accountability (Veeva) | Deferred: requires master product/lot model and a compliance workflow; record the need now, do not half-implement | Deferred (P11+) |
| 15 | Remote engagement/content tracking (OCE Connect/CLM) | Deferred: depends on P5 maps + P9 content governance | Deferred (P11+) |

---

## 4. Decisions applied in P3

The following competitor-informed behaviors were implemented in this phase:

1. **Execution-first calendar.** The calendar page leads with today/selected-day status and planning permission ("آماده برنامه‌ریزی / غیرقابل برنامه‌ریزی" plus reasons) instead of a generic month grid with event text — the Veeva My-Schedule principle adapted to Jalali/RTL.
2. **KPI firewall.** OCE's separation of activities from visit counting became a hard invariant: domain policy table, schema checks, and a dedicated policy test (`calendar-activity.test.ts`).
3. **Reason-based conflict engine.** Conflicts are structured (`code/severity/messageKey/sourceItemId`) so the UI and the future AI layer consume the same machine-readable reasons — no free-text-only warnings.
4. **Policy, not code.** Working weekdays, closure levels, leave types and conflict severities are data/policy artifacts that P9 administration will expose without engine changes.
5. **Self-service with boundaries.** Field users create/cancel their own leave and trips through permission-scoped endpoints (`activities.create.own` / `activities.update.own`), while approval stays a supervisor action — matching both the approval-separation pattern and FieldRep's fail-closed authorization rules.

---

## 5. P4–P12 integration backlog (competitor-informed)

- **P4 Offline:** idempotent operation identity, per-checkpoint resumability, and an explicit "Needs attention/Conflict" sync state in the UI (OCE pattern; matches `OFFLINE-SYNC-SPEC.md`).
- **P6 Verification:** check-in evidence with capture-vs-sync timestamps and four-state evaluation (Veeva pattern; already scoped in the roadmap).
- **P7 AI:** (a) keep the deterministic recommend→accept workflow; (b) add "draft visit report" as an LLM suggestion the user edits/submits (Agentic Call Report pattern, respecting `AI-PLANNER-SPEC.md` §22–24 no-hallucinated-facts rules); (c) add a daily briefing generator ("today, next, blocked, achievements") on Home; (d) add a Concierge-style assistant surface restricted to authorized workspace context with structured answers and escalation to human support — **validate the exact Sanofi Concierge feature set with the product owner before implementation**.
- **P8 Supervisor:** coverage/frequency dashboards, leave approval queue, team activity/program planning (OCE Planner + approval separation).
- **P9 Admin:** calendar policy administration (working weekdays, closures, conflict severity policy, activity category overrides) — OCE configurability pattern.
- **P10 Platform:** entitlements may gate competitor-parity modules (e.g., verification, AI drafting) per workspace — commercial flexibility pattern.
- **P11+ Deferred on purpose:** approved outbound email/content, sample accountability, remote engagement — these require master data, compliance and content governance that earlier phases must establish first.

---

## 6. Non-adoption decisions (and why)

- **Not copying vendor data models** (Vault objects, OCE entities): FieldRep OS keeps its own tenancy-first model (`DATA-MODEL.md`) with shared canonical practitioner identity and per-workspace operational state — closer to FieldRep's multi-workspace reality than a single-org CRM.
- **Not adopting AI-first call summaries as a source of truth:** LLM output stays advisory/editable; facts must come from structured inputs only (`AI-PLANNER-SPEC.md` §24).
- **Not adding channel orchestration/journeys now:** the current product milestone is one field user replacing Excel; orchestration needs content governance and channels that do not exist yet.
- **No import of competitor UI/UX assets:** the approved 2026 dark-first Persian RTL design system (`UI-DESIGN-DIRECTION.md`) governs all screens.

---

## 7. Review cadence

Revisit this document at each phase gate (P4, P6, P7 especially) and whenever the product owner provides internal details for the Sanofi Concierge feature set. Update the mapping table instead of accumulating verbal decisions.

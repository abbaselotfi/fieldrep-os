# FieldRep OS — AI-Assisted Planning Specification

**Phase:** P0-A5  
**Implementation focus:** P7, with data/interface hooks from P0 onward

---

## 1. Purpose

AI-assisted planning helps a Field User decide which customers to visit next and how to construct a future plan.

The system is advisory and explainable.

It must not silently publish official plans or override deterministic business constraints.

---

## 2. Design Principle

The initial planning intelligence is:

```text
rules
+ scoring
+ constraints
+ optional route optimization
+ structured explanations
```

A language model may later:

- Explain recommendations in natural language
- Answer questions about the recommendation set
- Summarize tradeoffs
- Help the user edit goals/preferences

The LLM is not the sole source of scheduling decisions.

---

## 3. Primary User Actions

Potential entry points:

```text
Suggest tomorrow
Suggest next working day
Suggest next week
Fill remaining cycle gaps
Optimize today's remaining plan
```

The generated plan remains `suggested` until the user accepts items.

---

## 4. Recommendation Inputs

The engine may use authorized inputs such as:

### Customer priority

```text
class
frequency requirement
completed frequency
remaining frequency
last completed visit
missed planned visits
workspace/customer priority
```

### Cycle context

```text
cycle start/end
working days remaining
target progress
frequency urgency
```

### Calendar constraints

```text
public/company holidays
workspace closures
approved leave
business trips
blocking meetings
company programs
doctor programs
available work windows
```

### Geographic context

```text
route
city
customer location(s)
distance
cluster density
trip destination
```

### Customer availability — future

```text
known office/hospital days
known time windows
```

### Company priorities — later

```text
product/campaign priority
specialty priority
customer segment weight
supervisor/company goals
```

### User history — later and policy-controlled

```text
historical route patterns
accept/reject feedback
common successful visit windows
```

---

## 5. Hard Constraints vs Soft Scores

Hard constraints determine whether an item/date is allowed.

Examples:

```text
user on approved leave
company closed
customer not authorized for user
workspace mismatch
blocking calendar rule
```

Soft scores rank allowed candidates.

Examples:

```text
frequency gap
class priority
cycle urgency
days since last visit
same-route density
distance efficiency
```

Hard constraints cannot be bypassed merely because a model score is high.

---

## 6. Candidate Contract

```ts
export interface RecommendationCandidate {
  workspacePractitionerId: string;
  candidateLocations: string[];
  eligibleDates: string[];
  hardConstraints: ConstraintEvaluation[];
  featureValues: RecommendationFeatures;
}
```

---

## 7. Feature Contract

```ts
export interface RecommendationFeatures {
  classWeight?: number;
  requiredFrequency?: number;
  completedFrequency?: number;
  frequencyGap?: number;
  daysSinceLastVisit?: number;
  cycleDaysRemaining?: number;
  cycleUrgency?: number;
  routeAffinity?: number;
  geographicEfficiency?: number;
  campaignPriority?: number;
  userPreferenceScore?: number;
}
```

Feature names and exact normalization/versioning are owned by the recommendation engine, not UI.

---

## 8. Scoring Model

Initial explainable scoring may resemble:

```text
score =
  frequency_gap_weight
+ class_priority_weight
+ cycle_urgency_weight
+ days_since_visit_weight
+ route_efficiency_weight
+ configured_business_priority
```

Exact coefficients must be versioned and testable.

Do not bury essential logic only inside free-form prompts.

---

## 9. Structured Reasons

Every suggestion has machine-readable reasons.

```ts
export interface SuggestionReason {
  code: string;
  labelKey: string;
  value?: number | string;
  contribution?: number;
  metadata?: Record<string, unknown>;
}
```

Initial reason codes:

```text
frequency_gap
class_priority
cycle_urgency
days_since_last_visit
route_affinity
near_other_planned_visits
trip_destination_match
customer_availability
campaign_priority
```

---

## 10. Example Explanation

```text
Dr X — High priority

Why?
• Class A
• 3 of 6 required visits remain
• 21 working days remain in cycle
• 27 days since last completed visit
• Same route as 4 other high-priority doctors
```

Natural-language explanation should be derived from structured reasons so it can be reproduced and audited.

---

## 11. Recommendation Batch

```ts
export interface RecommendationBatch {
  id: string;
  userId: string;
  workspaceId: string;
  periodStart: string;
  periodEnd: string;
  engineVersion: string;
  policyVersion: string;
  createdAt: string;
  suggestions: VisitSuggestion[];
}
```

---

## 12. Visit Suggestion

```ts
export interface VisitSuggestion {
  id: string;
  workspacePractitionerId: string;
  suggestedDate: string;
  suggestedLocationId?: string;
  suggestedTimeWindow?: TimeWindow;
  score: number;
  priorityBand: 'very_high' | 'high' | 'medium' | 'low';
  reasons: SuggestionReason[];
  status: SuggestionStatus;
}
```

Status:

```text
suggested
accepted
rejected
edited
converted_to_plan
expired
```

---

## 13. Acceptance Workflow

Allowed user actions:

```text
Accept all
Accept day
Accept individual visit
Reject
Edit date
Change location
Reorder
```

Only accepted/converted suggestions become `plan_entries`.

The plan entry should retain provenance:

```text
source = ai_suggestion
source_suggestion_id
```

---

## 14. Calendar-Aware Scheduling

Recommendation Engine consumes `RecommendationCalendarContext` from Calendar services.

It must not independently reinterpret raw leave/meeting records in multiple inconsistent ways.

For each day the engine receives:

```text
planning allowed?
available time windows
destination/city context
blocking constraints
informational context
```

---

## 15. Mission / Business Trip Behavior

If the user has an approved mission to Bojnourd:

```text
normal home-route doctors in Mashhad
```

should generally receive lower/no scheduling eligibility for the trip window, while authorized Bojnourd customers may receive stronger geographic relevance.

Trip context never grants access to customers the user is not authorized to see.

---

## 16. Route Optimization Boundary

Recommendation and routing are separate capabilities.

Recommended flow:

```text
select eligible/high-priority customers
→ assign suggested date
→ optionally optimize geographic sequence
```

Route optimizer may reorder stops but must not invent customer priority semantics.

Recommendation Engine may use route-distance outputs as features.

---

## 17. Daily Capacity

The engine must account for applicable daily target/capacity.

Capacity is not always exactly equal to target.

Future model may distinguish:

```text
target visits
maximum visits
available minutes
meeting/travel reductions
```

Initial P7 can use daily target + calendar windows with documented assumptions.

---

## 18. Frequency Semantics

Frequency must be calculated within the applicable planning cycle/policy.

Example:

```text
required = 6 / quarter
completed = 3
remaining = 3
```

The Recommendation Engine must consume authoritative completed visits, not locally maintained Excel-style aggregate counters.

---

## 19. User Feedback

Capture recommendation outcome:

```text
accepted
rejected
edited
rescheduled after acceptance
completed
missed
```

Optional rejection reasons:

```text
doctor unavailable
wrong day
wrong route
already contacted
personal preference
other
```

Feedback may later tune the engine but must not instantly mutate global scoring without controlled/versioned learning.

---

## 20. Engine Versioning

Every generated batch records:

```text
engine_version
policy_version
feature/config version
```

This enables regression testing and explanation of why historical recommendations differed.

---

## 21. Deterministic Testability

For fixed input fixtures and engine version, the ranking/schedule should be reproducible except where explicitly randomized.

P7 tests should include scenarios such as:

```text
Class A behind frequency outranks achieved Class C
Approved leave produces no visit suggestions that day
Business trip changes geographic context
Company holiday blocks recommendations
Two close high-priority doctors gain clustering benefit
Unauthorized doctor is never suggested
```

---

## 22. Language Model Boundary

Optional LLM interface:

```ts
interface RecommendationExplanationService {
  explain(input: {
    suggestion: VisitSuggestion;
    locale: string;
  }): Promise<string>;
}
```

The service receives already-authorized, minimal structured context.

It must not query unrestricted company/platform datasets on its own.

---

## 23. AI Privacy and Isolation

Recommendation generation must run within the requester's workspace authorization context.

Rules:

1. No cross-workspace operational data as model input by default.
2. Platform/master practitioner identity does not provide another workspace's visit history.
3. Only authorized customer candidates enter scoring.
4. LLM prompts/context must minimize unnecessary personal/business data.
5. Logs must avoid storing raw sensitive prompts/data unnecessarily.

---

## 24. No Hallucinated Business Facts

The LLM explanation layer must not invent:

```text
doctor availability
visit history
frequency requirement
company target
location
```

If a fact is not present in structured input, the explanation must not claim it.

---

## 25. UI Presentation

AI should appear inside the workflow, not as a mandatory chatbot.

Example card:

```text
✨ 6 suggestions for Monday

Dr X                         High
Class A · 3 visits remaining
Same route as 4 planned doctors

[Add to Monday] [Why?]
```

Suggested entries should have a visually distinct state until accepted.

---

## 26. Recommendation Service Interface

```ts
interface VisitRecommendationService {
  generate(input: GenerateRecommendationsInput): Promise<RecommendationBatch>;
  accept(input: AcceptSuggestionInput): Promise<PlanEntryResult>;
  reject(input: RejectSuggestionInput): Promise<void>;
  recordFeedback(input: RecommendationFeedbackInput): Promise<void>;
}
```

Planner UI talks to this service; scoring internals remain replaceable/versioned.

---

## 27. Future Internal AI Options

The architecture may later support:

```text
local/small language model
hosted inference API
provider-specific model
rule-only mode
```

Recommendation ranking must still work in a deterministic/non-LLM mode where feasible.

This keeps cost, availability, and vendor lock-in manageable.

---

## 28. P0-A5 Acceptance Criteria — AI

1. Recommendations are separate from official plan entries.
2. Hard constraints and soft scores are distinct.
3. Every suggestion has structured reasons.
4. Recommendation engine works without requiring an LLM.
5. LLM is an explanation/interaction layer, not authority for core facts.
6. Calendar and trip constraints use shared service contracts.
7. Route optimizer does not own customer priority logic.
8. Engine/policy versions are recorded.
9. Unauthorized/cross-workspace data cannot enter candidate scoring by default.
10. User acceptance is required before publishing plan changes.

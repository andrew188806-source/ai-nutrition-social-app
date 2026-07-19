# Phase 2Y Known Issues and Deferrals

## Development Hard Gates (Must be resolved before Phase 2Y-D)

These issues are unresolved in Phase 2Y-A and block write activation in Phase 2Y-D.
They must be answered from Development DB evidence, not from assumptions.

---

### HG-1: Target Existence Validation in Write RPC

**Status:** Deferred — Development hard gate for 2Y-D.

**Question:** Should `record_authenticated_recommendation_feedback_event` validate that
`restaurant_id` and `menu_item_id` exist in the catalog before inserting?

**Schema position:** `restaurant_id`, `menu_item_id`, and `recommendation_id` have no FK
in `recommendation_feedback`. The schema treats them as behavioral metadata text keys, not
FK-validated references.

**Options:**
1. No validation — accept any non-empty canonical-format string. Behavioral log semantics.
2. Validate existence via catalog tables. Adds FK-like safety but complicates the RPC.
3. Validate format only (not existence). Rejects obviously invalid strings without a join.

**Resolution approach:** Check with product owner at 2Y-D time. Default is option 1 unless
catalog lookup is specifically required for recommendation quality signals.

**ID format validation (Phase 2Y-D hard gate):** The Phase 2Y-A contract does NOT assert
a bare-integer rejection rule (`/^\d+$/`). No migration evidence defines the canonical
format of `restaurant_id`, `menu_item_id`, or `recommendation_id`. ID format validation
(rejecting structurally invalid IDs beyond empty/whitespace/`fav-*`) is deferred to
Phase 2Y-D catalog verification. Phase 2Y-D must confirm canonical ID format from
Development DB evidence before adding format-based rejection to the write RPC.

---

### HG-2: Session Closure Lifecycle

**Status:** Resolved — frozen in Phase 2Y-A contract.

**Resolution:** Session closure is handled by `end_authenticated_recommendation_session` RPC,
exposed at the service layer as `endCurrentUserRecommendationSession({ sessionId })`. The
lifecycle is a one-time transition: `ended_at` may be set once; a second call returns
`already_ended`. The `end_authenticated_recommendation_session` RPC must be implemented
in Phase 2Y-D alongside the session creation RPC. This is no longer a hard gate question.

---

### HG-3: `context_snapshot` Content Definition

**Status:** Deferred — Development hard gate for 2Y-D.

**Question:** What fields go in `recommendation_sessions.context_snapshot`?

**Schema position:** `jsonb NOT NULL default '{}'` — the schema accepts any JSON object.

**Known context fields in Phase 2Q (`ConsumerNextMealRecommendationContext`):**
- `date`, `timezone`, `generatedAt`
- `alreadyConsumedCalories`, `alreadyConsumedProtein`
- `referenceCaloriesPerMeal`, `referenceIsActualTarget`
- `plannedMealCount`, `plannedMealsAvailable`, `plannedMealsAppliedToRanking`
- `personalizationLevel`, `intakeOverviewUsed`

**Risk:** Storing detailed nutrition context in `context_snapshot` creates behavioral
profiling data. Must decide what to include vs. omit.

**Resolution approach:** Phase 2Y-D must define a `context_snapshot` schema with only
fields needed for recommendation quality, excluding sensitive health data if possible.

---

### HG-4: Free-Text Field Length Limits

**Status:** Deferred — Development hard gate for 2Y-D.

**Question:** What are the length limits for `feedback` (free text) and `reason` (dismiss
reason) columns in `recommendation_feedback`?

**Schema position:** `feedback text NULL`, `reason text NULL` — no length constraint.

**Risk:** Unbounded free-text in SECURITY DEFINER RPC could be exploited for large payloads.

**Resolution approach:** Phase 2Y-D RPC must `nullif(btrim(substring(p_feedback, 1, 2000)), '')`
or similar pattern to cap length. The exact limit is a product decision.

---

### HG-5: `rating`, `feedback`, `reason` Field Scope

**Status:** Partially resolved — v1 exclusion frozen in Phase 2Y-A; applicability scope
deferred to a future phase.

**Phase 2Y-A resolution:** `rating`, `feedback` (free text), and `reason` (dismiss reason)
are NOT exposed in the Phase 2Y v1 public runtime input type
(`RecordRecommendationFeedbackEventInput`). The DB columns are retained for future use.
Mobile cannot write these fields via the Phase 2Y-D RPC in v1. This is non-blocking.

**Remaining question:** Should a future write RPC allow `rating` on all action types, or
only specific ones (e.g., only `consumed` or `accepted`)? Deferred to the phase that
exposes these fields.

---

### HG-6: `recommendation_id` to `candidateId` Mapping in Mobile

**Status:** Analysis note — not blocking 2Y-B, but requires attention in 2Y-E.

**Question:** The next-meal prototype uses `prototypeId` (a string) as the candidate
identifier in `U1NextMealCandidateViewModel`. Is `prototypeId` the same as what should
be stored in `recommendation_id` in the feedback table?

**Observation:** `candidateId` in `ConsumerNextMealCandidate` (Phase 2Q) is likely the
canonical value. `prototypeId` in the U1 view model is derived from it. Phase 2Y-E must
confirm the exact mapping and ensure `recommendation_id` receives the canonical candidate
ID, not the prototype presentation ID.

**Resolution approach:** Read `consumerNextMealRecommendationService.ts` and the
supabase repository at 2Y-E time to confirm `candidateId` origin.

---

## Known Non-Blocking Issues

### NB-1: `branch_id` Not Part of Idempotency Key

`recommendation_feedback` idempotency is keyed by `(user_id, event_idempotency_key)`.
`branch_id` is stored as metadata but does not participate in idempotency. This means two
events for the same candidate at different branches could share an `event_idempotency_key`
if the caller reuses the key (which they must not). The caller is responsible for generating
a unique key per event regardless of branch.

### NB-2: Aggregate View Has No Grant

`restaurant_consumer_aggregate_metrics` currently has no SELECT grant to any role.
Future restaurant-analytics exposure is a separate phase, not Phase 2Y. No action needed now.

### NB-3: Multiple Simultaneous Sessions

The schema allows multiple concurrent open sessions per user (no unique constraint on
user_id in `recommendation_sessions`). The Mobile runtime should track the active session
ID in component state and not create a new session on every UI render cycle.
This is a Phase 2Y-E implementation concern, not a schema gap.

### NB-4: No RLS Policy on `restaurant_consumer_aggregate_metrics`

The aggregate view has no RLS because it is a `CREATE VIEW` without `SECURITY DEFINER`.
Access depends on the querying role having SELECT on `recommendation_feedback`, which
is blocked. This is correct and requires no change.

---

## Deferred to Later Phases (Not Phase 2Y)

- Anonymization migration for `user_id` in feedback (vs. hard delete cascade)
- Aggregate view SELECT grant for restaurant-facing analytics
- `model_version` population in sessions (requires recommendation engine versioning)
- Session closure RPC
- Consumer self-read of feedback history
- `recommendation_id` to recommendation engine entity integration
- Phase 2Z (not started, not defined in this phase)
- Production operations (blocked for all Phase 2Y subphases)

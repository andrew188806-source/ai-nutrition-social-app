# Phase 2Y-D-A: Authenticated Atomic Write Preparation

**Phase:** Consumer Runtime Phase 2Y-D-A
**Status:** Candidate (not staged, not committed)
**Frozen basis:** Phase 2Y-B commit `f873ee975738783341336c8e6ddfb9fe5ddc49db`

---

## 1. Purpose

Phase 2Y-D-A prepares the Supabase-backed write path for Consumer Recommendation Feedback. It:

- Drafts three authenticated SECURITY DEFINER RPCs in a migration candidate.
- Implements a TypeScript Supabase write repository (`SupabaseConsumerRecommendationFeedbackWriteRepository`).
- Extends the factory to wire the Supabase client when `source = "supabase"`.
- Records the exact Phase 2Y-B frozen smoke phase-transition result (expected, not a bug).
- Adds a forward regression smoke that preserves all Phase 2Y-B positive invariants.

No Supabase connections, no credential reads, no migration deployment, no Development or Production operations are performed in this phase. All artifacts are local candidates only.

---

## 2. File Inventory

### New TypeScript files

| File | Role |
|------|------|
| `supabaseRecommendationFeedbackContracts.ts` | RPC name constants, argument types, `SupabaseConsumerRecommendationFeedbackClientLike` interface |
| `supabaseRecommendationFeedbackMappers.ts` | Strict runtime validation of all three RPC JSON responses |
| `adapters/supabaseConsumerRecommendationFeedbackWriteRepository.ts` | Supabase write repository; calls only the 3 approved RPCs |

### Modified TypeScript files

| File | Change |
|------|--------|
| `errors.ts` | +4 error codes: `feedback_permission_denied`, `feedback_response_malformed`, `feedback_database_failed`, `feedback_transport_failed` |
| `featureFlags.ts` | `supabase` added to `SUPPORTED_SOURCES` |
| `factories.ts` | Imports Supabase adapter; adds `feedbackClient` option; adds `supabase` branch in `createConsumerRecommendationFeedbackRepository` |
| `index.ts` | Re-exports contracts, mappers, and Supabase adapter |
| `package.json` | +3 scripts: `test:consumer-phase2y-d-a`, `test:consumer-phase2y-d-a-smoke`, `test:consumer-phase2y-d-a-forward-regression` |

### New migration

| File | Role |
|------|------|
| `supabase/migrations/20260719010000_consumer_recommendation_feedback_atomic_write.sql` | Three SECURITY DEFINER authenticated atomic RPCs |

### Validation artifacts

| File | Role |
|------|------|
| `scripts/consumer-recommendation-feedback-phase-2y-d-a-guard.mjs` | Static integrity guard |
| `scripts/consumer-recommendation-feedback-phase-2y-d-a-contract-smoke.mjs` | Production-backed Supabase adapter smoke |
| `scripts/consumer-recommendation-feedback-phase-2y-d-a-forward-regression-smoke.mjs` | Preserves Phase 2Y-B invariants + validates D-A transition |

### Documentation

| File | Role |
|------|------|
| `docs/consumer-runtime-phase-2y/phase-2y-d-a-atomic-write-preparation.md` | This document |
| `docs/consumer-runtime-phase-2y/phase-2y-d-a-security-and-validation.md` | Security design and validation semantics |
| `docs/consumer-runtime-phase-2y/phase-2y-d-b-development-write-activation-runbook.md` | Development deployment runbook (authored here, executed in Phase 2Y-D-B) |

---

## 3. Migration Candidate: RPC Signatures

Migration file: `supabase/migrations/20260719010000_consumer_recommendation_feedback_atomic_write.sql`

### `create_authenticated_recommendation_session(uuid, text, text)`

```sql
create or replace function public.create_authenticated_recommendation_session(
  p_session_id    uuid,
  p_source_surface text,
  p_model_version  text default null
) returns jsonb language plpgsql security definer
  set search_path = pg_catalog, public, pg_temp
```

**Returns:**
- `{ status: "created", session_id: uuid, started_at: timestamptz }`
- `{ status: "already_created", session_id: uuid }` — same actor, same immutable payload
- Raises `SESSION_CREATE_CONFLICT (22023)` — covers both: (a) same actor / different payload; (b) foreign-actor UUID collision. Both cases produce the same exception name; neither reveals session ownership or existence to the caller. Public result: `create_failed`.
- Raises `AUTHENTICATION_REQUIRED (28000)` — null `auth.uid()`

### `end_authenticated_recommendation_session(uuid)`

```sql
create or replace function public.end_authenticated_recommendation_session(
  p_session_id uuid
) returns jsonb language plpgsql security definer
  set search_path = pg_catalog, public, pg_temp
```

**Returns:**
- `{ status: "ended", session_id: uuid, ended_at: timestamptz }`
- `{ status: "already_ended", session_id: uuid, ended_at: timestamptz }` — first-end wins; retry converges
- `{ status: "session_not_found" }` — missing or foreign session (fail closed)
- Raises `AUTHENTICATION_REQUIRED (28000)` — null `auth.uid()`

### `record_authenticated_recommendation_feedback_event(uuid, text, text, text, text, text, text, text)`

```sql
create or replace function public.record_authenticated_recommendation_feedback_event(
  p_session_id             uuid,
  p_action                 text,
  p_target_kind            text,
  p_event_idempotency_key  text,
  p_recommendation_id      text default null,
  p_restaurant_id          text default null,
  p_branch_id              text default null,
  p_menu_item_id           text default null
) returns jsonb language plpgsql security definer
  set search_path = pg_catalog, public, pg_temp
```

**Returns:**
- `{ status: "recorded", feedback_id: uuid }`
- `{ status: "already_recorded" }` — same key, same immutable payload (includes `branch_id` in comparison)
- `{ status: "idempotency_conflict" }` — same key, different payload (branch_id mismatch triggers this)
- `{ status: "session_not_found" }` — missing or foreign session
- `{ status: "invalid_session" }` — session is ended
- Raises `FEEDBACK_TARGET_SHAPE_INVALID (22023)` — cross-kind identity fields present (e.g., restaurant_id on recommendation target)
- Raises `FEEDBACK_BRANCH_NOT_FOUND_OR_MISMATCH (22023)` — branch_id not in `restaurant_branches` or parent mismatch
- Public result for all 22023 from record: `invalid_target` (TypeScript adapter)

**Exact target shapes enforced by RPC:**

| Target kind | Required | Forbidden |
|-------------|----------|-----------|
| `recommendation` | `recommendation_id` | `restaurant_id`, `menu_item_id`, `branch_id` must be null |
| `restaurant` | `restaurant_id` | `recommendation_id`, `menu_item_id` must be null; `branch_id` optional but catalog-validated |
| `menu_item` | `restaurant_id`, `menu_item_id` | `recommendation_id` must be null; `branch_id` optional but catalog-validated |

---

## 4. Factory Extension

```typescript
// New option in ConsumerRecommendationFeedbackFactoryOptions:
feedbackClient?: SupabaseConsumerRecommendationFeedbackClientLike;

// Supabase source branch in createConsumerRecommendationFeedbackRepository:
if (flags.source === "supabase") {
  if (!options.feedbackClient) {
    throw new ConsumerRecommendationFeedbackConfigurationInvalidError(
      "Supabase recommendation feedback source requires an explicitly injected RPC-capable feedback client."
    );
  }
  return new SupabaseConsumerRecommendationFeedbackWriteRepository(options.feedbackClient);
}
```

Factory construction remains zero-call: no auth check, no network call.

---

## 5. Phase 2Y-B Frozen Smoke — Expected Phase Transition

After Phase 2Y-D-A changes `featureFlags.ts` to add `supabase` to `SUPPORTED_SOURCES`, the frozen Phase 2Y-B smoke fails at:

> `"feature flags: supabase source falls back to disabled in Phase 2Y-B"`

This is an `EXPECTED_PHASE_TRANSITION_RESULT`. The frozen smoke cannot be modified. The forward regression smoke preserves all Phase 2Y-B positive invariants and validates the new source matrix.

The frozen Phase 2Y-B smoke exits with code 1. The Phase 2Y-D-A guard records this disposition and confirms the expected reason. This is not a regression — it is the intended behavioral upgrade.

---

## 6. Source Matrix After Phase 2Y-D-A

| Source | Phase 2Y-B | Phase 2Y-D-A |
|--------|-----------|--------------|
| `disabled` | default | default |
| `mock` | explicit opt-in | explicit opt-in |
| `supabase` | unsupported → `disabled` | explicit opt-in (requires `feedbackClient`) |
| unknown | → `disabled` | → `disabled` |

---

## 7. What Phase 2Y-D-A Does NOT Include

- No Supabase connection or credential read
- No migration deployment
- No Development or Production operations
- No `service_role` usage
- No N4 execution
- No Phase 2Y-D-B/E or Phase 2Z work
- No staged commit
- No `contextSnapshot`, `rating`, `feedbackNote`, or `dismissReason` in public input (v1 exclusion)
- No read repository (recommendation session/feedback read paths are deferred)

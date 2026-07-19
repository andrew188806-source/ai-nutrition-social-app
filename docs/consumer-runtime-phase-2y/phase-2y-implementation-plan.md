# Phase 2Y Implementation Plan — Consumer Recommendation Feedback Runtime

## Overview

Phase 2Y wires the Recommendation Feedback persistence schema (defined in Phase 1.3)
into the Consumer Mobile runtime. The feedback schema tracks behavioral signals
(shown, clicked, accepted, dismissed, saved, consumed) against recommendation candidates.

This is a **write-only event runtime**. No consumer-facing read of raw feedback rows
is needed. The read path is internal analytics only (`restaurant_consumer_aggregate_metrics`
view, subject to minimum-cohort privacy threshold).

---

## Subphase Map

### 2Y-A — Discovery & Contract Freeze (CURRENT)

**Goal:** Evidence-based schema discovery, contract definition, guard.

**Deliverables:**
- `phase-2y-a-discovery-report.md` — full schema inventory
- `phase-2y-a-runtime-contract.md` — typed domain contract
- `phase-2y-a-security-and-target-identity.md` — security and privacy analysis
- `phase-2y-implementation-plan.md` (this file)
- `phase-2y-known-issues-and-deferrals.md` — open questions
- `phase-2y-validation-plan.md` — validation approach for all subphases
- `scripts/consumer-recommendation-feedback-phase-2y-a-guard.mjs` — local guard

**No network, no DB connection, no runtime implementation, no migration changes.**

---

### 2Y-B — Local Disabled/Mock Architecture

**Goal:** Build the full domain type system, disabled repository, mock repository,
service, factories, and composition — all operating without any Supabase connection.

**Deliverables:**

`apps/mobile/features/consumer-recommendation-feedback/`

- `types.ts` — domain types, result types, repository interfaces, service interface
- `featureFlags.ts` — `getConsumerRecommendationFeedbackRuntimeFlags(env)`
- `factories.ts` — `createConsumerRecommendationFeedbackRuntime()`
- `compositionSessionIdGenerator.ts` — `generateFeedbackEventIdempotencyKey()`
- `adapters/disabledConsumerRecommendationFeedbackRepository.ts`
- `adapters/mockConsumerRecommendationFeedbackRepository.ts`
- `consumerRecommendationFeedbackService.ts`
- `consumerRecommendationFeedbackTargetMapper.ts`
- `index.ts`

`apps/mobile/features/consumer-recommendation-feedback/composition/`

- `consumerRecommendationFeedbackComposition.ts` —
  `createMobileConsumerRecommendationFeedbackComposition()`

**Validation:**
- TypeScript compilation clean
- New guard: disabled and mock source paths exercised
- No Supabase client construction, no network, no DB

**Migration changes:** None.

---

### 2Y-C — Skipped (No Consumer Read Runtime Needed)

Phase 2Y-C is intentionally omitted.

**Reason:** `recommendation_feedback` is an append-only behavioral event log. No product
use case requires the consumer to read back raw feedback rows in the Mobile UI.
The aggregate view exists for internal analytics under a minimum-cohort privacy threshold.
Building a read activation migration and read repository without a product use case would
add surface area and grants without benefit.

If a future product need for consumer self-read of feedback history emerges (e.g.,
"feedback history" screen), it must be defined in a new phase with:
- Explicit UX specification
- Privacy review for re-identification risk
- Dedicated read migration with `REVOKE ALL` + `GRANT SELECT` + RLS policy review

---

### 2Y-D — Development Atomic Write Preparation & Activation

**Goal:** Define and activate the Supabase write RPCs for session creation and
feedback event recording. Enable live write path in Development only, behind an opt-in
flag. Run credential-backed live smoke.

**New migrations (Development only):**

Migration 1 — `YYYYMMDDHHMMSS_consumer_recommendation_feedback_atomic_write.sql`:

```sql
BEGIN;

-- Close direct table access (confirm closed state)
REVOKE ALL ON TABLE public.recommendation_sessions FROM public, anon, authenticated;
REVOKE ALL ON TABLE public.recommendation_feedback FROM public, anon, authenticated;

-- Session creation RPC
CREATE OR REPLACE FUNCTION public.create_authenticated_recommendation_session(...)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$ ... $$;

REVOKE ALL ON FUNCTION public.create_authenticated_recommendation_session(...)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_authenticated_recommendation_session(...)
  TO authenticated;

-- Feedback event RPC
CREATE OR REPLACE FUNCTION public.record_authenticated_recommendation_feedback_event(...)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$ ... $$;

REVOKE ALL ON FUNCTION public.record_authenticated_recommendation_feedback_event(...)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_authenticated_recommendation_feedback_event(...)
  TO authenticated;

COMMIT;
```

**New TypeScript (adapters):**

- `adapters/supabaseConsumerRecommendationFeedbackWriteRepository.ts`

**Validation:**
- Live smoke: `session → feedback event → idempotency retest → sign-out`
- Cleanup in `finally`: exact WHERE predicates, no LIKE, no full-table delete
- Aggregate equality restored after cleanup

**Hard gates before 2Y-D activation:**
- 2Y-B frozen ✓
- Development DB migration aligned ✓
- RPCs reviewed for SECURITY DEFINER + search_path + auth.uid() ownership ✓
- Session ownership verification in feedback RPC ✓
- Idempotency: `ON CONFLICT (user_id, event_idempotency_key) DO NOTHING` ✓
- No SELECT grant on raw tables ✓

---

### 2Y-E — Mobile Composition Cutover & Final Freeze

**Goal:** Wire `createMobileConsumerRecommendationFeedbackComposition()` into
`apps/mobile/app/recommendation.tsx`. Record `clicked` and `accepted` events from
the prototype UI. Validate with live credential-backed smoke. Final freeze commit.

**Modified routes:**
- `apps/mobile/app/recommendation.tsx` — add feedback composition, session creation on
  load, `clicked` event on `selectCandidate`, `accepted` event on `confirmSelectedCandidate`

**Validation:**
- UI contract smoke: candidate interaction triggers correct feedback event
- Live smoke: full lifecycle (session created → shown → clicked → accepted → sign-out → cleanup)
- Forward regression: Phase 2Y-B, 2Y-D checks still pass
- No persistent test data after cleanup

**Final freeze commit:** single commit, exactly N named files, staged explicitly.

---

## What Phase 2Y Does NOT Do

- No read path for raw feedback rows (see 2Y-C skip)
- No Production migration or Production operations
- No `service_role` in any client path
- No cross-boundary writes (no Favorites write from `saved` action, no Ratings write
  from feedback `rating` field)
- No Phase 2Z implementation

---

## Dependency Map

```
Phase 1.3 schema  →  Phase 2Y-A  →  Phase 2Y-B  →  Phase 2Y-D  →  Phase 2Y-E
  (migrations)       (contract)     (disabled/mock)  (write RPCs)   (cutover)
                                         ↑
                                     Phase 2Y-C SKIPPED
```

Phase 2Y-B can begin immediately after Phase 2Y-A is frozen.
Phase 2Y-D requires Development DB connection and migration alignment.
Phase 2Y-E requires Phase 2Y-D frozen and UI route work.

# Phase 2Y Validation Plan

## Validation Philosophy

Each subphase has three categories of validation:
1. **Local static**: TypeScript compilation, file structure, guard checks — no network.
2. **Local behavioral**: Unit/smoke of disabled/mock paths — no network, deterministic.
3. **Development live**: Credential-backed live smoke against Development DB — explicit opt-in.

Production is never touched in any Phase 2Y subphase.

---

## Phase 2Y-A Validation (Current)

### Guard: `scripts/consumer-recommendation-feedback-phase-2y-a-guard.mjs`

Runs entirely locally, no network, no DB.

| # | Check | Rationale |
|---|---|---|
| 1 | Branch = main | Baseline |
| 2 | Phase 2X Frozen commit is ancestor | Ancestry integrity |
| 3 | Phase 2X core frozen artifacts byte-equivalent | D-B guard, D-B runner, migration SHA |
| 4 | Candidate scope = exactly 8 files | No extra files staged or created |
| 5 | `package.json` adds exactly `test:consumer-phase2y-a` | No other script changes |
| 6 | `package-lock.json` unchanged | No dependency changes |
| 7 | Migrations unchanged (count=36, latest unchanged, SHA unchanged) | No new migrations |
| 8 | Schema table inventory matches canonical migrations | Both tables exist in correct migration |
| 9 | RLS enabled for both tables | Policy drafts migration evidence |
| 10 | RLS policies owner_all for both tables | Policy names and predicate |
| 11 | No grants on recommendation tables in any migration | Grant-closed state confirmed |
| 12 | No RPCs for recommendation feedback in any migration | No function definitions found |
| 13 | Aggregate view has correct privacy threshold (>= 10) | Anti-privacy-risk minimum cohort |
| 14 | `recommendation_feedback_idempotency_idx` is UNIQUE | Idempotency built on unique index |
| 15 | `recommendation_feedback_action` enum has 6 exact values | Vocabulary from migration 001 |
| 16 | Target identity contract defined (3 kinds) | From discovery report |
| 17 | No client `userId` in contract | Fail-closed authentication contract |
| 18 | No direct Mobile DML contract | Write-only-RPC contract |
| 19 | Ratings, Favorites, Feedback boundaries separate | Independent service statement |
| 20 | Privacy retention deletion documented | Security doc present and non-empty |
| 21 | Development hard gates listed | HG-1 through HG-6 defined |
| 22 | No runtime implementation in 2Y-A candidate files | TypeScript domain code not present |
| 23 | No Mobile UI cutover in 2Y-A | `recommendation.tsx` unchanged |
| 24 | No network/database operation | Guard is entirely local |
| 25 | Production = false | No production reference |
| 26 | service_role = false | No service_role in candidate files |
| 27 | N4 = false | Not executed |
| 28 | Phase 2Z not started | No 2Z files |
| 29 | Staged diff empty | Git clean |
| 30 | Markdown EOL: exactly one newline, no trailing whitespace | All 7 doc files |
| 31 | No secret/token/project-ref in candidate files | Credential scan |
| 32 | No generated artifact or environment in candidate files | No `.env`, no build output |

---

## Phase 2Y-B Validation

### Local Compilation

```
npm run typecheck  (or tsc --noEmit)
```

All new TypeScript in `apps/mobile/features/consumer-recommendation-feedback/` must
compile without errors.

### Disabled/Mock Path Guard

New guard: `scripts/consumer-recommendation-feedback-phase-2y-b-guard.mjs`

Key checks:
- Disabled repository: `createCurrentUserRecommendationSession` → `{ status: "disabled" }`
- Disabled repository: `recordCurrentUserRecommendationFeedbackEvent` → `{ status: "disabled" }`
- Mock repository: session created → sessionId is UUID format string
- Mock repository: feedback recorded → `{ status: "recorded", feedbackId: ... }`
- Mock repository: duplicate idempotency key → `{ status: "already_recorded" }`
- Target mapper: `fav-*` → `invalid_target`
- Target mapper: bare integer → `invalid_target`
- Target mapper: empty string → `invalid_target`
- Target mapper: `menu_item` without `restaurantId` → `invalid_target`
- Target mapper: valid `recommendation` target → accepted
- Target mapper: valid `restaurant` target → accepted
- Target mapper: valid `menu_item` target with both IDs → accepted
- Feature flags: missing env → source=disabled
- Feature flags: `EXPO_PUBLIC_TASTKIND_CONSUMER_RECOMMENDATION_FEEDBACK_SOURCE=disabled` → disabled
- Feature flags: `...=mock` → mock

---

## Phase 2Y-D Validation

### Development Live Smoke

File: `scripts/consumer-recommendation-feedback-phase-2y-d-development-live-smoke.mjs`

Opt-in key: `TASTKIND_CONSUMER_PHASE2Y_D_DEVELOPMENT_FEEDBACK_SMOKE`

Actor: `DV_CONSUMER_NON_MEMBER_EMAIL` / `TASTKIND_DV_TEST_PASSWORD`

**Lifecycle:**

| Step | Check |
|---|---|
| Pre-smoke row count | `recommendation_sessions` for actor = 0 |
| Pre-smoke row count | `recommendation_feedback` for actor = 0 |
| Create session | `status: "created"`, sessionId is UUID |
| Session in DB | Row exists in `recommendation_sessions` for actor |
| Record `shown` event | `status: "recorded"`, feedbackId is UUID |
| Idempotency retest | Same key → `status: "already_recorded"` |
| Record `clicked` event | `status: "recorded"`, different key |
| Record `accepted` event | `status: "recorded"`, different key |
| Sign out | `authPort.signOut()` succeeds |
| Session cleared | `authPort.getCurrentSession()` returns null |
| Cleanup | `DELETE FROM recommendation_feedback WHERE user_id = $1` (exact predicate) |
| Cleanup | `DELETE FROM recommendation_sessions WHERE user_id = $1` (exact predicate) |
| Post-cleanup row count | `recommendation_feedback` for actor = 0 |
| Post-cleanup row count | `recommendation_sessions` for actor = 0 |
| Aggregate equality | Restored to pre-smoke baseline |
| Persistent test data | false |

Cleanup must be in `finally`. Exact WHERE predicates, no LIKE, no full-table delete.

---

## Phase 2Y-E Validation

### UI Contract Smoke

File: `scripts/consumer-recommendation-feedback-phase-2y-e-ui-contract-smoke.mjs`

Key checks:
- `recommendation.tsx` imports `createMobileConsumerRecommendationFeedbackComposition`
- `selectCandidate` triggers `recordCurrentUserRecommendationFeedbackEvent` with action=`clicked`
- `confirmSelectedCandidate` triggers action=`accepted`
- Session created on component mount (not on every render)
- Composition uses `authPort` for sign-in/sign-out
- No direct Supabase call in route file
- No cross-boundary write (Favorites service not called, Ratings service not called)
- `recommendation.tsx` no longer uses local-only `selectedCandidateId` as final state
  (moves to composition-backed feedback)

### Live Smoke

Full end-to-end: session create → shown → clicked → accepted → sign-out → cleanup.

Same constraints as Phase 2Y-D smoke plus:
- Composition boundary proof: `createMobileConsumerRecommendationFeedbackComposition()`
  called, not direct runtime factory
- `authPort.source === "supabase-live"` confirmed

### Forward Regression

Phase 2Y-A guard still passes.
Phase 2Y-B guard still passes.
Phase 2Y-D guard still passes.

---

## Cross-Phase Invariants (All Subphases)

- `productionTouched: false`
- `serviceRoleUsed: false`
- `n4Executed: false`
- `phase2ZStarted: false`
- `credentialsPrinted: false`
- `emailPrinted: false`
- `tokenPrinted: false`
- `sessionPrinted: false`
- `userIdPrinted: false`
- `targetIdPrinted: false`
- `feedbackContentPrinted: false`

# Consumer Runtime Phase 2Q

## Canonical Next Meal Recommendation Read Architecture

Status: Implementation complete, guard complete, default-smoke-skipped, mock-contract-verified, and freeze-ready.

## Scope

Phase 2Q establishes a canonical read architecture for next-meal recommendations in the Consumer Runtime. It provides types, a service orchestration layer, repository abstractions, feature flags, guards, and smoke tests.

It does not: add migrations, change grants or RLS policies, invoke Supabase transports, perform live recommendation reads, produce user-personalized recommendations based on taste or dietary profiles, write planned meals, create meal-buddy cards, change UI routes, cut over U1 presentation, or start any subsequent phase.

## Data Provenance

All Phase 2Q recommendation data is **sample data** (`dataProvenance: "sample"`).

- `disabled` source: no data returned
- `mock` source: deterministic fixed seed candidates
- `local-menu-demo` source: static demo restaurant and menu data from `mobileMenuItemService`

Phase 2Q produces no `live` recommendation data. The field `dataProvenance: "live"` is reserved for a future phase that adds a live Supabase recommendation read adapter with appropriate authenticated SELECT grants.

## Missing Live Read Capability

There is no authenticated SELECT grant on any recommendation table in the active migration set. The `recommendation_feedback` table exists in the schema (`20260712130900`) but has no Consumer Runtime SELECT adapter. The `meal_analyses` and `meal_corrections` tables have no SELECT grant (confirmed in Phase 2P).

No server-side recommendation RPC exists. Phase 2Q therefore does not include a `supabase-prepared` repository tier because there is no Supabase read surface to prepare for.

## Personalization Boundary

Phase 2Q recommendation candidates are ranked by calorie proximity to a fallback reference value (`FALLBACK_REFERENCE_CALORIES_PER_MEAL = 520 kcal`).

There is **no** user daily calorie target adapter in Phase 2Q. The `referenceIsActualTarget: false` field on `ConsumerNextMealRecommendationContext` explicitly declares this. The reference is not derived from the user's goals.

### Personalization Levels

- `fallback`: today's intake is empty or unavailable — reference calories used with no consumed context
- `intake_context`: Today Intake Overview is available; `alreadyConsumedCalories` and `alreadyConsumedProtein` are recorded in context — but no user daily target is known, so remaining calories cannot be computed
- `full_profile`: **not produced in Phase 2Q** — requires a user goal adapter, taste preference adapter, and dietary restriction adapter, none of which exist yet

## Planned Meals Handling

Phase 2Q reads planned meals via the Today Intake Overview and records their count in context. `plannedMealsAppliedToRanking: false` is permanently set in Phase 2Q context. Planned meals do not affect candidate ranking. Their presence is noted for future phases that may integrate planning-aware ranking.

## Recommendation Reason Basis

Candidates use only evidence-backed reason bases:

- `calorie_proximity`: the ranking algorithm actually sorts by `|candidate_calories - referenceCaloriesPerMeal|`
- `fallback_calorie_reference`: used when the reference is the static fallback, not a user-derived target

`high_protein` and `balanced` are not produced by Phase 2Q. They are reserved for future phases that implement macro-balance algorithms.

## Service Orchestration

`ConsumerNextMealRecommendationService.getCurrentUserNextMealRecommendation` orchestrates:

1. Checks if repository source is `disabled` — returns `disabled` immediately (no intake call)
2. Calls `clock.now()` to obtain `generatedAt` timestamp (the sole source of time)
3. Determines target date via `input.date` or `toDateKeyInTimeZone(now, timezone)`
4. Calls `intakeOverviewService.getCurrentUserTodayIntakeOverview({ date })` — if this fails, returns `intake_unavailable` (fail-closed)
5. Extracts `alreadyConsumedCalories`, `alreadyConsumedProtein`, planned meal count from intake result
6. Builds `ConsumerNextMealRecommendationContext` with `referenceIsActualTarget: false` and `plannedMealsAppliedToRanking: false`
7. Calls `repository.getRankedNextMealCandidates({ referenceCaloriesPerMeal, candidatePoolLimit })`
8. Assembles and returns `ConsumerNextMealRecommendation` with `generatedAt` from clock, source, dataProvenance, context, and candidates

Repositories never call `Date.now()`, `new Date()`, or `Math.random()`.

## Repository Responsibilities

Repositories are responsible only for providing and sorting candidate data:

- Accept `{ referenceCaloriesPerMeal, candidatePoolLimit? }` as input
- Return `ConsumerNextMealRecommendationRepositoryResult`: `available | empty | disabled | read_failed`
- Never call time or random functions
- Never include current-user context in method naming (`getRankedNextMealCandidates`, not `getCurrentUserMealRecommendation`)

## Candidate Pool and Entitlement Separation

The canonical repository returns all available demo candidates (up to the optional `candidatePoolLimit` technical bound). It does not know about user entitlement. The `candidatePoolLimit` field is a resource/testing bound only — it must not be set to entitlement-derived values in the canonical runtime.

Display-time clipping (Free: 3 candidates, Premium: 10 candidates) remains the responsibility of the U1 presentation layer via `nextMealCandidateCountPolicy.ts`. Phase 2Q does not import from or depend on that policy.

## Runtime Source Flag

Flag: `EXPO_PUBLIC_TASTKIND_CONSUMER_NEXT_MEAL_RECOMMENDATION_SOURCE`

| Value | Behavior |
|---|---|
| unset | `disabled` (fail-closed default) |
| `disabled` | Returns `disabled` immediately |
| `mock` | Deterministic fixed seed candidates |
| `local-menu-demo` | Static demo restaurant and menu data |
| any unknown value | Registers issue; falls back to `disabled` |

## U1 Integration Cutover

Phase 2Q does not modify `apps/mobile/app/recommendation.tsx` or any U1 file. The `/recommendation` route continues to use `createU1MockNextMealPrototypeProvider`. The canonical service and U1 provider have separate, incompatible type contracts:

- U1: `source: "u1_mock"`, `isSampleData: true` (literal type constraints)
- Canonical: `source: ConsumerNextMealRecommendationSource`, `dataProvenance: ConsumerNextMealDataProvenance`

A future integration phase will add a mapper from canonical types to a relaxed U1 ViewModel and wire `recommendation.tsx` to use the canonical service.

## No Write Path

No write path for recommendations is implemented in Phase 2Q. There is no recommendation feedback write service, no planned-meal write, no meal-buddy card creation, and no quota mutation.

## No Training Pipeline

No training pipeline, embedding computation, automatic export, or model fine-tuning is implemented or referenced.

## Verification

Scripts:

- `npm run test:consumer-phase2q`
- `npm run test:consumer-phase2q-smoke`
- `npm run test:consumer-phase2q-mock-smoke`

Default smoke:

- `SKIPPED`
- no client, no sign-in, no network, no database read, no database write, no RPC

Mock-contract smoke verifies:

- disabled repository returns `disabled` status
- mock repository returns deterministic ranked candidates
- mock repository is deterministic across calls
- local-menu-demo repository returns `available` or `empty` and is labeled `sample`
- service `generatedAt` comes from injected clock
- service calls Today Intake Overview
- service extracts consumed nutrition and planned meal count from intake overview
- service marks `referenceIsActualTarget: false` and `plannedMealsAppliedToRanking: false`
- service returns `intake_unavailable` when intake overview fails
- disabled source does not call intake overview
- no network, no Supabase, no write

## Non-Goals

- No migration
- No grant or RLS change
- No authenticated Supabase read of any recommendation table
- No live recommendation data (`dataProvenance: "live"`)
- No user daily calorie target read
- No taste or dietary restriction personalisation
- No U1 integration cutover
- No mapper from canonical types to U1 ViewModel
- No write path of any kind
- No UI or navigation change
- No planned-meal write
- No meal-buddy card creation
- No push
- No subsequent-phase implementation

## Prerequisites for a Future Live Recommendation Phase

A future live recommendation phase would require, before activation:

- A user goals/targets Consumer Runtime read adapter (for real daily calorie targets)
- An authenticated SELECT grant on `recommendation_feedback` if feedback-weighted ranking is needed
- A live Supabase restaurant and menu read adapter in Consumer Runtime
- A mapper from `ConsumerNextMealRecommendation` to a U1-compatible (or successor) ViewModel
- Relaxed U1 ViewModel types (remove `source: "u1_mock"` and `isSampleData: true` literals)
- A `dataProvenance: "live"` repository implementation
- An explicit live-read opt-in flag
- Live smoke tests confirming `available` and `empty` states with real data

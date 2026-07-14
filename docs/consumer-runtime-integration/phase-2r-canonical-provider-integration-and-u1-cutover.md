# Consumer Runtime Phase 2R

## Canonical Next Meal Provider Integration & U1 Cutover

Status: Implementation complete, guard complete, default-smoke-skipped, mock-contract-verified, and freeze-ready.

## Scope

Phase 2R completes the integration layer between Phase 2Q's canonical next-meal recommendation service and the U1 presentation system. It wires `/recommendation` to use the canonical service behind a mapper, replacing the U1 mock provider.

It does not: add migrations, change grants or RLS policies, invoke Supabase transports, produce live recommendation data, add user goals or dietary preference reads, write planned meals, create meal-buddy cards, mutate quota, create pending matches, or start any subsequent phase.

## Integration Architecture

```
Phase 2Q canonical service
        ↓  (createConsumerNextMealRecommendationService)
canonicalNextMealPrototypeProvider
        ↓  (mapCanonicalToU1NextMeal)
U1 ViewModel (U1NextMealRecommendationViewModel)
        ↓
NextMealPrototypeContent
        ↓
/recommendation
```

Dependency direction is strictly one-way: `next-meal-prototype` may import `consumer-meals` types and factories; `consumer-meals` must never import `next-meal-prototype`.

## New Files

| File | Purpose |
|---|---|
| `next-meal-prototype/mapCanonicalToU1NextMeal.ts` | Pure mapper: `ConsumerNextMealRecommendationResult` → `U1NextMealProviderResult` |
| `next-meal-prototype/canonicalNextMealPrototypeProvider.ts` | Factory: `createCanonicalNextMealPrototypeProvider(): U1NextMealPrototypeProvider` |
| `scripts/consumer-meal-records-phase-2r-guard.mjs` | Static guard (all 2R checks) |
| `scripts/consumer-meal-records-phase-2r-smoke.mjs` | Mock-contract smoke |
| `docs/.../phase-2r-canonical-provider-integration-and-u1-cutover.md` | This file |

## Modified Files

| File | Change |
|---|---|
| `next-meal-prototype/types.ts` | Added `U1NextMealPresentationSource` union; widened `source` and `isSampleData` from literals |
| `next-meal-prototype/index.ts` | Exported `createCanonicalNextMealPrototypeProvider`, `mapCanonicalToU1NextMeal`, `U1NextMealPresentationSource` |
| `next-meal-prototype/NextMealPrototypeContent.tsx` | Source-aware badge + canonical context note rendering |
| `apps/mobile/app/recommendation.tsx` | Replaced `u1MockProvider` with `canonicalProvider` |
| `lib/i18n/zh-TW.ts` | Added `canonicalSampleBadge`, `canonicalContextNote` |
| `package.json` | Added Phase 2R npm scripts |

## U1 Presentation Source Type

```typescript
export type U1NextMealPresentationSource =
  | "u1_mock"          // U1 mock provider — deterministic menu item seeds
  | "canonical_mock"   // Phase 2Q mock repository — deterministic phase 2Q seeds
  | "local_menu_demo"; // Phase 2Q local-menu-demo repository — static restaurant/menu data
```

The U1 mock provider continues to return `source: "u1_mock"`. The canonical-backed provider returns `"canonical_mock"` for the `mock` flag, and `"local_menu_demo"` for the `local-menu-demo` flag.

`isSampleData` is widened from literal `true` to `boolean`. All Phase 2R sources remain sample data (`isSampleData: true`). The `boolean` type makes room for a future live phase without touching U1 types again.

## Status Mapping

| Canonical `status` | U1 `status` | Notes |
|---|---|---|
| `available` | `success` | candidates clipped to `visibleLimit` |
| `empty` | `empty` | honest "no suitable options" message |
| `disabled` | `disabled` | **must not become `success`** |
| `intake_unavailable` | `error`, `retryable: false` | intake architecture unavailable |
| `read_failed` | `error`, `retryable: true` | may be transient |

`disabled` maps to UI `disabled`, never to mock fallback. `intake_unavailable` is non-retryable — the intake service is structurally unavailable, not in a transient error state.

## Candidate Pool and Entitlement Separation

The canonical service is called **without `candidatePoolLimit`**, letting each repository use its own neutral technical default:

- MockRepo: returns all 5 seeds (its internal fixed set)
- LocalMenuDemoRepo: fetches up to 20 items (its default)

The mapper clips to `getNextMealCandidateCount(entitlement)` (Free 3, Premium 10) from `nextMealCandidateCountPolicy.ts`. Entitlement never enters the canonical service or repositories.

### Mock Pool Shortfall (Demo Limitation)

The `MockConsumerNextMealRecommendationRepository` has exactly **5 deterministic seeds**. This is below the Premium count of 10. With the `mock` source and Premium entitlement, users see 5 candidates instead of 10. This is an expected and honest demo limitation of the mock dataset.

The `local-menu-demo` source can serve the full 10 candidates for Premium.

## preferredPrototypeId Handling

`analysis.tsx` navigates to `/recommendation?prototypeId=<menuItemId>`. The mapper handles this by searching the canonical candidate list for `candidateId === preferredPrototypeId`:

- **Match found at index > 0**: the matching candidate is promoted to position 0; remaining candidates keep their canonical relative order; ordinals are reassigned starting from 0.
- **Match at index 0**: no reordering, canonical order preserved.
- **No match**: canonical order preserved without error or fabrication.

For the `local-menu-demo` source, `candidateId === menuItemId` (set by the repository), so items from `analysis.tsx` can align correctly. For the `mock` source, `candidateId` values are `"mock-next-meal-phase2q-*"` strings which will not match any `menuItemId` from analysis — canonical order is preserved silently.

This is a presentation-only ordering. The canonical service result and repository ranking are never modified.

## Preview Scenario Behavior

The `previewState` route parameter previously allowed forcing error/empty/success states in the U1 mock provider via the `scenario` field. After Phase 2R cutover:

- The `scenario` prop continues to flow from `recommendation.tsx` through `NextMealPrototypeContent` to the provider.
- The canonical provider **ignores `scenario`** — the actual canonical service result determines the displayed state.
- U1 mock provider `scenario` overrides are no longer active for the live screen.
- Phase 2R smoke tests canonical status scenarios directly via the mapper, without relying on route-level scenario overrides.

This is the "not preserved" option. The U1 preview capability has been superseded by the canonical cutover. This is documented to prevent confusion.

## Sample Badge and Context Note

| Source | Badge | Context note shown? |
|---|---|---|
| `u1_mock` | `"U1 範例資料"` | No |
| `canonical_mock` | `"示範餐點資料"` | Yes |
| `local_menu_demo` | `"示範餐點資料"` | Yes |

Canonical context note text: `推薦會參考今天已記錄的飲食；完整偏好個人化將於後續提供`

Forbidden text (must not appear):
- AI已根據你的完整飲食習慣
- 正式個人化推薦
- 已依你的每日營養目標
- 已完整考量預定餐點
- 已配合飲食限制

## Provider Construction Fail-Safe

`createCanonicalNextMealPrototypeProvider()` wraps the factory call in a try/catch. If `createConsumerNextMealRecommendationService()` throws (e.g., flag assertion failure), the factory returns a fail-closed provider that always returns `{ status: "error", retryable: false }`. The error never propagates to module scope.

In `recommendation.tsx`, `canonicalProvider` is created once at module level (outside the component), providing a stable reference.

## Personalization Honesty

All Phase 2R recommendation data is **sample data** (`isSampleData: true`, `dataProvenance: "sample"`).

Ranking is by calorie proximity to a fallback reference (520 kcal). The context note says "參考今天已記錄的飲食" which is honest: `alreadyConsumedCalories` is read from Today Intake Overview and recorded in context, but without a user daily calorie target adapter, the remaining-calories gap cannot be computed. `referenceIsActualTarget: false` and `plannedMealsAppliedToRanking: false` remain true in all Phase 2R outputs.

## No Write Path

No write path for recommendations is implemented in Phase 2R:
- No recommendation feedback write
- No planned-meal write
- No meal-buddy card auto-creation
- No quota mutation
- No pending match creation
- Buddy prefill remains transient (module-level in-memory, zero persistence)
- "這是我的下一餐" confirmation is local presentation state only

## Verification

Scripts:

- `npm run test:consumer-phase2r`
- `npm run test:consumer-phase2r-smoke`
- `npm run test:consumer-phase2r-mock-smoke`

Default smoke:

- `SKIPPED`
- no client, no sign-in, no network, no database read, no database write, no RPC

Mock-contract smoke verifies:

- canonical disabled → U1 disabled (not success)
- canonical empty → U1 empty
- canonical intake_unavailable → U1 non-retryable error
- canonical read_failed → U1 retryable error
- canonical available (mock) → U1 success, canonical_mock source, isSampleData: true
- canonical available (local-menu-demo) → U1 success, local_menu_demo source, isSampleData: true
- Free entitlement clips to 3 candidates
- Premium entitlement clips to min(10, available) candidates
- preferredCandidateId promotes matching candidate to front
- absent preferredCandidateId preserves canonical order
- candidateId → prototypeId mapping correct
- calorieLabel formatted from nutrition.calories
- reasonDetails contains only honest calorie-proximity text
- canonical provider with default flags (disabled source) → U1 disabled
- canonical provider with mock source flags → U1 success
- no network, no Supabase, no write, no source-tree JS artifacts

## Non-Goals

- No migration
- No grant or RLS change
- No authenticated Supabase read
- No live recommendation data
- No user daily calorie target read
- No taste or dietary restriction personalisation
- No recommendation feedback
- No write path of any kind
- No quota mutation
- No pending match creation
- No auto-buddy card
- No push
- No subsequent phase implementation

## Prerequisites for a Future Live Phase

A future live recommendation phase would require:

- A user goals/targets Consumer Runtime read adapter
- An authenticated SELECT grant on a recommendation source table
- A live Supabase restaurant and menu read adapter
- A `dataProvenance: "live"` repository implementation
- An explicit live-read opt-in flag
- Live smoke tests confirming `available` and `empty` states
- Widening `isSampleData` to `false` where applicable (already `boolean` in Phase 2R)

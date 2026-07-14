# Consumer UX Track U1 — Next Meal Flow Prototype

## Scope and product hierarchy

Consumer UX Track U1 is an independent presentation track. Consumer Runtime Phase 2Q has not started. U1 does not define a canonical next-meal domain, formal recommendation repository, runtime service, database contract, algorithm, or write path.

Home keeps three independent, visible actions:

1. `拍照分析` is the strongest primary visual action and opens `/meal-photo?autoOpen=true`.
2. `直接找下一餐` is a secondary action and opens the existing `/recommendation` route.
3. `找飯友` is an equal secondary action and opens `/meal-buddies?section=cards`.

The two secondary actions use the same card component, size, typography, spacing, and interaction treatment. Direct next-meal discovery is not a tiny text link and is not visually weaker than direct Meal Buddy access. Home contains exactly one `/recommendation` entry.

The preferred product journey starts by recording the current meal:

`Home → 拍照分析 → capture/upload → confirm analysis → next-meal candidates → select candidate → confirm or opt into Meal Buddy`

Users may freely skip analysis:

`Home → 直接找下一餐 → /recommendation → select candidate → confirm or opt into Meal Buddy`

The supporting copy may gently explain that recording the current meal can improve future recommendation relevance. It does not claim that the U1 prototype already uses personal intake, and U1 adds no hidden or automatic data collection.

## Presentation-only recommendation boundary

`apps/mobile/features/next-meal-prototype` owns only:

- U1-prefixed presentation ViewModels
- ordered candidate presentation with index zero as the best candidate and later entries as alternatives
- selected and locally confirmed candidate identity
- an explicitly enabled deterministic mock provider
- loading, success, empty, disabled, and error states
- transient presentation-level Meal Buddy prefill
- the shared presentation candidate-count policy extracted from the existing AI Analysis behavior

All candidates are marked `source: "u1_mock"` and `isSampleData: true`. The screen also displays a sample-data badge. Fixed mock ordering and copy do not claim to be a formal recommendation algorithm.

A future formal recommendation system may consider approved canonical inputs such as actual intake, remaining nutrition, eating history, taste preferences, time, location, ratings, and Food Memory. Its integration seam remains:

`formal recommendation result → mapper → U1 presentation ViewModel → presenter → UI`

U1 does not expose Supabase, database rows, Runtime repositories, formal recommendation internals, or future Phase 2Q implementation details to the UI. The U1 ViewModel is not a canonical domain contract.

## Shared Free/Premium candidate-count policy

The previous AI Analysis behavior displayed three candidates for Free and ten for Premium. U1 extracts that existing quantity rule into `nextMealCandidateCountPolicy.ts`; both AI Analysis and direct Home recommendation use this one helper.

- Free: existing Free candidate count
- Premium: existing Premium candidate count
- unknown, missing, or malformed entitlement: normalized to Free
- no second U1 entitlement policy or duplicated numeric limit
- candidate zero is the best prototype result
- later candidates are alternatives
- candidates beyond the active limit are not rendered

This quantity policy does not modify Meal Buddy card quota, matching-candidate counts, invitations, group tables, planned meals, or any social entitlement rule.

## Candidate selection and confirmation

No downstream CTA is actionable until the user explicitly selects a candidate. Selecting or changing a candidate only updates component presentation state.

`這是我的下一餐` applies only to the selected candidate. It remains on `/recommendation`, marks that candidate as `已選定這一餐`, and performs no persistence, planned-meal write, meal-record write, canonical-store write, Supabase operation, or social navigation. Leaving or reloading may reset it.

The existing planned-dinner and nutrition-planning demo remains below the U1 section under a visibly separated heading. U1 confirmation never calls its save behavior.

## Meal Buddy opt-in and transient lifecycle

`用這餐找飯友` is disabled until a candidate is selected. It stages only that candidate as an in-memory presentation prefill and navigates to the existing `/meal-buddies?section=cards` screen.

The Meal Buddy screen consumes the valid token once and opens the existing inline form. Navigation, staging, consumption, form opening, and cancellation do not create a card, consume card quota, consume recommendation quota, set a pending match, save the form, write a planned meal, call Supabase, invoke a write RPC, or mutate social state.

The transient prefill clears on:

- successful one-time consumption by the form
- explicit form cancel
- explicit form save
- missing, malformed, or mismatched token
- unrelated direct Meal Buddy navigation

Only the user's later explicit press on the existing `儲存飯友卡` action may enter the pre-existing local demo save behavior. Direct `/meal-buddies?section=cards` navigation without U1 prefill retains its prior behavior.

## AI Analysis correction

AI Analysis still uses the existing capture/upload and analysis flow. Its next-meal candidate count now calls the shared policy helper. Selecting an Analysis candidate navigates to the same `/recommendation` presentation route and places that candidate first.

Analysis candidate selection no longer creates a Meal Buddy card, consumes quota, sets a pending match, displays a false card-created toast, starts a delayed Meal Buddy redirect, or claims that clicking automatically creates a card.

## Navigation constraints

U1 reuses `/recommendation` for both direct Home discovery and Analysis-origin candidate selection. It does not add a recommendation-result route. Photo analysis, direct next-meal discovery, and direct Meal Buddy access remain independent.

## Validation

- Mobile, root, Restaurant Web, and Admin Web typechecks
- U1 guard and deterministic local smoke
- Consumer Runtime Phase 2P guard, default smoke, and mock smoke
- `npm ls`
- `git diff --check` and `git diff --cached --check`
- migration/schema inventory and generated-artifact review
- final branch, HEAD, status, stat, and name-status inventory before any commit

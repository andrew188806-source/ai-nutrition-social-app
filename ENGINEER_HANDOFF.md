# Engineer Handoff

## Current State

This repo is an investor-demo MVP, not a production app. The experience is mock-only and intentionally avoids real auth, payment, realtime chat, ordering, QR, medical diagnosis, or production AI calls.

User-facing UI copy lives in `lib/i18n/zh-TW.ts`. Keep TypeScript variables, route names, function names, database fields, and API plans in English.

## Module Boundaries

Keep route files thin. Put feature state, mock business rules, and reusable UI inside feature folders.

Current important boundaries:

- `apps/mobile/app`: Expo Router route screens.
- `apps/mobile/components`: shared mobile UI primitives.
- `apps/mobile/features/analysis`: AI nutrition analysis, correction state, ingredient breakdown, and save-target UI rules.
- `packages/shared/src/domain`: domain policies that should survive backend replacement.
- `packages/shared/src/types.ts`: shared TypeScript contracts.
- `packages/shared/src/mock`: mock data grouped by domain.
- `lib/i18n/zh-TW.ts`: all Traditional Chinese UI copy.

Target future domains:

- `analysis`: AI nutrition analysis, ingredient breakdown, nutrition recalculation, correction logic.
- `food-memory`: user meal history, reusable nutrition patterns, save/load logic.
- `restaurant-data`: restaurant nutrition profile, menu nutrition cache, restaurant/location context, reusable restaurant intelligence.
- `social`: meal buddy matching, direct search, four-person tables, friend list, premium/free visibility.
- `self-cooked`: personal cooking flow, ingredient training data, personal notes/reviews.

## AI Analysis Module

The analysis screen was cleaned up so future engineers do not have to untangle route UI from correction logic.

Start here:

- `apps/mobile/app/analysis.tsx`: page composition only.
- `apps/mobile/features/analysis/useAnalysisCorrectionState.ts`: mock local state and transitions.
- `apps/mobile/features/analysis/AnalysisCorrectionPanels.tsx`: external dining and self-cooked correction UI.
- `apps/mobile/features/analysis/analysisCorrectionData.ts`: correction section builders and mock recalculation values.
- `apps/mobile/features/analysis/types.ts`: local analysis types.

When replacing mock behavior with a backend, keep the screen API stable and replace the hook/helper internals first.

## Data Separation

External dining and self-cooked data pipelines must stay separate.

External dining correction contributes to the user's Food Memory, user meal history, and shared ingredient-recognition intelligence. Consumer-app corrections should not directly mutate restaurant/menu intelligence. Restaurant nutrition profile, restaurant nutrition cache, menu nutrition cache, and restaurant/location context should be updated from restaurant-owned dashboard workflows or future verified review pipelines.

Self-cooked correction contributes to shared ingredient-recognition intelligence and personal nutrition estimation only. Production records may persist to Food Memory, user meal history, the shared AI ingredient analysis training module, and reusable ingredient estimation patterns only.

Never write self-cooked meals into restaurant nutrition profile, restaurant nutrition cache, restaurant/location context, or menu nutrition cache.

The shared policy lives in `packages/shared/src/domain/dataBoundaries.ts`. Use `getNutritionCorrectionSaveTargets` and `assertSelfCookedTargetsDoNotUseRestaurantData` as the future server-side contract when wiring Supabase or API writes.

Social matching priority lives in `packages/shared/src/domain/socialMatchingPolicy.ts`. Keep restaurant overlap, health goals, tags, and nearby status as explicit matching signals instead of burying them in UI components.

## Product Flow Rules

Nutrition calculation and social discovery are dual-core pillars.

Correct flow:

1. AI analysis.
2. Meal confirmation.
3. Food Memory save.
4. Delayed feedback.
5. Restaurant recommendation.
6. Contextual meal buddy matching.
7. Friend interaction.
8. Optional four-person table.

Do not make Community Card a generic feed. It is a food-social matching profile.

Direct meal buddy search is allowed as a shortcut, but contextual matching from meal/restaurant data remains the main product story.

## Social Mock Flow

Mock-only flow:

`Community Card -> Nearby Matching -> Send Meal Invite -> Meal Buddy List -> Chat Window -> Plan Meal CTA`

Relevant routes:

- `apps/mobile/app/community-card.tsx`
- `apps/mobile/app/meal-buddies.tsx`
- `apps/mobile/app/chat.tsx`
- `apps/mobile/app/group-tables.tsx`

No realtime backend, WebSocket, friend graph persistence, moderation backend, or notification system exists yet.

## External Dining Cost Control

External dining should stay lightweight by default. Do not run full ingredient breakdown on every restaurant meal.

Default path:

- Restaurant/menu matching.
- Food Memory and similar meal lookup.
- Stored nutrition estimates.
- Restaurant/menu cache.
- Mock nutrition dataset.

AI-assisted ingredient breakdown is on-demand only after è£œå?é¤é?è³‡æ?, ?°å?é£Ÿæ?, or ä¿®æ­£. Future production should reserve expensive AI breakdown for low-confidence matches, missing menu data, or explicit user correction.

## Mock Data

Mock data should remain grouped by domain under `packages/shared/src/mock`.

Important current mock files:

- `demoData.ts`
- `tags.ts`
- `socialDiscovery.ts`
- `foodMemory.ts`
- `restaurantPhase4.ts`
- `precisionIdentification.ts`
- `phase45Nutrition.ts`
- `externalDiningFlywheel.ts`
- `adminGovernance.ts`

Production engineers should replace mock arrays with Supabase queries, server-side authorization, and RLS-backed data access.

## Production Replacement

Replace in this order:

1. Supabase schema and RLS.
2. Auth and profile onboarding.
3. Food Memory persistence.
4. Secure meal analysis and identification Edge Functions.
5. Restaurant/menu nutrition cache.
6. Community Card and meal buddy persistence.
7. Chat, blocking/reporting, moderation, and notifications.
8. Subscriptions and payment.
9. Sponsored campaign manager.
10. Admin audit logs and governance workflows.

## Demo Startup

```powershell
cd "D:\haocu app\ai-nutrition-social-mvp"
npm.cmd run demo
```

## Current Demo Handoff Addendum

### Current Social Page Structure

`apps/mobile/app/meal-buddies.tsx` is the intended social shell. It owns four top sections:

1. §ä¶º¤Í
2. §Úªº¶º¤Í
3. ¶º§½
4. ¥|¤HÀ\®à

¥|¤HÀ\®à intentionally stays inside the ¶º¤Í page top sections. Do not reintroduce an intermediate "enter four-person table" page or route that removes these tabs. `apps/mobile/app/group-tables.tsx` is kept only as a compatibility redirect to `/meal-buddies?section=tables`; the reusable content is exported as `GroupTablesContent`.

### Shared Meal Buddy Card Model

AI ¤ÀªR¥d¡B¦Û­q¥d¡BÀ\ÆU¥d use one shared card store and one shared recommendation/ranking system in `apps/mobile/features/meal-buddy-card`.

- `sourceType` and `cardType` control labels and prefilled fields only.
- Free/Paid are the same system: membership mode controls limits, masking, avatar/profile visibility, selection behavior, and upgrade prompts.
- Do not create separate Free/Paid routes or separate card systems.

### Generated Content Rule

Creating, updating, expanding, or generating content should keep the current page stable, reveal the new content, scroll to it, and briefly highlight it where practical. Avoid intermediate pages and avoid hiding unrelated sections.

### Removed Obsolete Route Files

These old route files were removed because the current product structure keeps these behaviors inside `/meal-buddies`:

- `apps/mobile/app/meal-buddy-discovery.tsx`: old independent recommendation result page.
- `apps/mobile/app/my-meal-buddies.tsx`: old independent My Meal Buddies page.
- `apps/mobile/app/meal-buddy-chats.tsx`: old independent chat page.

Do not restore these unless the product explicitly returns to separate route-based social flows.

### Food Diary

`apps/mobile/app/meal-log.tsx` is the unified user-facing record section. It replaces the previous user-facing split between À\ÂI¬ö¿ı and Àç¾i¬ö¿ı. AI analysis and Today Intake may show real-time current-day status, but long-term daily cards, meal detail cards, monthly cards, favorite cards, and ranking cards belong in ¬ü­¹¤é°O.

### Current Mock Limitations

The following are still frontend mock/demo behavior: AI image analysis result, recommendations, profile data, fake profile photos, quotas, chat send, table invites, restaurant save, and Food Diary sharing. No production persistence, realtime chat, payment, push notification, moderation, or image upload backend is wired yet.

### Demo Testing Utilities

DEMO ONLY. REMOVE / DISABLE FOR PRODUCTION.

The mobile home page includes a small Demo æ¸¬è©¦å·¥å…· section when `NODE_ENV !== "production"` and `EXPO_PUBLIC_ENABLE_DEMO_TOOLS !== "false"`.

The mock date lives in `apps/mobile/features/demo-time/demoTimeStore.ts`:

- `getEffectiveCurrentDate()` returns the demo clock.
- `getEffectiveDateKey()` returns the YYYY-MM-DD key used by daily demo calculations.
- `advanceDemoTimeByDays(1)` powers `æ¨¡æ“¬æ˜å¤©`.
- `advanceDemoTimeByDays(7)` powers `æ¨¡æ“¬ä¸€é€±å¾Œ`.
- `resetDemoTime()` powers reset behavior.

Current wired demo effects:

- Meal Buddy daily visible limits reset when `getEffectiveDateKey()` changes.
- Meal Buddy seen-candidate sets reset when the demo day changes.
- Meal Buddy pending / declined invitation expiry reads from `getEffectiveCurrentDate()` instead of device time.
- Meal Buddy active cards and recommendation results use localStorage so page refresh can test persistence.
- `é‡ç½®æ¸¬è©¦è³‡æ–™` clears Meal Buddy cards, recommendation results, social previews, and mock date.

Production must hide or disable:

- `æ¨¡æ“¬æ˜å¤©`
- `æ¨¡æ“¬ä¸€é€±å¾Œ`
- `é‡ç½®æ¸¬è©¦è³‡æ–™`

Future backend integration should move this behind a dev-only flag or remove it entirely.

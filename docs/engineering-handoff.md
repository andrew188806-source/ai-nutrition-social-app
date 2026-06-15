# Engineering Handoff

## Project Overview

This repository is a mock-first MVP for AI-assisted nutrition, food memory, restaurant discovery, and meal-buddy social flows. It is a monorepo with:

- `apps/mobile`: Expo Router application and the primary MVP demo.
- `apps/restaurant-web`: Next.js restaurant operations surface.
- `apps/admin-web`: Next.js administration surface.
- `packages/shared`: broad backend-facing domain contracts and shared mock foundations.
- `packages/services`: service-adapter boundary.

The current product behavior is intentionally demo-oriented. Preserve working flows while replacing mock stores incrementally.

## Architecture

- Route files in `apps/mobile/app` compose screens, read route context, and coordinate navigation.
- Feature folders in `apps/mobile/features` own domain types, reusable rules, mock data, and mutable demo stores.
- `apps/mobile/lib/storage.ts` is the shared persistence adapter. Web uses `localStorage`; native uses an AsyncStorage-backed cache.
- `apps/mobile/components/DemoUi.tsx` and `apps/mobile/theme` contain the current shared presentation primitives.
- Traditional Chinese user-facing copy lives primarily in `lib/i18n/zh-TW.ts`.

See [navigation-map.md](./navigation-map.md) and `apps/mobile/features/README.md` for ownership details.

## Major Feature Modules

| Feature | Primary screens | Feature ownership |
| --- | --- | --- |
| AI Analysis | `meal-photo.tsx`, `analysis.tsx` | `features/analysis` |
| Today Nutrition | `today-intake.tsx`, home summary | analysis meal records + planned meal store |
| Food Memory / 美食日記 | `meal-log.tsx` | meal records plus current archive demo data |
| Meal Buddy | `meal-buddies.tsx` | `features/meal-buddy-card` |
| Chat | internal to `meal-buddies.tsx` | `mealBuddySocialStore.ts` |
| Four-Person Tables | internal to Meal Buddy; compatibility file `group-tables.tsx` | `features/group-tables` + social store |
| Restaurants | `restaurants.tsx` | restaurant page plus shared Meal Buddy/table entry stores |
| Premium | shared preview controls | `features/demo-user-plan` |
| My Page / Profile | `me.tsx`, Community Card routes | `features/community-card-settings` |
| Settings | `permissions.tsx`, Community Card settings | profile/settings routes and stores |

## Type Ownership

- AI result and saved-meal types: `apps/mobile/features/analysis/types.ts`
- Meal Buddy card, candidate, and stable social IDs: `apps/mobile/features/meal-buddy-card/types.ts`
- Active four-person table: `apps/mobile/features/group-tables/groupTableStore.ts`
- Community Card settings: `apps/mobile/features/community-card-settings/types.ts`
- Planned meal: `apps/mobile/features/planned-meal/types.ts`
- Broad backend-facing contracts: `packages/shared/src/types.ts`

Avoid adding duplicate page-local types unless they are truly presentation-only.

## Mock Data Strategy

The most important shared social source is:

`Community Profile -> Meal Buddy Candidate -> Matched Buddy -> ChatThread -> MealSession / FourPersonTable`

It is represented by:

- `mealBuddyFlowMock.ts`: canonical demo identities and linked social/session records.
- `mealBuddyCardStore.ts`: mutable Meal Buddy card pool and recommendation state.
- `mealBuddySocialStore.ts`: invitations, matched relationships, chat threads, messages, and session transitions.
- `groupTableStore.ts`: one active hosted table used by restaurant and table flows.

Other mock/state sources:

- `analysisMealRecordStore.ts`: confirmed AI meals used by Today Nutrition and Food Memory.
- `plannedMealStore.ts`: planned dinner and mock settlement.
- `demoUserPlanStore.ts`: Free/Premium rendering mode over the same data.
- `demoTimeStore.ts`: mock date/time behavior.

### Mock Data Still Embedded In Screens

- Restaurant/menu recommendation records remain in `apps/mobile/app/restaurants.tsx`.
- Planned-dinner choice records remain in `apps/mobile/app/meal-photo.tsx`.
- Food Memory and several presentation datasets remain in `lib/i18n/zh-TW.ts`.

These should move only when their API contracts are defined; moving them now would create unnecessary regression risk.

## Integration Entry Points

Search for `Integration entry`, `Backend integration entry`, or `TODO(engineering)`.

- Restaurant -> Meal Buddy Card: restaurant screen to Meal Buddy card store.
- Restaurant -> Four-Person Table: restaurant screen to group-table store.
- AI Analysis -> Today Intake: analysis screen to meal-record store.
- AI Analysis -> Meal Buddy Card: analysis screen to Meal Buddy card store.
- Planned Dinner -> Today Intake: planned-meal store.
- Meal Session -> ChatThread: Meal Buddy social store.
- Four-Person Table -> GroupChatThread: Meal Buddy social store.

Replace store internals with API/service calls while keeping stable IDs and page call sites intact where possible.

## Known Limitations And Risky Areas

- `meal-buddies.tsx`, `group-tables.tsx`, `restaurants.tsx`, and `meal-log.tsx` are large. Extract only behaviorally stable sections; do not rewrite them in one pass.
- Chat, invitation, and session state is mock/local state. Production requires authenticated persistence, realtime delivery, moderation, and notifications.
- Some fallback matching remains name-oriented in legacy/demo paths. New integrations must use IDs.
- AsyncStorage hydration is asynchronous while several demo stores expose synchronous reads; native cold-start persistence needs a proper hydration lifecycle.
- `/social` is a reachable legacy route. `/group-tables` is a compatibility route. Remove neither until all callers are migrated and verified.
- `features/nutrition-memory` is not directly routed today. Confirm product ownership before removing or expanding it.
- Free and Premium are demo modes over shared data, not separate systems.

## Next Engineering Priorities

1. Add authenticated API adapters behind the existing store boundaries.
2. Add an explicit native hydration/loading lifecycle for persisted stores.
3. Split the largest route files by stable internal section without changing behavior.
4. Move restaurant/menu and Food Memory mock datasets into owning features once API contracts exist.
5. Migrate remaining `/social` callers into the unified Meal Buddy shell.
6. Add automated flow tests for analysis -> intake, invitations -> chat/session, and restaurant -> Meal Buddy/table.

## Verification

From the repository root:

```powershell
npm.cmd run typecheck
npx.cmd tsc -p apps/mobile/tsconfig.json --noEmit
npx.cmd tsc -p apps/restaurant-web/tsconfig.json --noEmit
npx.cmd tsc -p apps/admin-web/tsconfig.json --noEmit
npx.cmd tsc -p apps/mobile/tsconfig.json --noEmit --noUnusedLocals --noUnusedParameters
```

The root `npm run typecheck` does not currently include app-level tsconfigs. No lint script currently exists. Add tooling only after agreeing on rules so it does not churn the entire MVP.

## Handoff Safety Rules

- Preserve stable IDs: `profileId`, `buddyId`, `cardId`, `sessionId`, `tableId`, `chatThreadId`, `restaurantId`.
- Do not create a second chat, profile, Meal Buddy card, or four-person-table data system.
- Keep planned meals visually and semantically distinct from confirmed consumed meals.
- Keep user-facing copy in Traditional Chinese.
- Avoid deleting uncertain legacy routes/components; document and migrate callers first.

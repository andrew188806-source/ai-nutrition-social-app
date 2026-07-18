# Consumer Runtime Phase 2X-E — Mobile Favorites Cutover

Status: local implementation only. Phase 2X-D-B is Frozen. This plan does not authorize a Supabase connection, migration deployment, credential-backed smoke, or Freeze.

## Scope

Phase 2X-E wires the existing Consumer Favorites runtime (Phase 2X-D) into the three mobile UI routes that previously used fake local state for restaurant and food-item favoriting. No new backend work, migrations, or RPCs belong to this phase.

## New files

- `apps/mobile/features/consumer-favorites/consumerFavoriteComposition.ts` — public Mobile boundary: `createMobileConsumerFavoriteComposition()` following the same factory pattern as the Rating composition.
- `apps/mobile/features/consumer-favorites/consumerFavoriteTargetMapper.ts` — `mapConsumerFavoriteTarget()`: rejects `fav-*` IDs, bare array indices, and empty strings; only passes non-empty opaque canonical IDs.
- `apps/mobile/features/consumer-favorites/consumerFavoriteUiModel.ts` — two hooks: `useConsumerFavoritedRestaurants` (load-all-then-toggle for the restaurant list page) and `useConsumerFavoriteList` (paginated list for the meal-log favorites section).

## Modified files

- `apps/mobile/app/restaurants.tsx` — `savedRestaurants` local state removed; live `useConsumerFavoritedRestaurants` hook wired up; toggle calls `service.addCurrentUserFavorite` / `service.removeCurrentUserFavorite` pessimistically; button labels from `zhTW.mobile.consumerFavorites`.
- `apps/mobile/app/meal-log.tsx` — static `diary.favoriteCards` scroll removed; replaced with live `useConsumerFavoriteList({ entityType: "menu_item" })` rendering `LiveFavoriteFoodCard` from `ConsumerFavoriteRecord`; per-meal-detail `mealFavoriteIds` state retained as local-only (meal record IDs are not canonical Favorites targets); `FavoriteCard` type and `toggleFavorite` helper removed.
- `apps/mobile/app/me.tsx` — profile stat card value changed from `${diary.favoriteCards.length} 道` to `zhTW.mobile.consumerFavorites.profileCountSummary`; live count not available without a network call.
- `lib/i18n/zh-TW.ts` — `mobile.consumerFavorites` section added: toggling, active, inactive, removed, targetUnavailable, loginRequired, disabled, failed, loading, empty, profileCountSummary, listTitle.

## Mutation strategy

Pessimistic: the service call completes before the UI state updates. Duplicate-tap protection via `isMutating` ref in `useConsumerFavoritedRestaurants`. Generation counter in `useConsumerFavoriteList` cancels stale responses.

## Self-made meal exclusion

Meal detail cards (`MealFoodCard`) retain a local-only `mealFavoriteIds` toggle because meal record IDs are not canonical restaurant or menu-item targets. Self-made dishes have no canonical identity and cannot be routed through the Favorites service.

## Environment and flag behavior

`EXPO_PUBLIC_TASTKIND_CONSUMER_FAVORITES_READ_SOURCE` and `EXPO_PUBLIC_TASTKIND_CONSUMER_FAVORITES_WRITE_SOURCE` default to `"disabled"` in the absence of explicit configuration. When both are disabled the list hook enters `"disabled"` status and the UI shows `zhTW.mobile.consumerFavorites.disabled`. No Supabase connection is attempted in that mode.

## Safe invocation modes

- Default UI: shows `disabled` / `unauthenticated` / `loading` states when the service is not configured.
- Development mobile smoke default: returns `skipped`, performs no compilation, network request, or database operation.
- Development mobile smoke `--dry-run`: uses the mock composition (flags: read/write = mock, actorId = fake) to verify hooks correctly reflect add, list, and remove results without any network access.

## Exclusions

Phase 2Y, N4, Production, remote deployment, Supabase connections, service_role, and Phase 2X-D-B frozen runner/guard remain outside Phase 2X-E.

# Navigation Map

The mobile app uses Expo Router. Route files own navigation and screen composition; feature folders own reusable rules, types, mock data, and stores.

## Main Tabs

| Main tab | Route | Source file | Owning feature | Current data/mock source | Future integration |
| --- | --- | --- | --- | --- | --- |
| Home | `/` | `apps/mobile/app/index.tsx` | Home / Today Nutrition | analysis records, planned meal store, i18n demo content | home aggregation API |
| AI Analysis | `/meal-photo` | `apps/mobile/app/meal-photo.tsx` | AI Analysis | analysis feature, planned meal store | media upload and analysis API |
| Meal Buddies | `/meal-buddies` | `apps/mobile/app/meal-buddies.tsx` | Meal Buddy / Chat / Four-Person Tables / Meal Sessions | meal-buddy flow mock, card store, social store, group-table store | matching, chat, invitation, session, table APIs |
| Restaurants | `/restaurants` | `apps/mobile/app/restaurants.tsx` | Restaurants | page-level restaurant/menu demo data plus shared table/card stores | restaurant, menu, Places, recommendation APIs |
| My Page | `/me` | `apps/mobile/app/me.tsx` | Profile / Premium / Settings entry | Community Card settings and demo plan | profile, subscription, settings APIs |

## Supporting Routes

| Route | User-facing purpose | Source file | Owner / source | Engineer notes |
| --- | --- | --- | --- | --- |
| `/analysis` | review/correct AI result | `apps/mobile/app/analysis.tsx` | `features/analysis` | writes confirmed meals to the shared meal-record store |
| `/today-intake` | current-day consumed and planned intake | `apps/mobile/app/today-intake.tsx` | analysis records + planned meal store | planned meals must remain distinct from consumed meals |
| `/meal-log` | unified Food Memory / 美食日記 archive | `apps/mobile/app/meal-log.tsx` | meal records + i18n demo archive | future retention, favorite, sharing, monthly-report APIs |
| `/recommendation` | next-meal recommendation | `apps/mobile/app/recommendation.tsx` | recommendation demo content | still links to legacy `/social`; migrate carefully |
| `/group-tables` | compatibility redirect and table content implementation | `apps/mobile/app/group-tables.tsx` | group-table store + meal-buddy social store | public entry redirects to `/meal-buddies?section=tables`; do not create another table page |
| `/social` | legacy social preview | `apps/mobile/app/social.tsx` | legacy route | still reachable from recommendation/restaurants; deprecate only after those links migrate |
| `/community-card-settings` | edit Community Card | `apps/mobile/app/community-card-settings.tsx` | Community Card settings store | future profile/privacy API |
| `/community-card` | read-only Community Card preview | `apps/mobile/app/community-card.tsx` | Community Card settings store | keep the viewer and editor on the same profile model |
| `/permissions` | permissions/privacy controls | `apps/mobile/app/permissions.tsx` | profile/settings | future consent and permission API |
| `/health-goal-plan` | health-goal plan | `apps/mobile/app/health-goal-plan.tsx` | profile/goal demo data | future goal-plan API |
| `/login` | demo login placeholder | `apps/mobile/app/login.tsx` | placeholder | currently not linked from the main app; keep until auth direction is decided |

## Meal Buddy Internal Navigation

`/meal-buddies` is one shell with four top-level sections:

1. `找飯友`
2. `我的飯友`
3. `四人餐桌`
4. `飯局`

Chat is an internal state under `我的飯友 -> 聊天`; there is no standalone chat route. Normal meal sessions reference a one-on-one `chatThreadId`. Formed four-person tables reference a `groupChatThreadId`.

Restaurant integration enters the same shell through route context:

- Restaurant -> Meal Buddy Card: opens `找飯友` and focuses the created restaurant card.
- Restaurant -> Find Four-Person Table: opens `四人餐桌` in restaurant-search mode.
- Restaurant -> Create Four-Person Table: opens the existing table draft/replacement flow.

## Navigation Safety Notes

- Do not introduce standalone chat, recommendation-result, or four-person-table landing pages.
- Preserve route context IDs rather than matching records by display name.
- Treat `/group-tables` and `/social` as compatibility/legacy routes until all callers are migrated and verified.

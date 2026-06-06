# Engineer Handoff

## Current Demo Architecture

The mobile demo uses Expo Router. Route files in `apps/mobile/app` compose screens; reusable mock rules and state live in `apps/mobile/features`.

Core mobile routes:

- `/meal-photo`: AI analysis entry and planned-dinner helper.
- `/analysis`: correction/confirmation flow; writes confirmed meals to Today Intake.
- `/today-intake`: current-day consumed and planned nutrition view.
- `/meal-log`: unified user-facing Food Diary archive.
- `/restaurants`: recommendation list and restaurant action entry points.
- `/meal-buddies`: the social shell for 找飯友 / 我的飯友 / 四人餐桌 / 飯局.
- `/group-tables`: compatibility redirect into `/meal-buddies?section=tables`; do not build a second table page here.

Chat is intentionally centralized inside `我的飯友 -> 聊天` on `/meal-buddies`. There is no standalone chat route.

## Shared Demo Data And Stores

`apps/mobile/features/meal-buddy-card/mealBuddyFlowMock.ts` is the shared demo identity/session source:

`Community Profile -> Matched Buddy -> Chat Thread -> Meal Session / Four-Person Table`

Stable IDs link records:

- `profileId`: community identity.
- `buddyId`: matched relationship.
- `chatThreadId`: direct chat.
- `tableId`: four-person table.
- `groupChatThreadId`: formed-table group chat.

`mealBuddySocialStore.ts` is the single chat/invitation store. Direct chats are canonicalized by `buddyId`; group chats are canonicalized by `tableId`.

Other shared stores:

- `mealBuddyCardStore.ts`: active card pool, recommendation request, and demo quota state.
- `groupTableStore.ts`: one active hosted four-person table.
- `analysisMealRecordStore.ts`: latest confirmed AI meal used by Today Intake and Food Diary.
- `plannedMealStore.ts`: planned dinner, confirmed dinner, and mock auto-settlement.
- `demoUserPlanStore.ts`: shared Free/Premium demo view.
- `demoTimeStore.ts`: shared mock clock for expiry and next-day behavior.

## Backend Integration Entry Points

Search for `Integration entry` or `Backend integration entry`.

- Restaurant -> Meal Buddy Card: `restaurants.tsx`, `mealBuddyCardMock.ts`.
- Restaurant -> Four-Person Table: `restaurants.tsx`, `groupTableStore.ts`.
- AI Analysis -> Today Intake: `analysis.tsx`, `analysisMealRecordStore.ts`.
- AI Analysis -> Meal Buddy Card: `analysis.tsx`, `mealBuddyCardMock.ts`.
- Planned Dinner -> Today Intake: `plannedMealStore.ts`.
- Meal Session -> ChatThread: `mealBuddySocialStore.ts`.
- Four-Person Table -> GroupChatThread: `mealBuddySocialStore.ts`.

These are mock/local-state boundaries. Replace their internals with backend calls while keeping page-level call sites stable where possible.

## Mock-Only Flows

- AI image recognition and nutrition calculation.
- Meal Buddy ranking, quotas, invitations, and recommendation persistence.
- Chat messages, ordering, group-chat formation, and expiry.
- Four-person table creation, replacement, and participant management.
- Planned dinner estimate and next-day settlement.
- Restaurant recommendation scoring and restaurant actions.
- Food Diary retention, sharing, and membership previews.

## Known TODOs

- Move mutable demo stores to authenticated backend persistence.
- Replace localStorage with API/cache adapters.
- Add realtime chat, notifications, blocking/reporting, and moderation.
- Add production AI analysis and verified restaurant/menu nutrition data.
- Replace mock four-person group-chat expiry with scheduled backend cleanup.
- Split the large `meal-buddies.tsx` route into feature components after product behavior stabilizes; avoid changing behavior during that extraction.
- Keep user-facing copy in `lib/i18n/zh-TW.ts` when touching related UI.

## Safety Notes

- Free and Premium are rendering/limit modes over the same data sources, not separate systems.
- AI 分析卡、自訂卡、餐廳卡 share the same Meal Buddy Card model.
- Normal meal sessions and four-person tables open threads from the shared chat store.
- `/group-tables` remains only for old links; real table content stays inside `/meal-buddies`.
- Do not reintroduce standalone chat, recommendation-result, or four-person-table landing pages.

## Verification

```powershell
cd "D:\haocu app\ai-nutrition-social-mvp"
npm.cmd run typecheck
```

Expo was intentionally not started during the handoff cleanup pass.

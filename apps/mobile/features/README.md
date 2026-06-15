# Mobile Feature Ownership

Route files in `apps/mobile/app` compose screens and handle navigation. Domain types, reusable rules, mock data, and mutable demo state belong in the feature folders listed below.

| Feature folder | Current ownership | Primary mock/store | Future API boundary |
| --- | --- | --- | --- |
| `analysis` | AI correction, confirmed meal records, nutrition summary | `analysisCorrectionData.ts`, `analysisMealRecordStore.ts` | image analysis, correction, meal records |
| `planned-meal` | planned dinner and mock next-day settlement | `plannedMealStore.ts` | planned meals, scheduled settlement |
| `meal-buddy-card` | cards, candidates, matching, invitations, chats, sessions | `mealBuddyFlowMock.ts`, `mealBuddyCardStore.ts`, `mealBuddySocialStore.ts` | matching, invitations, realtime chat, sessions |
| `group-tables` | active hosted four-person table | `groupTableStore.ts` | table lifecycle and realtime participants |
| `community-card-settings` | editable Community Card/profile preferences | `communityCardSettingsStore.ts` | profile and privacy settings |
| `demo-user-plan` | shared Free/Premium demo mode | `demoUserPlanStore.ts` | subscription entitlement service |
| `demo-time` | mock clock used by expiry/settlement demos | `demoTimeStore.ts` | server time and scheduled jobs |
| `self-made-dishes` | self-cooked meal presets | feature store and types | saved recipes/dishes |
| `nutrition-memory` | older reusable nutrition-memory cards | feature components and types | evaluate before expanding; currently not routed directly |

## Working Rules

- Keep stable identifiers consistent: `profileId`, `buddyId`, `cardId`, `sessionId`, `tableId`, `chatThreadId`, and `restaurantId`.
- Do not add page-local user, chat, session, or table arrays when a shared feature source already exists.
- Keep Community Profile -> Candidate -> Matched Buddy -> ChatThread -> MealSession / GroupTable relationships intact.
- User-facing copy belongs in `lib/i18n/zh-TW.ts`; domain mock records should move into the owning feature before backend integration.
- Existing shared presentation primitives live in `apps/mobile/components/DemoUi.tsx` and `apps/mobile/theme`. Add a new abstraction only when a pattern is repeated and behaviorally identical.
- Treat `apps/mobile/app/group-tables.tsx` as the compatibility route plus the current table-content implementation. Do not create a second table system.

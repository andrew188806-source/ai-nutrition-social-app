# 007 Frontend State and Data Fetching

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document defines frontend data fetching and state patterns.

## Data Sources

### Demo/local

- Mock repositories.
- Storage adapter.
- Seeded realistic demo data.

### Real backend

- Supabase reads.
- Edge Function writes.
- Signed storage URLs where needed.

## Fetching Strategy

- Page-level hooks fetch page data.
- Feature hooks manage feature-specific operations.
- Components receive typed props.
- Derived values are computed through selectors/helpers.

## Suggested Hooks

- `useTodayMeals`
- `useAIAnalysis`
- `useMealBuddyCards`
- `useMealBuddyCandidates`
- `useChatThreads`
- `useGroupTables`
- `useRestaurants`
- `usePremiumEntitlements`
- `useStorageAdapter`

## Optimistic Updates

Allowed for:

- Chat message send.
- Expanding/collapsing UI.
- Local draft saves.

Use carefully for:

- Invitation accept.
- Group Table join.
- Meal Buddy card creation.

Do not fake success permanently when backend rejects due to limits/permissions.

## Cache Invalidation

After:

- AI confirmation → refresh meal records/today summary.
- Meal Buddy card creation → refresh own cards and limits.
- Invitation response → refresh matches/chat.
- Chat send → update thread list last message.
- Group Table join/leave → refresh table participants.

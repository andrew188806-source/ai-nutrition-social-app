# Engineer Onboarding

## Product Summary
Haocu is an AI nutrition and restaurant recommendation app with a meal-buddy social layer. The MVP focuses on Taiwan external dining users, demo-friendly flows, and clean mobile UI.

## Stack Assumptions
- Mobile: Expo React Native, TypeScript, Expo Router
- Restaurant/Admin: Next.js, TypeScript, Tailwind
- Backend: Supabase Auth, Postgres, Storage, Edge Functions
- i18n: Traditional Chinese source file, no hard-coded English UI

## Development Principles
- Work from PRD and data model documents before editing UI.
- Do not invent new product behavior.
- Prefer clean, uncluttered screens over dense feature exposure.
- Keep mock data centralized and traceable.
- Make state transitions explicit: analysis, correction, saved meal, meal buddy card, invite, match, chat, table.

## Ready-to-Start Tasks
- Fix mobile TypeScript errors.
- Replace `latestCorrectedMealRecord` with a real meal-record collection.
- Implement storage adapter: localStorage for web, AsyncStorage for native.
- Verify chat list sorting by latest message timestamp.
- Verify restaurant card meal-buddy creation navigation.

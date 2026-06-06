# Architecture

This MVP uses a monorepo with three product surfaces:

- Expo mobile app for the main user journey.
- Next.js restaurant dashboard for restaurant operations and monetization proof.
- Next.js admin dashboard for review, governance, and platform control.

Shared concerns live outside individual apps:

- `lib/i18n/zh-TW.ts` stores user-facing Traditional Chinese copy.
- `packages/shared` stores domain types and mock data foundations.
- `packages/services` stores mock-first service adapters.
- `supabase/schema.sql` documents the first database shape.

Phase 1 deliberately avoids full feature logic. The goal is clickable placeholders and clean seams for later phases.

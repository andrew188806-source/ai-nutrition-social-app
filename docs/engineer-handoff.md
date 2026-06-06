# Engineer Handoff

## Phase 1 Status

The repository now has an initial monorepo foundation with mobile, restaurant web, admin web, shared types, i18n, mock data, placeholder service adapters, and a Supabase schema skeleton.

## Current Mocks

- Auth is a placeholder.
- AI nutrition analysis returns mock values only.
- Supabase client is not wired to `@supabase/supabase-js`.
- Payment, ads, QR, and push notifications are placeholder functions.
- Restaurant verification and admin review flows are clickable pages only.

## Replacement Notes

- Replace `createSupabaseClientPlaceholder` with a real Supabase client once credentials and RLS are ready.
- Replace placeholder service functions with Supabase Edge Functions or API routes.
- Seed `tags` from `packages/shared/src/mock/tags.ts`.
- Keep all UI copy in `lib/i18n/zh-TW.ts`.
- Keep social discovery visible as a primary mobile flow in later phases.

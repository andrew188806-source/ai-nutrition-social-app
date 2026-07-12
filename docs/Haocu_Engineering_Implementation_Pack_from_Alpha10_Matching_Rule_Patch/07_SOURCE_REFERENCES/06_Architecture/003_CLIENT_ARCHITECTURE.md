# 003 Client Architecture

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document defines the client-side architecture for Haocu's mobile app, restaurant console, and admin console.

## Client Surfaces

### Mobile App

Technology baseline:

- Expo React Native.
- TypeScript.
- Expo Router.
- Centralized Traditional Chinese i18n.
- Shared component primitives from `theme/components`.
- Cross-platform storage adapter for web/native demo state.

Core routes:

- `/` home dashboard.
- `/ai-analysis` AI meal analysis.
- `/today-intake` full nutrition report.
- `/food-diary` diary, scores, and saved meals.
- `/meal-buddies` Meal Buddy cards, matched users, chat entry, group table entry.
- `/restaurants` restaurant recommendation and restaurant cards.
- `/profile` profile, social card, premium, verification.

### Restaurant Web Console

Technology baseline:

- Next.js.
- TypeScript.
- Tailwind.
- Supabase Auth and role-restricted APIs.

Core routes:

- `/restaurant/login`
- `/restaurant/dashboard`
- `/restaurant/menu`
- `/restaurant/menu/:menuItemId`
- `/restaurant/nutrition-disclosure`
- `/restaurant/group-tables`
- `/restaurant/verification`

### Admin Console

Technology baseline:

- Next.js.
- TypeScript.
- Tailwind.
- Admin-only access through role policies.

Core routes:

- `/admin/dashboard`
- `/admin/restaurants/reviews`
- `/admin/nutrition/reviews`
- `/admin/users/reports`
- `/admin/audit-logs`
- `/admin/config`

## State Ownership

Client state is divided into:

1. **Remote source-of-truth state** — Supabase tables and APIs.
2. **Session state** — auth session, role, user profile, premium entitlements.
3. **UI state** — selected tab, expanded cards, filters, loading state.
4. **Draft state** — unsaved meal correction, Meal Buddy card draft, restaurant menu edit draft.
5. **Demo fallback state** — mock data used only for demo/local mode.

## UI Architecture Principles

- Keep pages clean, tidy, and visually uncluttered.
- Avoid duplicate actions with overlapping meanings.
- Avoid deep routing when a direct action is clearer.
- Use consistent card hierarchy for AI result, Meal Buddy card, restaurant card, and social card.
- Empty/loading/error states must be explicit, not blank screens.

## Client Data Fetching

MVP can use direct Supabase client reads for low-risk public data, but state-changing operations should go through backend service functions when they involve:

- Usage limits.
- Premium entitlement checks.
- Invitations.
- AI analysis job creation.
- Restaurant verification.
- Admin review.
- Audit log creation.

## Navigation Rules

- Home AI analysis shortcut should enter the camera/upload analysis flow directly.
- Meal Buddy home shortcut should enter existing Meal Buddy card context, not an unnecessary landing page.
- Restaurant card “建立飯友卡” must create or draft a card and then bring the user to the card/list context where the result is visible.
- Chat return behavior must return to the chat list tab, not matched-users tab.


## Cross-document Traceability

This document must remain aligned with:

- `01_Product/005_MVP_SCOPE.md`
- `02_PRD/001_MOBILE_APP_PRD.md`
- `02_PRD/002_AI_ANALYSIS_PRD.md`
- `02_PRD/005_MEAL_BUDDY_PRD.md`
- `03_AI/008_DATABASE_FIRST_AI_POLICY.md`
- `04_Data/001_DATA_MODEL_OVERVIEW.md`
- `05_UI/001_UI_PRINCIPLES.md`

When implementation changes, update PRD, data model, UI state, API contract, and acceptance criteria together.


## Acceptance Criteria

- Engineers can identify the responsible app, service, table, and route before coding.
- The MVP boundary is explicit and does not silently include post-MVP features.
- Free/Premium behavior is testable without reading product chat history.
- AI outputs are treated as estimates and can be corrected by the user.
- Privacy, consent, and RLS constraints are visible at the implementation layer.


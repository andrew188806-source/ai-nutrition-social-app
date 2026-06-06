# API Plan

## Future Supabase / Edge Functions

- `POST /meal-analysis`: secure OpenAI call for nutrition estimation.
- `POST /meal-identification`: photo + district + restaurant/menu candidate matching.
- `POST /food-memory`: persist confirmed or corrected meal.
- `GET /recommendations/next-meal`: tag and goal based next-meal recommendation.
- `GET /social/community-cards`: nearby meal matching cards respecting privacy.
- `POST /social/invites`: send meal invite.
- `GET /social/meal-buddies`: list accepted or pending meal buddies.
- `GET /social/chats/:id`: load chat thread.
- `POST /social/chats/:id/messages`: send message after safety checks.
- `POST /social/reports`: report or block unsafe interactions.
- `POST /social/unlocks`: Premium profile unlock flow.
- `GET /restaurants/recommendations`: verified and sponsored restaurant cards.
- `POST /admin/reviews/*`: restaurant, menu, ad, tag and governance reviews.
- `POST /audit/logs`: append-only audit and data access logs.

## Current MVP

All social connection screens are mock UI only. There is no real-time backend, WebSocket, notification system, friend graph or message persistence.
## Phase 6 API Planning Corrections

Current MVP remains mock-only. No realtime, WebSocket, notification scheduler, payment backend, reservation backend, ordering system, POS integration, or bill-splitting API has been added.

Future APIs should support:
- Meal analysis result persistence.
- Delayed feedback scheduling with configurable timing windows.
- Feedback events: rating, note, revisit intent, and consented improvement data.
- Intentional meal buddy search requests triggered by meal, restaurant, or explicit nearby action.
- Compatibility scoring using restaurant overlap, health goals, tags, distance, and meal payment preference.
- Community Card publishing as a matching profile, not a feed post.
- Friend graph, chat, blocking/reporting, moderation queues, and notifications.
- Four-person table invite and expansion states with AA-only policy.

Payment preference fields should be treated as social preference metadata. Real AB itemized splitting should only be designed in a future ordering/payment phase after POS and order-item data exist.

## External Dining Nutrition Strategy

Production external dining analysis should be database-first:
- Match restaurant and menu item.
- Reuse restaurant menu nutrition records.
- Reuse similar meal records and Food Memory.
- Read from cached nutrition profiles before calling AI.

AI-assisted ingredient breakdown should be an on-demand correction API, not the default path. Trigger it only when users tap `Ë£úÂ?È§êÈ?Ë≥áÊ?`, `?∞Â?È£üÊ?`, or `‰øÆÊ≠£`, when restaurant data is missing, or when confidence is too low.

Recommended future APIs:
- `GET /restaurants/:id/menu-nutrition`
- `POST /meal-analysis/database-match`
- `POST /meal-analysis/ingredient-breakdown`
- `POST /meal-analysis/corrections`

Cache repeated restaurant/menu nutrition estimates to reduce AI image-analysis cost, token usage, and repeated inference.

Correction completion should eventually persist to:
- Food Memory.
- User meal history.
- Shared AI ingredient analysis training module.
- Restaurant nutrition profile.
- Menu nutrition cache.
- Restaurant/location context.
- Reusable nutrition estimation database.

The restaurant nutrition profile and menu cache should become the first lookup path for repeated restaurant meals. AI ingredient breakdown remains on-demand and should not run for every external dining analysis.

## Architecture Boundary for Backend Replacement

The current mobile AI analysis screen uses a feature module boundary:

- Route composition: `apps/mobile/app/analysis.tsx`.
- Local mock state transitions: `apps/mobile/features/analysis/useAnalysisCorrectionState.ts`.
- Correction data helpers: `apps/mobile/features/analysis/analysisCorrectionData.ts`.
- Correction UI panels: `apps/mobile/features/analysis/AnalysisCorrectionPanels.tsx`.

Future API integration should replace hook/helper internals first. Avoid coupling route components directly to Supabase, OpenAI, restaurant cache writes, or training-data writes.

Shared domain policies should be reused by future API handlers:

- `packages/shared/src/domain/dataBoundaries.ts` for correction save targets.
- `packages/shared/src/domain/socialMatchingPolicy.ts` for matching priority.

Production APIs should enforce these policies server-side: self-cooked corrections never write to restaurant/menu/location caches, and consumer-app restaurant meal adjustments only update the user's own meal record unless the write comes from a restaurant-owned dashboard or verified restaurant workflow.

## Self-Cooked Storage Boundary

Self-cooked meal correction should use a different persistence path from external dining correction.

External dining correction write targets:
- Food Memory.
- User meal history.
- Shared AI ingredient analysis training module.
- Restaurant nutrition profile.
- Restaurant nutrition cache.
- Reusable nutrition estimation database.
- Restaurant/location context.

Self-cooked correction write targets:
- Food Memory.
- User meal history.
- Shared AI ingredient analysis training module.
- Reusable ingredient estimation patterns.

Do not write self-cooked corrections to restaurant nutrition profile, restaurant nutrition cache, restaurant/location context, or menu nutrition cache. Production APIs should enforce this boundary server-side so personal cooking records do not pollute restaurant/menu intelligence.

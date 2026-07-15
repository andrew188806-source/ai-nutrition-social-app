# Roadmap

> **Runtime Integration authority:** The current canonical Runtime Integration phase names, order, ownership boundaries, and freeze rules are defined in [`docs/tastkind-runtime-integration-roadmap.md`](./docs/tastkind-runtime-integration-roadmap.md). The phase schemes below are retained as legacy/general product and demo roadmap context and do not override that canonical runtime roadmap.

## Phase 6 Complete

Investor demo polish, Community Card, mock Meal Buddy List, mock Chat Window and engineer handoff documentation.

## Next Production Phases

1. Supabase schema migration and RLS.
2. Auth and profile onboarding.
3. Real image upload/storage.
4. Secure AI nutrition estimation Edge Function.
5. Restaurant/menu identification with location consent.
6. Community Card backend and privacy enforcement.
7. Friend graph / meal buddy persistence.
8. Real chat infrastructure with moderation and abuse prevention.
9. Blocking, reporting and safety review queue.
10. Push notifications and notification consent.
11. Subscription and payment integration.
12. Sponsored recommendation campaign manager.
13. Admin governance workflow and immutable audit logs.

Broader social feed / interest exploration is intentionally deferred. The current MVP focuses on nearby meal matching.

## Architecture Cleanup Notes

Recent cleanup split the AI analysis route into a feature module:

- `apps/mobile/app/analysis.tsx`
- `apps/mobile/features/analysis/useAnalysisCorrectionState.ts`
- `apps/mobile/features/analysis/AnalysisCorrectionPanels.tsx`
- `apps/mobile/features/analysis/analysisCorrectionData.ts`
- `apps/mobile/features/analysis/types.ts`

Future production phases should continue this pattern for `food-memory`, `restaurant-data`, `social`, and `self-cooked` modules before adding backend complexity.

Before adding more UI, the next cleanup candidates are:

- Extract social matching, friend list, chat, and four-person table state into `apps/mobile/features/social`.
- Extract Food Memory filters and delayed feedback state into `apps/mobile/features/food-memory`.
- Extract restaurant recommendation and restaurant nutrition cache helpers into `apps/mobile/features/restaurant-data`.
- Add server-side implementations that consume `packages/shared/src/domain/dataBoundaries.ts`.
## Phase 6 Correction Roadmap Notes

Before production, add a real delayed feedback system with configurable reminders: 30 minutes, 1 hour, dinner-time reminder, and push notification follow-up. This should be implemented after notification consent, backend jobs, and abuse-safe reminder controls exist.

Social discovery should remain contextual. Future matching services should generate recommendations from explicit triggers, not random feed refreshes.

Future production work:
- Realtime chat and friend graph.
- Blocking, reporting, moderation, and social safety review.
- Push notifications for delayed meal feedback and near-full tables.
- Ordering/POS integration for future AB splitting.
- Payment integration only after restaurant ordering and compliance are scoped.
- Table expansion up to 8 people, never unlimited rooms.

Do not restore QR code as an MVP flow. QR can return later only as part of an ordering-system integration.

## Nutrition Data Flywheel Roadmap

Production should turn external dining corrections into a restaurant nutrition data flywheel:
- Store corrected meals in Food Memory and user meal history.
- Send consented external dining corrections to the shared AI ingredient analysis training module.
- Add a verified restaurant-owned workflow for promoting restaurant dashboard edits into restaurant nutrition profiles.
- Cache menu nutrition estimates for repeated restaurant meals.
- Use restaurant/location context to improve future database-first matching.
- Use AI ingredient breakdown only when users intentionally tap `Ë£úÂ?È§êÈ?Ë≥áÊ?`, `?∞Â?È£üÊ?`, or `‰øÆÊ≠£`, or when future production confidence is too low.

This should reduce token/image-analysis cost over time while increasing restaurant nutrition coverage and repeated meal hit rate.

## Self-Cooked Data Quality Roadmap

Production should keep self-cooked nutrition corrections out of restaurant/menu nutrition storage.

Self-cooked roadmap:
- Store corrected self-cooked meals in Food Memory and user meal history.
- Use consented self-cooked corrections to improve the shared AI ingredient analysis training module.
- Build reusable ingredient estimation patterns for personal and general self-cooked nutrition estimation.
- Do not promote self-cooked records into restaurant nutrition profiles, restaurant nutrition cache, restaurant/location context, or menu nutrition cache.

This separation reduces storage waste, avoids polluting restaurant nutrition intelligence, and keeps external dining cost-control logic focused on reusable restaurant/menu records.

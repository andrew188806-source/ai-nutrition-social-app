# 005 P0 / P1 / P2 Priority Matrix

Version: v2.0 Alpha 7A  
Updated: 2026-07-08

## Priority Definitions

## P0 — MVP Cannot Proceed Without This

P0 work must be completed before a reliable MVP build or serious external demo.

P0 includes:

- TypeScript/runtime stability.
- Core data model consistency.
- Meal analysis save loop.
- Today Intake/full report sync.
- Basic recommendation loop.
- Meal Buddy core flow.
- Chat/match state correctness.
- Supabase schema/RLS baseline.
- Manual QA regression checklist.

## P1 — Strong MVP / Closed Beta / Investor Demo

P1 work improves demo reliability, beta usability, and investor credibility, but may follow P0 if capacity is constrained.

P1 includes:

- Restaurant card cleanup.
- Restaurant filter/search flow.
- Free/premium limit states.
- Group table baseline.
- Menu CRUD demo.
- Analytics event map.
- Release flags.
- Investor demo hardening.

## P2 — MVP+ or Post-Stability Enhancement

P2 work is valuable but should not derail core MVP completion.

P2 includes:

- Premium diary Top10 depth.
- Taste-similarity engine beyond placeholders.
- Group cancellation/completion polish.
- Admin review status depth.
- Investor landing page polish.
- Full multi-photo capture UI.

## Matrix by Surface

| Surface | P0 | P1 | P2 |
|---|---|---|---|
| Mobile Stability | Typecheck, navigation smoke, seed reset | i18n audit | UI polish beyond demo path |
| Data | Meal collection, unified social IDs, storage adapter | planned dinner normalization | long-term diary optimization |
| AI Analysis | candidates, correction, save | state retention | model evaluation dashboard |
| Intake/Diary | aggregation sync | rating placeholder | premium Top10 depth |
| Recommendation | intake-aware v1 | restaurant filters | taste-similarity engine |
| Meal Buddy | create card, invite, accept, chat sort | limits, candidate UI polish | advanced compatibility tuning |
| Group Table | none if capacity constrained | separate state, participants | cancellation/completion polish |
| Restaurant | none if capacity constrained | card/detail/menu nutrition | user-generated dish ingestion workflow |
| Admin | schema compatibility | menu CRUD | review automation |
| Backend | migrations, RLS | storage, Edge Function stubs | background jobs/dashboarding |
| QA/Release | manual regression | analytics/release flags | automated E2E scale-up |
| Investor Demo | seed route if needed | 3-minute route | web landing polish |

## Recommended Execution Rule

Do not start P2 work until these P0 items are complete:

1. TypeScript stable.
2. Meal record collection implemented.
3. Unified social identity model implemented.
4. Storage adapter implemented.
5. Analysis save -> Today Intake -> Recommendation loop verified.
6. Meal Buddy card creation from AI and restaurant verified.
7. Chat/match regression cases pass.
8. Supabase schema and RLS draft reviewed.

## Founder Decision Points

The founder should personally approve any change that affects:

- Product positioning: AI nutrition first, restaurant recommendation second, social dining as support/growth loop.
- Free/premium limits.
- Anonymous vs real profile rules.
- Clean UI hierarchy.
- Medical/nutrition claim boundaries.
- Patent/IP-sensitive AI personalization descriptions.

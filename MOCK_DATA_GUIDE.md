# Mock Data Guide

Mock data lives in:

- `packages/shared/src/mock/tags.ts`
- `packages/shared/src/mock/demoData.ts`
- `packages/shared/src/mock/socialDiscovery.ts`
- `packages/shared/src/mock/restaurantPhase4.ts`
- `packages/shared/src/mock/foodMemory.ts`
- `packages/shared/src/mock/precisionIdentification.ts`
- `packages/shared/src/mock/phase45Nutrition.ts`
- `packages/shared/src/mock/adminGovernance.ts`

Use mock data to demonstrate:

- meal analysis
- ingredient correction
- Food Memory
- tag compatibility
- Community Card matching
- Free vs Premium unlock
- restaurant verification
- sponsored labeling
- admin governance and auditability

Production engineers should replace mock arrays with Supabase queries and server-side authorization.

## Mock Module Boundaries

Keep mock data organized by product domain:

- Analysis and self-cooked nutrition estimation: `phase45Nutrition.ts`.
- External dining restaurant/menu intelligence: `externalDiningFlywheel.ts`.
- Food Memory: `foodMemory.ts`.
- Social discovery, premium limits, and four-person tables: `socialDiscovery.ts`.
- Restaurant dashboard data: `restaurantPhase4.ts`.
- Admin governance and auditability: `adminGovernance.ts`.

Do not mix self-cooked mock records into restaurant/menu cache mocks. Both self-cooked and external dining corrections may point to shared AI ingredient analysis training concepts. User-side restaurant meal corrections stay in the user's own meal record unless the restaurant dashboard or another restaurant-owned workflow updates restaurant/menu data.

The authoritative mock/demo save-target policy lives in:

- `packages/shared/src/domain/dataBoundaries.ts`

The authoritative social matching priority lives in:

- `packages/shared/src/domain/socialMatchingPolicy.ts`

Use these policies when adding new mock records so UI screens do not invent their own data routing rules.

## External Dining Mock Strategy

External dining mock data should model database-first matching:
- restaurant profile
- menu item
- known nutrition estimate
- similar menu records
- Food Memory history
- tags and category

Do not treat ingredient breakdown as always active. Mock ingredient rows should appear only after the user intentionally taps `Ë£úÂ?È§êÈ?Ë≥áÊ?`, `?∞Â?È£üÊ?`, or `‰øÆÊ≠£`.

Repeated restaurant meals should reuse stored mock nutrition estimates. AI-assisted breakdown remains a mock edge-case path for corrections and missing data.

Additional mock flywheel data lives in:

- `packages/shared/src/mock/externalDiningFlywheel.ts`

It demonstrates how corrected external dining meals can become reusable platform assets:
- restaurant nutrition profiles
- menu nutrition cache entries
- correction flywheel records
- reusable nutrition estimation dataset markers

This is mock-only, but it documents the intended long-term cost-control and crowdsourced nutrition intelligence model.

## Self-Cooked Mock Data Boundary

Self-cooked meal mock records should demonstrate a separate storage path from external dining.

External dining mock corrections may point to the shared AI ingredient analysis training module and the user's own Food Memory/meal history. They should not directly mutate restaurant nutrition profiles, restaurant nutrition cache, menu nutrition cache, or restaurant/location context from the consumer app.

Self-cooked mock corrections should point only to Food Memory, user meal history, the shared AI ingredient analysis training module, and reusable ingredient estimation patterns.

Do not connect self-cooked mock meals to restaurant nutrition profiles or restaurant/menu cache. This keeps the demo aligned with the production data-quality rule: restaurant meals improve restaurant/menu coverage, while self-cooked meals improve personal nutrition estimation and ingredient recognition.

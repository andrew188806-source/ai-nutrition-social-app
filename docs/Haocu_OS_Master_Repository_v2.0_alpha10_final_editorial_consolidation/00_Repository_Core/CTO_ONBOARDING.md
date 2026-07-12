# CTO Onboarding

## Mission
Own the translation of Haocu OS from product repository into a stable, demo-friendly MVP and then production-ready architecture.

## Immediate Priorities
1. Preserve current business rules and AI architecture.
2. Stabilize mobile demo flow: AI analysis, meal record, recommendations, meal buddy card, restaurant card, chat/table flows, and profile.
3. Replace mock-only state with clear domain collections while keeping demo data available.
4. Keep cross-platform support: Expo mobile/web, Next.js restaurant/admin surfaces, Supabase backend.
5. Enforce TypeScript, repository structure, i18n boundaries, and professional-review gates.

## Non-Negotiables
- No hard-coded English copy inside UI components; use Traditional Chinese i18n resources.
- No nutrition or medical claims beyond user-facing guidance and disclaimers reviewed by professionals.
- No investor, legal, finance, or valuation language shipped externally without professional review.
- No business-rule changes during cleanup unless explicitly approved by product owner.

## First 10 Days
- Audit current codebase against `07_Engineering/003_IMPLEMENTATION_PRIORITIES.md`.
- Fix mobile TypeScript errors.
- Confirm storage adapter for web and native.
- Unify meal buddy, chat, match, and group table data models.
- Create an implementation backlog that maps directly to PRD documents.

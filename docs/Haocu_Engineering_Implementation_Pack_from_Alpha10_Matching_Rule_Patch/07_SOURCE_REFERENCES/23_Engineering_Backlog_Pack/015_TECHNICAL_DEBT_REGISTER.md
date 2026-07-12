# 015 Technical Debt Register

Version: v2.0 Alpha 7A  
Updated: 2026-07-08

## Purpose

This register tracks known or likely technical debt that should be cleaned up while turning the repository into an MVP build.

| ID | Debt | Current Symptom | Priority | Cleanup Plan | Target Sprint |
|---|---|---|---|---|---|
| TD-001 | `latestCorrectedMealRecord` single-record pattern | Today Intake and full report can desync. | P0 | Replace with meal collection and aggregation service. | S1/S2 |
| TD-002 | Mock data scattered across surfaces | User/social/chat/table state becomes inconsistent. | P0 | Centralize mock seed data and references. | S1 |
| TD-003 | Web localStorage only | Native Expo state persistence unstable. | P0 | Cross-platform storage adapter. | S1 |
| TD-004 | Hardcoded UI strings | i18n inconsistency and hard-to-edit copy. | P1 | Move touched visible strings to zh-TW i18n. | S2-S4 |
| TD-005 | Route-specific business logic | Duplicate limits and card creation logic. | P0/P1 | Create service functions for limits/card creation. | S2/S3 |
| TD-006 | Restaurant card CTAs duplicated | UI clutter and confused action path. | P1 | Consolidate CTAs and date selector placement. | S3 |
| TD-007 | One-to-one chat and group flow overlap | Wrong tab/page routing. | P1 | Separate chat types and group table routes. | S4 |
| TD-008 | Demo data cannot reset reliably | Presentations inconsistent. | P0 | Build deterministic seed reset. | S1 |
| TD-009 | AI result and saved meal types differ | Correction/save bugs. | P0 | Define shared DTOs and mapper. | S1/S2 |
| TD-010 | Supabase schema not validated against UI | Migration may not support current screens. | P0/P1 | Map each route to table/query before build. | S2/S3 |
| TD-011 | No analytics event implementation | Cannot measure funnel/traction later. | P1 | Implement debug event sink and future provider interface. | S4 |
| TD-012 | Visual inconsistency in avatars/mascots | Free/paid identity unclear. | P1 | Centralize avatar component and profile identity rules. | S3/S4 |

## Debt Handling Rules

- P0 debt should be fixed before adding new feature breadth.
- Do not hide debt by adding new mock objects when a shared model is needed.
- Every cleanup should include at least one regression test/check.
- If a debt item is deferred, write the reason and owner.

## Code Cleanup Priorities

1. State/data model cleanup.
2. Route/navigation correctness.
3. UI duplication removal.
4. i18n cleanup.
5. Backend adapter separation.
6. Analytics and release instrumentation.

## Deferred Debt Not to Overbuild Now

- Full automated E2E suite.
- Full ML personalization pipeline.
- Full multi-photo capture UI.
- Full restaurant enterprise permissions.
- Full supply-chain/ESG marketplace backend.

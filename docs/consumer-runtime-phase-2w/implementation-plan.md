# Consumer Runtime Phase 2W-A Implementation Plan

Status: **local implementation complete; Freeze candidate**. Development read/write activation, migration, RPC, and UI cutover not started.

## Objective

Phase 2W-A establishes presentation-neutral contracts, current-user repository ports, deterministic mock behavior, disabled behavior, a service boundary, feature flags, and factories for restaurant and menu-item ratings. It does not connect a database or alter a screen.

## Frozen baseline

- Branch: `main`
- Commit: `65862d35363411ece9191bdd1d06a672ff9802ef`
- Starting migrations: 33
- Starting latest migration: `20260716060000_restore_restaurant_internal_reader_set_option.sql`

## Local implementation

- `apps/mobile/features/consumer-ratings/types.ts`: canonical local contracts and typed results.
- `ports.ts`: current-user read/write boundaries without an ownership argument.
- `adapters/mockConsumerRatingRepository.ts`: injected deterministic fixtures and current-row replacement.
- `adapters/disabledConsumerRatingRepository.ts`: typed fail-closed results.
- `consumerRatingService.ts`: authenticated-session gate and presentation-neutral orchestration.
- `featureFlags.ts`: read and write source separation.
- `factories.ts`: explicit source composition with no fallback.
- Phase-specific guard and contract smoke scripts.

## Phase boundaries

Phase 2W-A creates no transport adapter, migration, function, grant, database operation, UI cutover, navigation change, aggregate rating, or public rating. Phase 2W-B is not started.

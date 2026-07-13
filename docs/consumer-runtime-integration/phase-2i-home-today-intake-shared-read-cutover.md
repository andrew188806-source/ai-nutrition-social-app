# Consumer Runtime Integration Phase 2I - Home / Today Intake Shared Read Model Cutover

Date: 2026-07-13
Status: Implementation complete. Guard complete. Development live verification complete. Freeze candidate.

## Scope

Phase 2I cuts over the Mobile Home and Today Intake screens to the Phase 2G / 2H shared UI-facing read path.

Included:

- Home reads through `useTodayIntakeUiModel(...)`.
- Today Intake reads through `useTodayIntakeUiModel(...)`.
- UI-facing model calls `ConsumerTodayIntakeOverviewService.getCurrentUserTodayIntakeOverview(input?)`.
- Actual consumed totals come from the canonical shared overview calculated nutrition.
- Planned dinner display remains separate from actual consumed totals.
- Partial overview status still renders available actual meal data.
- Default live smoke skip behavior.
- Explicit development live UI-facing smoke.

Not included:

- UI redesign.
- Navigation change.
- Meal Log cutover.
- Summary persistence or write-back.
- Meal write, update, delete, correction, or consumption adjustment runtime.
- Planned meal write runtime.
- Migration, RLS change, grant change, SQL, seed, fixture, bootstrap, or production operation.
- Restaurant Web, Admin Web, social runtime, recommendation feedback runtime, ratings, favorites, or Phase 2J work.

## Runtime Path

Home and Today Intake now use this path:

`Mobile route -> useTodayIntakeUiModel -> getCurrentUserTodayIntakeUiModel -> ConsumerTodayIntakeOverviewService.getCurrentUserTodayIntakeOverview`

The route files no longer compose their own meal list, nutrition summary, or meal slots from route-local meal stores or calculator helpers.

The UI-facing model maps the shared overview into the existing component shapes:

- `TodayIntakeUiSummary`
- `TodayIntakeUiMealRecord`
- `TodayIntakeUiMealSlot`

This mapping preserves the existing UI layout and component contracts while removing duplicated route-level read composition.

## Source Boundaries

Home and Today Intake do not directly import or call:

- Supabase SDK or URL polyfill.
- Meal records repositories.
- Daily nutrition repositories.
- Supabase meal adapters.
- Mock meal repositories.
- Phase 2E calculator or parity helper.
- Legacy route-local nutrition calculators.
- Direct write, delete, update, upsert, insert, or RPC methods.

The shared overview service remains the single UI-facing source for actual consumed day data.

## Planned Meals

Planned dinner remains display-only for Phase 2I.

Rules preserved:

- Planned meals do not contribute to actual consumed totals.
- Planned-meal unavailable metadata does not hide actual consumed meals.
- Missing stored daily summary does not erase calculated actual nutrition.
- Partial status is shown with available actual meal data.

## Default Smoke

Command:

- `npm run test:consumer-phase2i-live-smoke`

Default result:

- `SKIPPED - explicit Phase 2I Development live shared UI read opt-in was not enabled.`

Default mode creates no Supabase client, performs no authentication, makes no network request, reads no meals or summaries, writes nothing, invokes no RPC, and starts no next phase.

## Explicit Development Live Smoke

Command:

- `npm run test:consumer-phase2i-live-smoke`
- Explicit opt-in was supplied only for the process running the smoke.

Expected verified result:

- Status: passed.
- Live flags accepted.
- Email sign-in passed.
- Current-user meal records read passed.
- UI-facing shared model read passed.
- UI model meal parity passed.
- UI model item count passed.
- UI model nutrition parity passed.
- Stored summary unavailable semantics passed.
- Planned meals unavailable semantics passed.
- Partial status passed.
- Deterministic repeat UI read passed.
- Sign-out passed.

Live UI model result:

- Overview status: `partial`.
- Meal count: `1`.
- Item count: `1`.
- Stored summary found: `false`.
- Stored summary status: `unavailable`.
- Planned meals status: `unavailable`.
- Partial reasons:
  - `planned_meals_unavailable`
  - `stored_summary_unavailable`

The smoke must not print meal names, record IDs, item IDs, summary IDs, user IDs, raw rows, raw responses, credentials, tokens, sessions, email, password, URL, or key.

## Boundary Verification

- No UI redesign.
- No navigation change.
- No migration added.
- No RLS or grant change.
- No remote database write.
- No meal write.
- No summary write-back.
- No planned meal write.
- No RPC invocation from Phase 2I.
- No raw SQL.
- No seed or fixture.
- No service-role key.
- No secret output.
- No production deployment.
- Consumer Runtime Phase 2J was not started.

## Commands

- `npm run test:consumer-phase2i`
- `npm run test:consumer-phase2i-live-smoke`
- Full Phase 1A through Phase 2I regression suite.
- Consumer Schema Phase 1.3 guard.
- Consumer schema validator.
- Canonical audit.
- Root, Mobile, Restaurant Web, and Admin typechecks.
- `npm ls`
- `git diff --check`

## Remaining Warnings

- Stored daily summary persistence remains unavailable for the selected development date, so the live UI model is partial.
- Planned meals runtime remains unavailable in live mode and is not included in actual consumed totals.
- Meal Log is not cut over in Phase 2I.
- Summary write-back, corrections, consumption adjustments, ratings, favorites, and recommendation feedback remain deferred.

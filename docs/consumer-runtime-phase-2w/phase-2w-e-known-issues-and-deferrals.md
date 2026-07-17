# Phase 2W-E Known Issues and Deferrals

- `C-20` is RESOLVED locally. Meal Log forms now reset dirty/hydration state by presentation-only record identity, hydrate only untouched rating fields, reject stale-target hydration, and use an explicit read generation guard. A local analysis `mealId` never enters the canonical target mapper, repository, RPC arguments, or canonical meal linkage.
- The local Meal Log records currently carry a safe canonical `restaurantId` on some restaurant meals but no trustworthy `menuItemId`, canonical `mealRecordId`, or canonical `mealRecordItemId`. Those records therefore support restaurant rating only; other targets fail closed.
- Default read remains mock and default write remains disabled. Development credential-backed Mobile validation has not started.
- Feedback payload hardening remains deferred. No new feedback semantics are inferred from unfinished-reason UI.
- Favorites remain Phase 2X; recommendation feedback remains Phase 2Y. Monthly ratings, rankings, quota, Social/Meal Buddy, public aggregates, restaurant analytics, E0 database governance, and Admin/Restaurant UI remain excluded.
- `P2W-A-DEP-001` remains OPEN / ACCEPTED / DEFERRED. `P2V-PERF-001` remains OPEN / DEFERRED.
- N4 and Phase 2V-F remain BLOCKED / NOT EXECUTED. Production remains untouched.
- Phase 2W-E is not Development-validated, is not a Freeze candidate, and is not Frozen.

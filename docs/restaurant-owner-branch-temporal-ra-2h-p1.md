# RA-2H-P1 — Governed Restaurant branch temporal authority

## What this round governs

Four independent Restaurant Owner temporal concerns, per branch, plus one canonical read-only
evaluator, exactly as frozen by
[docs/restaurant-owner-branch-temporal-foundation-ra-2h-p0.md](restaurant-owner-branch-temporal-foundation-ra-2h-p0.md):

1. an explicit IANA **timezone** (`restaurant_branches.timezone_name`) — onboarding data, backfilled
   to `Asia/Taipei` for the existing Taiwan dataset, never Owner-editable through this round;
2. a regular **weekly** wall-clock schedule;
3. local-calendar-date **special** exceptions that fully replace the weekly schedule for their
   starting date;
4. absolute **operational closure** windows (close now, scheduled, reopen, cancel).

Admin lifecycle (`restaurant_branches.status`, RA-1C) remains the sole superior authority. Owner
operational closure never writes `status`/`status_version` and can never reopen an Admin-blocked
branch. Every temporal writer is independent of every RA-2A-F column (sold_out, availability, price,
visibility, display names) and of GEO/nutrition/allergen/Taste/Meal-Buddy identity.

## Interval contract

Every interval (weekly or special) carries `start_local_time`, `end_local_time`,
`end_day_offset ∈ {0,1}`, half-open `[start, end)`:

- same-day: `offset=0`, `start < end`;
- overnight: `offset=1`, `start > end`;
- the **only** canonical 24-hour encoding is `00:00:00 -> 00:00:00`, `offset=1`; every other
  equal-time pair is invalid, and an `offset=1` pair with `start < end` is invalid (exceeds 24h).

Weekday is ISO (1=Monday..7=Sunday). Limits: 8 intervals/weekday, 56/week, 8/special date.

## Overlap: defense-in-depth, not just the RPC

Both the weekly and special-date overlap checks run twice: once inside the RPC (a set-based
pre-check over the JSON candidate, using a 3-way `{-10080, 0, +10080}` minute shift so the weekly
check is genuinely circular — Sunday-overnight-into-Monday is caught), and once more as a table-level
**AFTER ROW trigger** that re-scans the complete stored set for the affected branch/override.

The trigger is deliberately **not** a deferred constraint trigger. Each of the eight RPCs is a single
`SECURITY DEFINER` statement whose elevated privilege ends the instant it returns — before a
commit-deferred trigger would ever fire, by which point the surrounding session has reverted to the
unprivileged `authenticated` role. An immediate `AFTER ROW` trigger fires at the end of the writing
statement, still inside the SECURITY DEFINER context, and — because the RPC always performs its
whole-set write as one `INSERT ... SELECT` — still sees the complete final row set exactly once. This
was found and fixed during PG17 proof, not guessed at design time.

## Weekly vs. special vs. closure: three independent version tokens

`restaurant_branch_temporal_state` carries `weekly_hours_configured` plus three independent
`bigint` versions. Changing one dimension never advances a sibling — proven directly in the PG17
harness (`weekly writer cannot touch operational_closure_version`, etc.) and enforced by column-level
`UPDATE` grants: each writer can advance only its own counter.

`weekly_hours_configured = false` with zero rows is `UNKNOWN` (legacy/unconfigured — preserves
existing eligibility). `weekly_hours_configured = true` with zero rows is explicitly closed all
week — a real, different, deliberately reachable state (`REPLACE_WEEKLY_SCHEDULE` with an empty
array). `CLEAR_WEEKLY_SCHEDULE` is the only path back to `UNKNOWN`.

Special dates share **one** branch-level `special_hours_version` across every date — editing two
different dates serializes through the same `temporal_state` row lock, giving one simple ABA-safe
token for the whole bounded collection rather than one version per date.

## DST: round-trip enumeration, never PostgreSQL's implicit resolution

`restaurant_internal.resolve_branch_local_datetime_v1(timezone, local_datetime, fold)` computes
PostgreSQL's own direct `AT TIME ZONE` conversion, then probes a bounded ±3h window (at 15-minute
granularity, comfortably covering every real-world transition size) verifying which candidate
instants **round-trip** back to the exact submitted local time. Zero survivors is a nonexistent
spring-forward gap; one is unambiguous; two is a fall-back fold requiring the explicit
`earlier | later` occurrence. The function never raises — every outcome is a bounded status string,
so every caller (`CLOSE_NOW_UNTIL`, `SCHEDULE_CLOSURE`) maps it to `invalid_local_time` or
`invalid_request` without a raw exception ever reaching a client.

Proven on PG17 against `America/Los_Angeles` (spring-forward gap, fall-back earlier/later) and
`Asia/Taipei` (no DST — the same wall-clock time that is ambiguous in LA resolves cleanly).

## The canonical evaluator

`restaurant_internal.evaluate_branch_temporal_state_v1(branch_id, p_at timestamptz)` is the single
internal OPEN/CLOSED/UNKNOWN primitive. Precedence: Restaurant publication → Admin lifecycle →
active operational closure → previous-date spillover → current-date special override → current-date
weekly schedule → `UNKNOWN`. It takes a deterministic instant (never calls `now()` itself); every
production caller supplies the DB's authoritative `now()`. Reason vocabulary is exactly the 8 values
P0 freezes; `UNKNOWN + active closure = CLOSED`, and reopening returns to `UNKNOWN` — proven directly.

## Sealed-role topology

| Role | Owns | Cannot touch |
| --- | --- | --- |
| `restaurant_owner_branch_weekly_hours_write_authority` | weekly schedule + its version | special/closure tables, restaurant_branches, RA-2A-F |
| `restaurant_owner_branch_special_hours_write_authority` | special overrides + their shared version | weekly/closure tables |
| `restaurant_owner_branch_operational_closure_write_authority` | closures + their version; narrow read of `restaurant_branches.status`/`timezone_name` and `restaurants.status` for the lifecycle gate | weekly/special tables, `status`/`status_version` itself |
| `restaurant_branch_temporal_context_reader` | read-only across every temporal relation; owns preview + the evaluator | zero DML anywhere |

All four are `NOLOGIN NOINHERIT NOBYPASSRLS`; every RLS-protected relation this round touches
(including the pre-existing `restaurant_branches`/`restaurants`) gets its own permissive-writer +
RESTRICTIVE-tenant policy pair for these specific roles, since an existing round's permissive policy
never applies to a role it doesn't name.

## Gates

| Command | What it proves |
| --- | --- |
| `npm run test:restaurant-owner-branch-temporal-ra-2h-p1` | repository topology, freeze and scope |
| `npm run test:restaurant-owner-branch-temporal-ra-2h-p1-smoke` | every contract claim against the frozen source |
| `npm run test:restaurant-owner-branch-temporal-ra-2h-p1-mutations` | each claim actually kills a corruption |
| `npm run test:restaurant-owner-branch-temporal-ra-2h-p1-postgres` | real PostgreSQL 17.6, 90 behavioural proofs |

The PostgreSQL gate needs `RA2HP1_PG_BIN` (a PostgreSQL 17.x `native/bin` directory) and
`RA2HP1_PG_MODULES` (a directory whose `node_modules` contains `pg`). It covers timezone validation,
every weekly/special/closure mutation and its stale/no-change/ABA behavior, the full required overlap
matrix (same-day, cross-midnight, Sunday→Monday circular), previous-date spillover, the 24-hour
evaluation boundary, Admin-lifecycle precedence over Owner reopen, DST gap/fold resolution, tenant/
foreign/nonexistent indistinguishability, sealed-role privilege shape, and RA-1C/RA-2A-F independence.

# RA-2H-P0 — Complete Restaurant branch temporal foundation

Status: local product, data-contract, and architecture freeze. This phase creates no database
object, migration, role, function, policy, application route, or UI.

Baseline: `d37d0e8ba983b943ae91df8d63dae11011346655`.

Next state: `READY_FOR_RA-2H-P1_FULL_TEMPORAL_AUTHORITY`.

## Repository evidence and superseded drafts

The active restaurant baseline gives `public.restaurant_branches` an ID, Restaurant parent, display
fields, and the Admin lifecycle state `active | inactive | temporary_closed | archived`. It has no
branch timezone, operating-hours table, special-date table, operational-closure table, temporal
version, or open-now evaluator. The existing public catalogue and next-meal projections require an
active branch but perform no wall-clock evaluation.

The files under `docs/supabase-schema-drafts` and `docs/supabase-schema-review/generated` are not
active migrations. Their proposed `branch_business_hours` and `branch_special_hours` definitions are
not suitable for RA-2H: they use weekday `0..6`, allow only one interval per day, require
`opens_at < closes_at`, and cannot represent split service, overnight service, or unambiguous
24-hour operation. RA-2H-P1 must not activate or copy those definitions.

PostgreSQL 17 exposes its recognized named zones through `pg_catalog.pg_timezone_names`; named
zones carry daylight-saving transition rules, unlike fixed offsets. PostgreSQL also resolves
ambiguous and nonexistent civil timestamps instead of rejecting them automatically. RA-2H therefore
uses PostgreSQL's zone catalogue for validation but adds an explicit round-trip/disambiguation
contract for scheduled closure input. Supabase recommends retaining the database session timezone as
UTC. RA-2H does so; a branch timezone is row data, not a database-session default.

Authoritative references:

- <https://www.postgresql.org/docs/17/view-pg-timezone-names.html>
- <https://www.postgresql.org/docs/17/datatype-datetime.html>
- <https://www.postgresql.org/docs/17/datetime-invalid-input.html>
- <https://www.postgresql.org/docs/17/rangetypes.html>
- <https://supabase.com/docs/guides/database/postgres/configuration>

No relevant Supabase breaking change alters this contract. The current Data API change reinforces
the existing repository rule that new relations receive explicit grants and RLS rather than relying
on automatic exposure.

## Product authority

RA-2H governs three independent Restaurant Owner temporal concerns:

1. a regular weekly local-wall-clock schedule;
2. local-calendar-date exceptions that replace the regular schedule for their starting date;
3. absolute operational closure windows, including close now, scheduled closure, scheduled reopen,
   manual reopen, and cancellation of a future closure.

It also establishes an explicit IANA timezone for every branch. The timezone is high-impact branch
profile/onboarding data and is not part of the Owner hours mutation authority.

The Admin lifecycle in `restaurant_branches.status` remains the superior and sole RA-1C authority.
Owner operational closure never writes `active`, `inactive`, `temporary_closed`, or `archived` and
can never reopen an Admin-blocked branch. Internal terminology is deliberately distinct:
`admin lifecycle` means RA-1C status; `operational closure` means the new temporal window.

Temporal changes never mutate Restaurant publication, menus, menu items, branch-menu identity,
price, availability, visibility, sold-out state, display names, descriptions, nutrition, allergens,
Taste data, GEO identity, recommendation identity, or Meal Buddy context.

## Per-branch timezone contract

RA-2H-P1 adds `timezone_name text` to `public.restaurant_branches`. The migration first adds it
nullable, writes `Asia/Taipei` to every existing branch, verifies every row, and then makes it
`NOT NULL` with no database default. `Asia/Taipei` is an evidence-backed one-time backfill for the
current Taiwan dataset, not a universal runtime constant.

Every later branch insert must persist a timezone explicitly. Current Taiwan onboarding may select
`Asia/Taipei` as its product default before insert. International onboarding must select the actual
branch zone. Database, Restaurant Web, consumer, GEO, REC, next-meal, Meal Buddy, and shared helpers
must read the stored value. They must not fall back to `Asia/Taipei`, the browser timezone, a user
timezone, a session timezone, or a raw offset.

The P1 database trigger validates an inserted or changed value by exact-name membership in
`pg_catalog.pg_timezone_names`. Exact matching preserves the catalogue spelling and refuses blank,
case-variant, abbreviation, raw-offset, and POSIX-offset input that is not an exact catalogue row.
The trigger runs on branch insert and on change of `timezone_name`; unrelated branch updates do not
revalidate an unchanged value. No application-maintained allowlist is authoritative.

Timezone writes are excluded from the three Owner temporal writers. A future governed
branch-profile/onboarding authority must preview the impact, require explicit confirmation, and
write an independent typed timezone audit. Changing `Asia/Taipei` to `Asia/Tokyo` keeps weekly
times such as 11:00 as 11:00 local, keeps special dates as the same stored local dates, and keeps
existing operational-closure `timestamptz` values as the same absolute instants. It changes how the
weekly and special facts map to future instants.

## Local wall-clock and weekday contract

Weekly and special intervals store `time without time zone`. They are local wall-clock values and
must never be persisted as fake UTC timestamps. The canonical weekday identity is ISO:

| Value | Day |
| ---: | --- |
| 1 | Monday |
| 2 | Tuesday |
| 3 | Wednesday |
| 4 | Thursday |
| 5 | Friday |
| 6 | Saturday |
| 7 | Sunday |

Localized labels belong only to presentation.

Each interval has exactly `start_local_time`, `end_local_time`, and `end_day_offset`, where the
offset is `0` or `1`. Intervals are half-open: start is included and end is excluded.

- Same-day service requires `end_day_offset = 0` and `start_local_time < end_local_time`.
- Overnight service requires `end_day_offset = 1` and `start_local_time > end_local_time`.
- Full 24-hour service has one canonical encoding only:
  `00:00:00 -> 00:00:00`, `end_day_offset = 1`.
- Every other equal-time pair is invalid.
- An offset-1 interval with start earlier than end is invalid because it exceeds 24 hours.

Therefore no interval is zero length or longer than 24 hours, and `00:00 -> 00:00` is never
ambiguous. A closed weekday has no interval anchored on that weekday. Human `is_closed` flags and
fake zero intervals are not stored.

P1 bounds regular input to at most eight intervals per weekday and 56 per branch schedule, and a
special custom date to at most eight intervals. These are request/storage safety limits rather than
business ordering; raising them later does not require a schema redesign.

## Weekly schedule model

P1 creates one tenant-linked state row per branch with:

- `weekly_hours_configured boolean NOT NULL DEFAULT false`;
- `weekly_hours_version bigint NOT NULL DEFAULT 0`;
- `special_hours_version bigint NOT NULL DEFAULT 0`;
- `operational_closure_version bigint NOT NULL DEFAULT 0`.

The normalized weekly child relation stores branch ID, ISO weekday, start time, end time, and
end-day offset. Its composite key rejects exact duplicates. The branch foreign key is indexed.

The exact P1 relation manifest is:

| Relation | Required authority |
| --- | --- |
| `public.restaurant_branch_temporal_state` | one row per branch; configured flag and the three independent versions |
| `public.restaurant_branch_weekly_hour_intervals` | normalized weekly interval facts |
| `public.restaurant_branch_special_hour_overrides` | one `closed | custom` parent per branch/local date |
| `public.restaurant_branch_special_hour_intervals` | normalized children of custom overrides |
| `public.restaurant_branch_operational_closures` | absolute, history-preserving closure windows |
| `restaurant_internal.branch_weekly_hours_audit_log` | typed weekly transition parents |
| `restaurant_internal.branch_weekly_hours_audit_intervals` | typed previous/next weekly snapshots |
| `restaurant_internal.branch_special_hours_audit_log` | typed special-date transition parents |
| `restaurant_internal.branch_special_hours_audit_intervals` | typed previous/next special snapshots |
| `restaurant_internal.branch_operational_closure_audit_log` | typed closure transitions |

Business relations use the active schema's `text` branch identifiers and foreign keys to
`public.restaurant_branches(id)`. Audit IDs and closure IDs are UUIDs generated by PostgreSQL.
Children use composite foreign keys to their parent and every foreign-key/filter column receives an
index. Relation names from the old draft (`branch_business_hours`, `branch_special_hours`) remain
unused so nobody can mistake that incompatible draft for the governed model.

`weekly_hours_configured = false` with no intervals means `UNKNOWN`: the legacy branch has no
authoritative schedule and hours alone do not remove its existing consumer eligibility.
`weekly_hours_configured = true` with no intervals is valid and means explicitly closed all week.
This distinction is preserved in preview, audit, and evaluation. A configured schedule may also
have closed weekdays by omitting intervals for those weekdays.

Owner editing is an atomic whole-week operation, never seven independently concurrent patches. The
request is a discriminated command:

- `REPLACE_WEEKLY_SCHEDULE`: the complete next interval set; an empty set means explicitly closed
  all week.
- `CLEAR_WEEKLY_SCHEDULE`: no intervals allowed; returns the schedule to `UNKNOWN`.

Both carry the current `weekly_hours_version`; neither carries a predicted next version. An actual
canonical change advances the database version once. A canonically equivalent request returns
`no_change` with no row or audit change. A version mismatch returns `stale_state`, including ABA.

Canonical order is weekday, start time, end-day offset, then end time, all ascending. Input order has
no meaning. The DB canonicalizes and compares before writing.

## Effective interval validation

P1 validates the complete candidate schedule inside the same transaction while holding the branch
temporal state row `FOR UPDATE`. It projects each interval into minutes from the start of the ISO
week and detects half-open overlap. Sunday overnight intervals are also compared after shifting by
one week, so the weekly boundary is circular.

This rejects overlap both within an anchor day and across midnight. For example, Monday
18:00–Tuesday 02:00 conflicts with Tuesday 01:00–03:00. Adjacent intervals whose prior end equals
the next start are valid. DB constraints reject malformed individual rows and duplicates; a
constraint trigger or equivalent table-level invariant must also make an overlapping stored set
unreachable outside the RPC. UI validation is advisory only.

## Special-date model

P1 creates a normalized parent override keyed by `(branch_id, local_date)` with exact mode
`closed | custom`, plus interval children using the same time and end-day-offset contract as weekly
hours. There is exactly one override per branch local date.

- `closed` has zero child intervals.
- `custom` has one through eight canonical child intervals.
- An empty custom schedule is invalid and is never inferred as closed.

The mutation vocabulary is `SET_CLOSED`, `SET_CUSTOM_HOURS`, and `CLEAR_OVERRIDE`. Clear removes the
date override and restores normal weekly authority for that starting date. It is not inferred from
an empty interval array.

Special dates have an independent branch-level `special_hours_version`, because date exceptions and
regular weekly service are operationally independent. Every special mutation carries the current
branch-level version, locks the same state row, and advances the version once only for an actual
change. This serializes edits to different dates but gives one simple ABA-safe token for the bounded
special-date collection. A future split to per-date versions is unnecessary at current scale.

A special override completely replaces weekly intervals anchored on that local date. It does not
merge with them. Intervals belong to their starting schedule date: a Dec 31 interval ending Jan 1 at
02:00 remains valid after midnight even if Jan 1 has a closed override. The Jan 1 override controls
intervals that start on Jan 1 and does not retroactively truncate Dec 31 service.

Preview requires an inclusive local-date range, defaults to the next 90 branch-local dates, and is
bounded to 366 dates. An exact-date lookup is also permitted. No unbounded exception history is a
client response.

## Operational closure model

Operational closures are absolute half-open windows `[starts_at, ends_at)` stored as
`timestamptz`. `ends_at IS NULL` means indefinite until manual reopen. They are not local schedule
rows and are never recalculated after a timezone change.

P1 creates a history-preserving closure relation with a UUID closure ID, branch ID, `starts_at`,
nullable `ends_at`, nullable `cancelled_at`, and server timestamps. Past, current, and future rows
remain stored. A partial GiST exclusion constraint on non-cancelled rows prevents overlapping
`tstzrange(starts_at, ends_at, '[)')` windows for the same branch; P1 may install the standard
`btree_gist` extension without pinning an extension version. Branch and effective-window lookup
columns are indexed.

This permits many non-overlapping historical and future windows, while at most one can be effective
at an instant. An indefinite window conflicts with every later non-cancelled window. A command that
would overlap returns `closure_conflict`; it never silently cancels or merges another window.

The narrow future RPC commands are:

- `CLOSE_NOW_INDEFINITE` and `CLOSE_NOW_UNTIL`, which derive `starts_at` from the DB clock;
- `SCHEDULE_CLOSURE`, which supplies a future local start and optional local end;
- `REOPEN_NOW`, which sets the effective row's `ends_at` to the DB instant;
- `CANCEL_FUTURE_CLOSURE`, which marks one not-yet-started row cancelled without deleting it.

P1 should expose explicit functions for these command families rather than a generic nullable
temporal patch. All functions use `operational_closure_version`, lock the branch state, and return
`stale_state` for a mismatched token. Actual close, reschedule, reopen, or cancel advances once and
is audited atomically. A request already represented canonically returns `no_change`; uncertain
results reconcile through preview, following RA-2A–F rather than adding RA-1C receipts.

Owner commands require the Restaurant and Admin branch lifecycle to be active at mutation time.
They return `lifecycle_blocked` without writing when the Restaurant is unpublished/blocked or the
branch is `inactive`, Admin `temporary_closed`, or `archived`. In all cases the effective evaluator
also applies Admin lifecycle first, so ending an operational closure can never activate a branch.

## Authoritative clock and scheduled local input

Current effectiveness uses the transaction-stable database instant (`transaction_timestamp()` /
`now()`), not `clock_timestamp()`, browser `Date.now()`, client timezone, or client local date. One
transaction therefore evaluates one instant consistently. Audit creation may continue the repository
convention of `clock_timestamp()`.

Restaurant Web submits a local civil datetime intent. The server/DB reads the branch timezone; the
client cannot supply a replacement zone. P1 conversion enumerates the valid absolute instant or
instants whose round-trip through the branch zone equals the submitted local datetime:

- no valid round-trip is a nonexistent spring-forward time and returns `invalid_local_time`;
- one is accepted;
- two is a fall-back ambiguity and requires the explicit occurrence `earlier | later`;
- an occurrence on an unambiguous input is invalid.

The occurrence is only disambiguation. It is not timezone authority or a stored fixed offset.
`ends_at` must be later than `starts_at`; a scheduled start must be in the future at the locked DB
instant. PostgreSQL's silent default resolution for gaps/folds is never accepted without this proof.

Weekly open-now evaluation does not convert stored intervals into fixed UTC offsets. It converts the
authoritative instant into the branch local date, ISO weekday, and local clock. During fall-back,
both occurrences of a repeated local clock time satisfy the same local interval. During
spring-forward, no absolute instant maps to a nonexistent local clock segment, so it creates no
phantom open instant.

## Canonical OPEN / CLOSED / UNKNOWN evaluator

P1 provides one internal canonical evaluator with a deterministic `p_at timestamptz` input for
composition and tests. Production wrappers pass the DB's authoritative current instant; no public
caller chooses the eligibility clock.

It returns `OPEN | CLOSED | UNKNOWN` plus a machine reason. Evaluation order is:

1. Restaurant publication/eligibility;
2. Admin branch lifecycle;
3. effective non-cancelled operational closure;
4. active spillover interval anchored on the preceding local date;
5. special override for the current local date;
6. regular weekly schedule for the current local date;
7. schedule `UNKNOWN` fallback.

The evaluator checks preceding-date and current-date anchors because an interval may cross midnight.
For each anchor, a special override replaces the weekly authority for that anchor. If any applicable
interval contains the local instant, the result is `OPEN`. If the current date has an override or a
configured weekly schedule and no interval contains the instant, it is `CLOSED`. If neither gives
current-date authority, it is `UNKNOWN`.

Required machine reasons are `ADMIN_LIFECYCLE_BLOCKED`, `OPERATIONALLY_CLOSED`,
`SPECIAL_DATE_CLOSED`, `OUTSIDE_SPECIAL_HOURS`, `OUTSIDE_WEEKLY_HOURS`, `HOURS_UNKNOWN`,
`OPEN_SPECIAL_HOURS`, and `OPEN_WEEKLY_HOURS`. Product UI maps these values to localized copy.

`UNKNOWN + active operational closure = CLOSED`; when that closure ends, the branch returns to
`UNKNOWN`. Admin lifecycle always wins.

Menu publication, menu-item lifecycle, branch-specific visibility, availability, and sold-out are
offering gates applied after branch temporal evaluation. Temporal closure contributes eligibility;
it never rewrites those facts.

## Version and audit boundaries

Weekly, special, and operational closure each have an independent non-negative `bigint` version.
They cross JSON/HTTP as decimal strings. Changing one dimension never advances either sibling.
Timezone changes later receive a separate version/audit authority and do not reuse these tokens.

Audit is typed and append-only in `restaurant_internal`, with RLS enabled and forced, no update or
delete policy, and no client/runtime relation privilege.

- Weekly audit has an event parent containing actor, membership, Restaurant, branch, previous/next
  configured state, versions, and server timestamp. Typed child rows record previous and next
  canonical intervals.
- Special audit has an event parent containing operation, local date, previous/next mode, versions,
  actor/tenant provenance, and timestamp. Typed child rows record previous and next intervals.
- Closure audit contains operation, closure ID, previous/next starts, ends and cancellation state,
  versions, actor/tenant provenance, and timestamp.

Normalized audit children are chosen over freeform JSON snapshots. The schedules are small, the
values are naturally typed, and normalized children allow constraints and exact reconstruction
without trusting a JSON shape. Refusals and `no_change` do not create transition audits.

## Tenant, RLS, and sealed authority plan

P1 adds three Owner permission keys at Restaurant scope:

- `branch.hours.weekly.write`;
- `branch.hours.special.write`;
- `branch.operational_closure.write`.

Only the active canonical Owner role receives them. Every preview and mutation derives the actor
from the authenticated JWT subject and proves the existing chain: enabled Restaurant user, active
membership, active Owner role, exact permission, target branch's own Restaurant. Requests accept no
actor, membership, role, permission, or authoritative timezone. Foreign and nonexistent targets
both resolve as `target_not_found` where the caller already has the operation permission.

P1 uses separate `NOLOGIN NOINHERIT NOBYPASSRLS` sealed writers for weekly hours, special hours, and
operational closure. Each gets only the columns/relations and audit insert path its operation needs.
A defect in one writer cannot mutate a sibling version or table. A dedicated sealed temporal reader/
evaluator owns bounded preview/evaluation functions and has no DML privilege.

The exact sealed role names are:

- `restaurant_owner_branch_weekly_hours_write_authority`;
- `restaurant_owner_branch_special_hours_write_authority`;
- `restaurant_owner_branch_operational_closure_write_authority`;
- `restaurant_branch_temporal_context_reader`.

All new exposed-schema relations have RLS enabled and forced. They receive explicit grants only;
`PUBLIC`, `anon`, `authenticated`, `authenticator`, and `service_role` receive no direct DML. Owner
access is through narrow authenticated RPCs. Policies repeat the tenant chain using both permissive
granting and restrictive tenant policies where an existing PUBLIC permissive policy could otherwise
widen visibility, following the RA-2B–F precedent. Tenant key and foreign-key columns are indexed.

Security-definer functions in P1 must have `search_path = ''`, `row_security = 'on'`, exact grants,
explicit JWT-subject checks, and sealed owners. No function is left executable by `PUBLIC`; internal
helpers are revoked from all client/runtime roles. The RA-1C-R1 governed role manifest and accepted
Supabase creator-admin control-plane shape remain the role-security invariant.

## Preview and mutation DTO plan

The bounded Owner preview returns branch ID, exact timezone, weekly configured state and canonical
intervals, weekly version, special overrides for the requested bounded date window, special version,
non-cancelled current/future operational windows in a bounded horizon, closure version, and current
effective temporal state/reason. It exposes no sealed role, raw audit, membership internals, or
unbounded history.

Narrow mutations are whole-week replace/clear, special set-closed/set-custom/clear, close now,
schedule closure, reopen now, and cancel future closure. Arrays use a closed validated DTO shape;
unknown keys, duplicate entries, invalid weekday/time/offset combinations, noncanonical order after
normalization, overlap, oversized arrays, invalid local dates, invalid local datetimes, and malformed
versions fail as `invalid_request` (or the specific temporal error above). JSON is transport only;
normalized relational rows remain authority.

The exact P1 function manifest is:

- `restaurant_internal.evaluate_branch_temporal_state_v1(text, timestamptz)` — canonical internal
  evaluator; production wrappers supply the DB instant;
- `public.restaurant_owner_preview_branch_temporal_v1(text, text, date, date)` — bounded Owner
  preview;
- `public.restaurant_owner_replace_branch_weekly_hours_v1(text, text, text, jsonb, bigint)` —
  discriminated `REPLACE_WEEKLY_SCHEDULE | CLEAR_WEEKLY_SCHEDULE`;
- `public.restaurant_owner_set_branch_special_hours_v1(text, text, date, text, jsonb, bigint)` —
  discriminated `SET_CLOSED | SET_CUSTOM_HOURS | CLEAR_OVERRIDE`;
- `public.restaurant_owner_close_branch_now_v1(text, text, text, timestamp, text, bigint)` — close
  now indefinite or until a validated branch-local datetime;
- `public.restaurant_owner_schedule_branch_closure_v1(text, text, timestamp, text, timestamp, text,
  bigint)` — future local start and optional local end with separate fold selections;
- `public.restaurant_owner_reopen_branch_now_v1(text, text, uuid, bigint)` — end the one effective
  closure at the DB instant;
- `public.restaurant_owner_cancel_future_branch_closure_v1(text, text, uuid, bigint)` — cancel one
  not-yet-started closure.

Here `timestamp` means `timestamp without time zone` local civil intent and the adjacent text is
nullable `earlier | later` fold disambiguation. Function overloads/defaults may improve call
ergonomics only if the catalogue still exposes exactly one unambiguous signature for each command.

## Legacy, onboarding, and migration plan

P1 migration order is:

1. assert the frozen RA-1C and RA-2A–F predecessors;
2. add and validate branch timezone, backfill existing rows to `Asia/Taipei`, then require it;
3. create branch temporal state rows with configured false and all three versions zero;
4. create normalized weekly, special, closure, and typed audit relations with indexes/constraints;
5. add exact Owner permission rows and sealed authorities;
6. add RLS, grants, preview/mutation functions, and canonical evaluator;
7. run closing catalogue/privilege/independence assertions before commit.

No weekly interval, special override, or closure is manufactured. Existing branches therefore start
`UNKNOWN`, with no active operational closure. New branch creation must insert a validated timezone
and a zeroed temporal state atomically; this is an onboarding integration responsibility activated
with P1, even if Taiwan UI initially chooses `Asia/Taipei`.

## Public catalogue, GEO, REC, and Meal Buddy boundaries

P0 and P1 do not modify current consumer projections. P3 composes the canonical evaluator instead
of duplicating timezone, special-date, overnight, and closure logic.

The future surface distinction is:

- a publication-eligible Restaurant/branch profile may remain discoverable and display
  `open`, `closed`, or `hours unknown`;
- a currently-available offering list, GEO candidate list, next-meal result, or recommendation
  excludes `CLOSED` branches;
- `UNKNOWN` preserves legacy eligibility until product authority changes it.

P3 must preserve current Restaurant/branch/menu/branch-menu IDs and GEO coordinates. It may filter or
rank by temporal eligibility but cannot alter distance calculation, nutrition ranking, Taste ranking,
allergen/ingredient authority, or Meal Buddy context identity. Scheduled reopen becomes effective by
time comparison alone; correctness requires no cron job or stored `is_open_now` boolean.

For scale, P1 indexes branch/weekday intervals, branch/local-date overrides, closure windows, and
tenant/RLS keys. P3 should evaluate only a narrowed candidate branch set, pass one statement-stable
instant to all evaluations, and inspect `EXPLAIN (ANALYZE, BUFFERS)` before adding caches. A cache or
materialized projection may optimize later, but authoritative facts plus current time remain the
source of truth.

## Successor implementation contracts

### RA-2H-P1 — privileged temporal data and Owner authority

Implement the exact schema, backfill, validators, normalized audits, three sealed writers, dedicated
reader/evaluator, RLS, permission catalogue, bounded preview, explicit mutation RPCs, and canonical
evaluator described above. Prove them on PostgreSQL 17 as a non-superuser migration runner before a
separate Development apply/acceptance. Do not activate Restaurant Web or consumer behavior.

### RA-2H-P2 — Restaurant Web temporal activation

Implement branch-zone rendering independent of browser zone; atomic weekly editing with split,
closed-day, overnight, and 24-hour support; special-date closed/custom/clear; close now, optional
reopen time, scheduled closure, manual reopen, and future cancellation; strict success/error DTO
parsing; decimal-string versions; stale/no-change handling; and uncertain-result preview
reconciliation. Timezone is displayed but not casually Owner-editable. Development acceptance uses
the actual HTTP routes and restores a canonical fixture state.

### RA-2H-P3 — consumer, catalogue, GEO, and REC activation

Consume the P1 evaluator with one authoritative instant. Add public hours/state presentation, retain
profile discovery where appropriate, exclude `CLOSED` from currently-available offerings and
recommendations, preserve `UNKNOWN` compatibility, and leave food/GEO/Meal Buddy identities and
ranking authorities unchanged. P3 has its own Development acceptance and does not reuse P2 writes.

## Future P1/P2/P3 test matrix

The successor gates cover at minimum:

- single interval, split shift, closed weekday, canonical 24-hour, overnight, adjacency, same-day
  overlap, cross-midnight overlap, and Sunday-to-Monday overlap;
- unknown schedule, configured all-week closed, replace equivalence, clear to unknown, stale weekly
  version, weekly ABA, canonical ordering, duplicates, and input bounds;
- special closed, custom, split, 24-hour, overnight, clear, full replacement precedence, preceding
  date spillover, stale special version, special ABA, and bounded preview;
- indefinite close, close-until, scheduled close, scheduled reopen without a worker, manual early
  reopen, future cancellation, overlap conflict, closure no-change, stale closure version, and
  closure ABA;
- Admin inactive, Admin temporary-closed, and archived branch against every Owner reopen path;
- `Asia/Taipei`, `America/Los_Angeles`, a normal date, spring-forward gap rejection, fall-back
  occurrence selection, repeated-hour evaluation, and timezone-change semantics;
- unauthenticated, non-Owner, foreign tenant, nonexistent target, disabled membership, direct table
  denial, forged actor/Restaurant/timezone/clock, and sealed-role privilege shape;
- Restaurant publication, menu publication, price, availability, visibility, sold-out, canonical
  item identity, nutrition, Taste, allergen, ingredient, GEO, REC, next-meal, and Meal Buddy
  independence;
- public profile closed presentation, currently-available exclusion, and `UNKNOWN` legacy
  eligibility.

P1 database acceptance, P2 actual Restaurant HTTP acceptance, and P3 consumer/REC acceptance remain
independent scripts and execution rounds.

## Bounded delivery estimate

Based on the repository's RA-2A–F migration/guard/PostgreSQL/application split, focused executor time
is estimated as:

| Work | Estimate |
| --- | ---: |
| P0 contract, guard, review, freeze | 0.5–1 day |
| P1 local migration, authority, guards, mutations, PostgreSQL 17 proof | 5–8 days |
| P1 Development apply and DB acceptance | 1–2 days |
| P2 Restaurant Web implementation and local validation | 5–8 days |
| P2 actual HTTP Development acceptance | 1 day |
| P3 consumer/catalogue/GEO/REC implementation | 4–7 days |
| P3 Development acceptance | 1–2 days |
| final cross-phase review and push | 0.5–1 day |

These are engineering-day bounds, not elapsed calendar promises. DST validation, PG17 exclusion/
constraint proof, and restoring live acceptance fixtures are the main variance.

## P0 boundary

The only P0 repository artifacts are this contract, its direct guard, and one package command. The
migration inventory remains 100 files, ending at
`20260906020000_restaurant_owner_branch_menu_item_display_name_authority.sql` with SHA-256
`2b65c1ca4e32435413b6f2033087a6f77b568fcca5b2f9326cfdc36140fee6bb`.

P0 uses no credentials or network at validation time, performs no database operation, and changes no
application source, lockfile, role manifest, predecessor guard, migration, Development state, or
Production state.

# RA-2H-P2 — Restaurant Web branch temporal activation

## What this round activates

The Restaurant Owner Dashboard's branch-level temporal controls: bounded preview, atomic
whole-week hours, local-date special overrides, and operational closure — wired to the exact
frozen RA-2H-P1 RPCs
([supabase/migrations/20260906030000_restaurant_owner_branch_temporal_authority.sql](../supabase/migrations/20260906030000_restaurant_owner_branch_temporal_authority.sql),
canonical SHA-256 `a4cbdcad2f83bde7fa08b0496b48d55b95c4c228353705b3ed2decc2dbbcf151`). No database
object is created or changed by this round.

## Takeover note

This round resumed in-progress, uncommitted work. Every source file already existed; nothing was
regenerated from scratch. Three real defects were found and fixed during takeover, all confined to
the mutation/preview parsing layer — no route, repository, or RPC wiring needed to change:

1. **The client re-parsed its own server's response with a parser that required a field the server
   never sent.** `parsePreview` validated the *raw P1 RPC shape* (which includes `ok: true`), but
   the server's own `Preview` type omitted `ok` entirely. The client called the same `parsePreview`
   on the HTTP response, which therefore always failed its own exact-key check — every successful
   preview would have rendered as "溫度控制不可用" regardless of real data. Fixed by adding `ok:
   true` to `Preview`'s wire shape symmetrically, matching the convention every other P2 round in
   this repository already uses.
2. **Mutation successes were parsed by ad-hoc field-copying, not an exact-key parser, and the
   client never inspected the result at all.** The save button always showed the same generic
   "reloaded" notice regardless of whether the save actually succeeded, was stale, was a no-op, or
   was refused for permission/lifecycle reasons. Fixed by adding five exact per-operation success
   parsers (`parseWeeklyMutation`, `parseSpecialMutation`, `parseClosureWindowMutation`,
   `parseReopenMutation`, `parseCancelMutation` — closure has three distinct success shapes since
   close/schedule, reopen, and cancel each return different fields) plus three client-side "wire"
   counterparts validating the already-`auditId`-stripped shape the server actually sends, and
   surfacing the real outcome to the Owner via bounded copy.
3. **A shared `intervals()` helper silently filtered out invalid array elements instead of
   rejecting the whole request.** A malformed interval (bad weekday, zero-length, non-canonical
   24h encoding) would be silently dropped rather than causing `invalid_request` — meaning a client
   could submit a schedule with one bad entry and have the DB-facing request quietly and invisibly
   look like a *different, smaller* schedule than what was actually requested. Fixed to fail the
   whole parse when any element is invalid.

A fourth gap was product-shaped rather than a parsing bug: the control component only exposed the
simplest command of each family (`SET_CLOSED`/`CLEAR_OVERRIDE` for special dates;
`CLOSE_NOW_INDEFINITE`/`REOPEN_NOW` for closure). `SET_CUSTOM_HOURS`, `CLOSE_NOW_UNTIL`,
`SCHEDULE_CLOSURE`, and `CANCEL_FUTURE_CLOSURE` had no UI at all. Added.

## Timezone is read-only, always branch-authoritative

The preview surfaces `timezone` for display only; no control anywhere accepts a `timezone`
parameter (proven by mutation-suite scan: `p_timezone` never appears). Scheduled civil datetime
inputs (`CLOSE_NOW_UNTIL`, `SCHEDULE_CLOSURE`) submit local wall-clock strings; P1 resolves them
against the branch's own stored zone. The browser's own timezone is never read or sent.

## UNKNOWN vs. explicitly closed all week

P1 treats `REPLACE_WEEKLY_SCHEDULE` with an empty interval array as a real, valid, *different*
state from `CLEAR_WEEKLY_SCHEDULE` (explicitly-closed-all-week vs. unconfigured/UNKNOWN). Because
opening the editor on an unconfigured branch starts with zero intervals, clicking "save" without
adding anything would silently produce the first state without the Owner ever intending it. The
control now requires an explicit confirmation, naming the distinction, whenever a whole-week save
would submit zero intervals.

## DST: mapped, never reimplemented

`CLOSE_NOW_UNTIL` and `SCHEDULE_CLOSURE` submit a local civil datetime plus an optional
`fold: "earlier" | "later" | null`. No TypeScript code computes DST transitions, offsets, or which
occurrence is "right" — P1's `resolve_branch_local_datetime_v1` is the sole authority. The UI's
`FoldPicker` lets the Owner choose in advance; if P1 reports `invalid_local_time` (a nonexistent
spring-forward instant) the bounded copy explains it plainly rather than silently shifting the time
or picking a fold automatically.

## Uncertain result handling

Every mutation button performs exactly one POST. The response — success, `stale_state`,
`no_change`, or any other bounded P1 outcome — is captured, canonical preview is reloaded
unconditionally afterward (reconciling actual state rather than trusting the mutation response
alone), and the Owner sees copy specific to what actually happened. There is no blind retry.

## Admin lifecycle boundary

No source in this round writes `restaurant_branches.status`/`status_version`, and no UI control
offers `active`/`inactive`/`temporary_closed`/`archived` as a value. `lifecycle_blocked` — the
signal that Admin/Restaurant lifecycle currently forbids an Owner closure command — is mapped to
its own bounded copy distinct from every other refusal.

## Gates

| Command | What it proves |
| --- | --- |
| `npm run test:restaurant-owner-branch-temporal-ra-2h-p2` | topology, manifest, frozen P1 hash, scope/security scan |
| `npm run test:restaurant-owner-branch-temporal-ra-2h-p2-smoke` | real P1-shaped fixtures executed against the actual runtime module |
| `npm run test:restaurant-owner-branch-temporal-ra-2h-p2-mutations` | required/forbidden tokens plus behavioural corruption of the strict parsers |

Restaurant Web `tsc --noEmit` and `next build` both pass clean under the Windows-native toolchain.

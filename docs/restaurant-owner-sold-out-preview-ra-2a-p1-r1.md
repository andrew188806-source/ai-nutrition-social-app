# RA-2A-P1-R1 — Restaurant Owner sold-out preview

Baseline: `e74762e78fae210be926c956ee735fa83a621cf9` (RA-2A-P1), on pushed
`22a877c974e3efb39b3fe59e1b22f88a2711a319`.
Scope: one forward successor migration adding a single governed read. No application work, no new
role, schema, table or policy, and no change of any kind to RA-2A-P1.

## The gap

RA-2A-P1's mutation requires an `expectedVersion`, and the existing governed Restaurant read source
`public.restaurant_internal_branch_menu_items_v1(text)` projects `sold_out` but **not**
`sold_out_version` — confirmed against the live catalogue, whose result type is
`(branch_menu_item_id, restaurant_id, branch_id, menu_item_id, price, availability, sold_out,
branch_specific_name, branch_specific_description, branch_specific_status)`.

An application therefore had no authorized way to learn the concurrency token it must supply. Every
alternative was worse: a direct table read (no client holds one, correctly), a service-role read
(unbounded), a guessed version (defeats the whole ABA contract), or calling the mutation itself —
which is state-changing authority, not a preview.

## The preview

`public.restaurant_owner_preview_branch_menu_item_sold_out_v1(p_restaurant_id text, p_branch_id
text, p_branch_menu_item_id text)` returns

```json
{ "ok": true, "state": "ready", "branchMenuItemId": "…", "branchId": "…",
  "menuItemId": "…", "soldOut": false, "soldOutVersion": "2" }
```

and nothing else. Refusals are `unauthenticated`, `permission_denied`, `target_not_found` or
`invalid_request`, and carry no other field. `sold_out_version` is cast to text inside PostgreSQL:
bigint exceeds the range JSON consumers represent exactly, and a silently rounded concurrency token
is worse than no token.

The three parameters are **selectors, never authority**. The actor is only the verified request
subject, and the function proves the same effective Owner chain the mutation does — enabled user,
active membership, active `owner` role, `branch_menu_item.sold_out.write` at restaurant scope, that
restaurant, that offering.

## Why the tenant predicate is joined rather than left to row level security

The first implementation resolved the target with a plain `WHERE` and relied on this round's
owner-scoped RLS policy to narrow the table. **The real-cluster gate proved that wrong**: an owner of
restaurant B successfully previewed an offering belonging to restaurant A.

`public.branch_menu_items` already carries a **permissive** policy granted to PUBLIC
(`branch_items_public_read_dev`), and PostgreSQL OR's permissive policies together. On the read path
the owner-scoped policy therefore cannot narrow anything: any row the public policy admits is visible
to every role, this function's owner included.

RA-2A-P1's mutation is unaffected, and the same gate re-proves it: a locking read is additionally
gated by the UPDATE policy, and no permissive PUBLIC policy exists for UPDATE. A preview has no such
second gate, so it proves the tenant itself by joining the caller's own membership chain. That also
keeps the privacy contract exact — a row under another restaurant produces no join row, which is the
same result as a row that does not exist, so both return `target_not_found`.

## Read-only by construction

The function is declared `STABLE`, so PostgreSQL itself refuses an UPDATE, INSERT or audit write
inside it: the read-only guarantee is enforced by the language rather than by review. It takes no row
lock. Repeated previewing leaves the business row and the audit relation byte-identical, proven both
on a real cluster and against Development.

## Security lifecycle

`SECURITY DEFINER`, empty `search_path`, `row_security = on`, owned by the **existing**
`restaurant_owner_branch_menu_item_write_authority`. No second sealed role, so the RA-1C-R1 governed
role manifest is unchanged and its evidence is imported untouched.

The writer already held column `SELECT` on exactly the columns projected here — and notably not on
`price` — plus column `SELECT` on the authority chain, so **no new grant, policy, schema, table or
role was required**. Reusing that read authority is strictly smaller than granting a new one.

ACL is settled before ownership moves, as RA-1A established: `authenticated` receives EXECUTE, and
PUBLIC, `anon`, `authenticator` and `service_role` are explicitly revoked. The transient sealed-role
membership taken for the ownership transfer is released, and the platform's automatic creator row is
left exactly as RA-1C-R1 adjudicated it.

## One SQL detail worth recording

The migration's closing assertions originally used `POSITION(x IN y)`, which is SQL *syntax* rather
than a schema-qualifiable function and cannot be written qualified under the empty `search_path` the
block runs beneath. It is now `pg_catalog.strpos`, which is a genuine function — the same distinction
RA-1A documents for `least`, `greatest` and `coalesce`.

## Exact changed paths

| Path | Purpose |
| --- | --- |
| `supabase/migrations/20260904040000_restaurant_owner_branch_menu_item_sold_out_preview.sql` | The forward successor migration |
| `scripts/restaurant-owner-sold-out-preview-ra-2a-p1-r1-contract.mjs` | Successor manifest and shared contract |
| `scripts/restaurant-owner-sold-out-preview-ra-2a-p1-r1-guard.mjs` | Scope, topology, predecessor freeze, hygiene |
| `scripts/restaurant-owner-sold-out-preview-ra-2a-p1-r1-smoke.mjs` | Contract runner |
| `scripts/restaurant-owner-sold-out-preview-ra-2a-p1-r1-mutations.mjs` | In-memory mutation runner |
| `scripts/restaurant-owner-sold-out-preview-ra-2a-p1-r1-postgres-apply.mjs` | Real PostgreSQL 17.6 non-superuser apply and behaviour gate |
| `scripts/restaurant-owner-sold-out-preview-ra-2a-p1-r1-development-acceptance.mjs` | Read-only Development acceptance |
| `docs/restaurant-owner-sold-out-preview-ra-2a-p1-r1.md` | This record |
| `package.json` | Five dedicated commands |

RA-2A-P1's migration keeps its pinned normalized SHA-256
`b28a496dda43383e96d977c8e54ef54e6619f77bb2a1c3d949fe422bf36ecc01`, asserted by this round's guard
and by a dedicated mutant.

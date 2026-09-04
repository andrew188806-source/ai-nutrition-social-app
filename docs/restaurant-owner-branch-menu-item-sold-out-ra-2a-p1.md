# RA-2A-P1 — Restaurant Owner branch-menu-item sold-out authority

Baseline: `22a877c974e3efb39b3fe59e1b22f88a2711a319`.
Scope: the privileged database layer for one Restaurant Owner business mutation. No Restaurant Web
API, server route or UI is part of this round. One forward migration; no predecessor is rewritten.

## The operation

`public.restaurant_owner_set_branch_menu_item_sold_out_v1(text, boolean, boolean, bigint)` marks one
branch-menu offering sold out, or available again. That is the entire capability. It is not menu
editing: price, availability, branch-specific naming, branch-specific status, nutrition, allergen and
ingredient data are all unwritable through this authority, enforced by column-level `UPDATE`
privilege rather than by the function's good behaviour.

Canonical transitions are `false → true` and `true → false`. There is no normal no-op: a request for
the state that already holds returns `no_change` and writes nothing.

## Authority

The actor is only ever the verified request subject. The function takes no actor, owner, user,
membership, role or permission parameter, so a caller can neither name somebody else nor assert an
authority they do not hold. A target id identifies a row; it never establishes authority.

The chain proved on every call is the frozen Restaurant one: JWT subject → enabled `restaurant_user`
→ active `restaurant_membership` → active `owner` role → `branch_menu_item.sold_out.write` at
`restaurant` scope → the target's own restaurant → the target row.

One new permission key is seeded, on the existing canonical Owner role only, at restaurant scope.
Manager and staff receive nothing. The `role_permissions` CHECK widens by exactly one value.

## Tenant proof is doubled, deliberately

The row-level policies on `public.branch_menu_items` repeat the ownership chain the function also
checks. If the function's tenant logic were ever wrong, row level security would still refuse to show
or update another restaurant's row, so a cross-tenant write requires two independent failures.

It also settles the privacy contract: because the policies remove out-of-scope rows before the
function can see them, **a row under another restaurant and a row that does not exist are the same
query result**. Both return `target_not_found`. Cross-tenant probing therefore learns nothing, and
`permission_denied` is reserved for a caller who is not an owner holding this permission anywhere.

## Concurrency

`branch_menu_items.sold_out_version` is a `bigint NOT NULL DEFAULT 0` with a non-negative invariant.
A `BEFORE INSERT OR UPDATE` trigger owns it: whatever value a writer supplies is discarded, the
counter advances by exactly one when `sold_out` actually changes, and writes to unrelated columns
carry it through unchanged. Because the trigger is on the table rather than inside the RPC, a future
writer cannot change `sold_out` without advancing it, and no caller can set, roll back or reset it.

A mutation supplies `expectedSoldOut` and `expectedVersion`; both must match the locked row.
This is what makes ABA fail closed:

```
false / v0  →  true / v1  →  false / v2
```

A request still carrying `false / v0` is `stale_state`, even though `sold_out` is `false` again.
Expected state alone would have accepted it. The version is the concurrency authority, and it crosses
the API boundary as a decimal string, because `bigint` exceeds the range JSON consumers represent
exactly and a silently rounded concurrency token is worse than no token.

RA-2A-P1 deliberately has **no durable request receipt**. That architecture belongs to RA-1C and stays
separate: a repeated uncertain write carrying an old `expectedVersion` resolves as `stale_state`
rather than applying twice.

## Result vocabulary

`unauthenticated`, `permission_denied`, `target_not_found`, `stale_state`, `no_change`,
`invalid_request`. No raw PostgreSQL condition reaches a caller.

## Audit

`restaurant_internal.branch_menu_item_sold_out_audit_log` is typed and append-only: no `UPDATE` or
`DELETE` policy exists for any role, and no client role holds any privilege on it or on the schema.
It records the server-derived actor and membership id, the restaurant, branch and offering, and the
before/after booleans and versions. No request blob, no caller-supplied actor, no free-text reason.

Only applied transitions are audited — a refusal changes nothing and has nothing to attest. The
insert runs in the same transaction as the update, so a changed offering without its transition
record is not a state this schema can reach.

## Sealed writer

`restaurant_owner_branch_menu_item_write_authority` is `NOLOGIN NOINHERIT NOBYPASSRLS`, with no
`SUPERUSER`, `CREATEDB`, `CREATEROLE` or `REPLICATION`. It is a new role rather than a reuse of
`restaurant_membership_context_reader`, which is a read authority and must not acquire a write path.
It holds column `SELECT` on exactly the authority chain, column `UPDATE` on `sold_out` alone, and
`SELECT`/`INSERT` on its own audit relation. No client or runtime role is a member.

It joins the RA-1C-R1 governed control-plane set carrying the accepted platform creator row —
member `postgres`, grantor `supabase_admin`, `admin_option` true, `inherit` false, `set` false, with
`USAGE` and `SET` both false. RA-1C-R1 adjudicated that row: only the cluster superuser can clear it,
and clearing it would remove the repository's ability to maintain these roles at all. This round
pins that shape and does not attempt to change it. The R1 manifest is imported unchanged.

## One thing the migration had to solve

`public.role_permissions` and `public.restaurant_roles` both carry FORCE row level security, and
FORCE applies to the owner too. `role_permissions` has no `INSERT` policy for any role, and
`restaurant_roles` is readable only through a policy scoped to the verified request subject — which a
migration does not have. Their original rows were seeded before RLS was enabled.

The seed is therefore bracketed by an explicit same-transaction suspension, restored immediately, and
verified inside that window. It would have been possible to rely on the migration runner happening to
hold `BYPASSRLS`, which it does on Development — but that is a platform detail of one environment,
and a migration depending on it silently inserts nothing wherever it is absent. The real-cluster
apply gate caught exactly that, and the closing assertion refuses to commit if the row did not land.

## Exact changed paths

| Path | Purpose |
| --- | --- |
| `supabase/migrations/20260904030000_restaurant_owner_branch_menu_item_sold_out_authority.sql` | The forward migration |
| `scripts/restaurant-owner-sold-out-ra-2a-p1-successor-manifest.mjs` | Frozen pins and governed control-plane set |
| `scripts/restaurant-owner-sold-out-ra-2a-p1-contract.mjs` | Shared source contract |
| `scripts/restaurant-owner-sold-out-ra-2a-p1-guard.mjs` | Scope, topology, integrity, hygiene |
| `scripts/restaurant-owner-sold-out-ra-2a-p1-smoke.mjs` | Contract runner |
| `scripts/restaurant-owner-sold-out-ra-2a-p1-mutations.mjs` | In-memory mutation runner |
| `scripts/restaurant-owner-sold-out-ra-2a-p1-postgres-apply.mjs` | Real PostgreSQL 17.6 non-superuser apply and behaviour gate |
| `scripts/restaurant-owner-sold-out-ra-2a-p1-development-acceptance.mjs` | Development acceptance |
| `docs/restaurant-owner-branch-menu-item-sold-out-ra-2a-p1.md` | This record |
| `package.json` | Five dedicated commands |

## Validation record

- Guard, smoke, mutations and the real-cluster apply gate: counts are reported by each runner.
- The apply gate applies every frozen predecessor plus this migration through `COMMIT` on a
  disposable PostgreSQL 17.6 cluster **as a non-superuser runner**, with the cluster superuser named
  `supabase_admin`, reproducing the Development role topology rather than assuming it.
- Development acceptance targets `dev-bmi-b-main` under the non-public draft restaurant
  `dev-restaurant-hidden`. The public demo offerings and the public demo branches are enumerated in
  the successor manifest solely so the guard and the mutation runner can prove they are never
  reachable as an acceptance target; this document does not name them, so the guard's
  forbidden-target scan covers the prose too.

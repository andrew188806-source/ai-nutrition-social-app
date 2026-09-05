# RA-2B-P1 — Restaurant Owner branch-menu availability authority

Baseline: `bbe60548ea8e65abce22b4ed330980c4a856d3bb`.
Scope: one forward migration adding the privileged database layer for a second, independent
Restaurant Owner write. No Restaurant Web activation is part of this round, and RA-2A is untouched.

## The operation

`public.restaurant_owner_set_branch_menu_item_availability_v1(branchMenuItemId, expectedAvailability,
nextAvailability, expectedVersion)` moves one branch-menu offering between `available`, `limited` and
`unavailable`. `public.restaurant_owner_preview_branch_menu_item_availability_v1(restaurantId,
branchId, branchMenuItemId)` returns the current value and its concurrency token. Both ship together:
a mutation that requires an `expectedVersion` is unusable without a canonical way to read one.

One new permission, `branch_menu_item.availability.write` at `restaurant` scope, on the existing
canonical Owner role only. Manager and staff receive nothing, and RA-2A's permission row is preserved.

## Why a second sealed role

Both operations write `public.branch_menu_items`, so the cheap move would be to add one column grant
to RA-2A's writer. That is refused deliberately.

`sold_out` answers "is this finished for today". `availability` answers "do we offer this at all".
They are separate operational dimensions with separate audit trails, and a single role holding both
would mean a defect in either operation could write the other's column. Operation-level least
privilege costs one role and buys a boundary a migration cannot erase by accident.

The migration asserts the independence in **both** directions before it commits, and the real-cluster
gate proves it behaviourally: an availability write leaves `sold_out`, `sold_out_version` and the
sold-out audit byte-identical, and a sold-out write leaves `availability`, `availability_version` and
the availability audit byte-identical.

## Why the tenant policies are RESTRICTIVE

`public.branch_menu_items` carries a **permissive** policy granted to PUBLIC
(`branch_items_public_read_dev`, admitting `availability IN ('available','limited') AND sold_out =
false AND branch_specific_status = 'available'`). PostgreSQL **OR**s permissive policies together, so
a permissive owner-scoped policy narrows nothing on the read path — RA-2A-P1-R1 proved exactly that
against a real cluster, where an owner of one restaurant could read another's row.

This round therefore adds two pairs:

- **permissive** `branch_menu_items_owner_availability_select` / `_update` — these make rows visible
  and updatable to the sealed role at all. Restrictive policies alone grant nothing: with no
  applicable permissive policy, no row is visible.
- **RESTRICTIVE** `branch_menu_items_owner_availability_tenant_select` / `_tenant_update` — these are
  AND'ed with every applicable permissive policy, including the PUBLIC one, and carry the tenant
  predicate.

Both properties are asserted in the migration itself, which refuses to commit if the tenant policies
are not restrictive or if the permissive pair is missing. The apply gate then proves it
behaviourally: under the sealed role, an owner sees its own row and **not** a foreign one — while the
same query under RA-2A's permissive-only writer still returns the foreign row through the PUBLIC
policy. RA-2A's operation remains safe because its RPC joins the tenant chain; the contrast is
recorded here so the distinction is not lost.

**Even so, the functions prove the tenant themselves.** Both RPCs join the caller's own membership
chain, so a cross-tenant write needs two independent failures. That also makes a foreign row and a
nonexistent row the same query result — both return `target_not_found`.

## Concurrency

`availability_version bigint NOT NULL DEFAULT 0` with a non-negative invariant and its own
`BEFORE INSERT OR UPDATE` trigger. It is **not** a reuse of `sold_out_version`: two independent
operations must not invalidate each other's pending requests. The database owns the counter — any
caller-supplied value is discarded, unrelated column writes carry it through unchanged, and because
the trigger lives on the table a future writer cannot change availability without advancing it.

With three values, ABA is sharper than for a boolean:

```
available/0  →  limited/1  →  available/2
```

A request still carrying `available/0` is `stale_state`, even though availability is `available`
again. Expected state alone would have accepted it. The version is the concurrency authority, and it
crosses the boundary as a decimal string because bigint exceeds what JSON consumers represent exactly.

No durable idempotency receipt is introduced. A lost or uncertain result is resolved by the canonical
preview; RA-1C's receipt architecture stays where it belongs.

## Audit

`restaurant_internal.branch_menu_item_availability_audit_log` — typed, append-only, FORCE RLS, no
UPDATE/DELETE policy, no client privilege on relation or schema. It records the server-derived actor
and membership, the restaurant, branch and offering, and the before/after values and versions. No
JSON blob, no free text, no caller-supplied actor. Only applied transitions. The insert runs in the
same transaction as the update, so a changed offering without its record is unreachable — proven by
injecting an audit failure and observing the rollback.

RA-2A's audit relation is neither widened nor written by this round.

## Downstream semantics — verified, not redesigned

The apply gate confirms the existing catalogue rules are unchanged: `available` and `limited` are
catalogue-eligible, `unavailable` is not. No consumer or recommendation view was modified.

## Exact changed paths

| Path | Purpose |
| --- | --- |
| `supabase/migrations/20260905010000_restaurant_owner_branch_menu_item_availability_authority.sql` | The forward migration |
| `scripts/restaurant-owner-availability-ra-2b-p1-contract.mjs` | Successor manifest and shared contract |
| `scripts/restaurant-owner-availability-ra-2b-p1-guard.mjs` | Scope, topology, RA-2A freeze, hygiene |
| `scripts/restaurant-owner-availability-ra-2b-p1-smoke.mjs` | Contract runner |
| `scripts/restaurant-owner-availability-ra-2b-p1-mutations.mjs` | In-memory mutation runner |
| `scripts/restaurant-owner-availability-ra-2b-p1-postgres-apply.mjs` | Real PostgreSQL 17.6 non-superuser apply and authority gate |
| `scripts/restaurant-owner-availability-ra-2b-p1-development-acceptance.mjs` | Development acceptance |
| `docs/restaurant-owner-availability-ra-2b-p1.md` | This record |
| `package.json` | Five dedicated commands |

RA-2A keeps both pinned hashes:
`b28a496dda43383e96d977c8e54ef54e6619f77bb2a1c3d949fe422bf36ecc01` (authority) and
`84cf0285a1087a2386fcc3e70d8f75d3d6b28023c843361e42fcd37ab0ef7376` (preview), asserted by this
round's guard and by dedicated mutants.

## One migration detail worth recording

`public.role_permissions` and `public.restaurant_roles` both carry FORCE row level security, which
applies to the owner too; `role_permissions` has no INSERT policy and `restaurant_roles` is readable
only through a subject-scoped policy a migration does not have. The seed is therefore bracketed by an
explicit same-transaction suspension and **verified inside that window** — a check placed after the
restore would count zero for reasons unrelated to whether the seed worked. Relying instead on the
runner happening to hold `BYPASSRLS` would insert nothing wherever that attribute is absent; the
apply gate runs as a non-superuser without it, and asserts so explicitly.

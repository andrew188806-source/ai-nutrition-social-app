# RA-2D-P1 — Governed Restaurant Owner offering visibility authority

## What this round governs

**Temporary Owner-controlled visibility** of a branch-menu offering, restricted to exactly one
reversible pair of transitions on the existing `public.branch_menu_items.branch_specific_status`
column:

| Transition | Owner-facing copy |
| --- | --- |
| `available -> hidden` | 「暫時隱藏」(temporarily hide) |
| `hidden -> available` | 「恢復顯示」(restore display) |

`available` means the offering is **allowed** to participate in normal publication and
recommendation eligibility, subject to every other existing gate. `hidden` means the Owner has
**temporarily** hidden the offering from that eligibility while every other fact about it —
`sold_out`, `availability`, `price`, names, descriptions — is preserved untouched.

This round deliberately avoids stronger lifecycle language. It never uses 停售 (stop selling),
刪除 (delete), 永久停售 (permanently discontinue) or 停產 (discontinue production) — those describe a
different, unresolved authority.

## `discontinued` is out of scope

`discontinued` remains a valid stored value — existing rows holding it are neither migrated nor
reinterpreted — but this round grants the Owner **no authority** to move a row into or out of it, in
either direction. Its future governance is deliberately left unresolved.

### Where that boundary is enforced, and why not in a trigger

The natural instinct is a table-level trigger that blocks any transition touching `discontinued`.
This round does **not** do that. Transition legality (which values an Owner may move between) is an
**authorization** rule, not a **value-domain** rule — unlike RA-2C-P1's canonical price range, which
must hold no matter who writes the column. A blanket trigger would need to be loosened by whichever
future round is eventually authorized to govern `discontinued`, coupling this round to a decision
that has not been made.

Instead, the boundary lives entirely in the mutation RPC, split across two distinct bounded results
depending on *which side* of the transition names `discontinued`:

- `nextStatus` (the Owner-selectable destination) has a vocabulary of exactly `{available, hidden}`.
  `discontinued` is not a member of that vocabulary at all, so naming it is **`invalid_request`** —
  the same treatment RA-2B-P1 gives an out-of-vocabulary `nextAvailability` value.
- `expectedStatus` (the caller's belief about the current value) legitimately admits `discontinued`,
  because a caller previewing a genuinely discontinued row needs to be able to name it. Any mutation
  where the expected status is `discontinued` is refused as **`invalid_transition`** before the
  target row is even locked.

Together these two paths cover all four forbidden directions (`available/hidden -> discontinued` via
the vocabulary check; `discontinued -> available/hidden` via the transition check) without a single
line of trigger logic that references `discontinued`.

### Compatibility, proven on a real cluster

A `discontinued` row is fully valid for every existing predecessor operation: RA-2A's sold-out
mutation, RA-2B's availability mutation and RA-2C's price mutation all still succeed on it, each
preserving `branch_specific_status` and its version byte-identically. No new CHECK constraint
references `branch_specific_status` beyond the pre-existing three-value enum.

## Publication safety — the core proof of this round

`hidden -> available` is potentially a publication action, and this is explicitly accepted for the
Restaurant Owner. But `branch_specific_status = available` is only **one** of several predicates the
existing `public.consumer_public_restaurant_catalog_v1` view already requires:

```sql
join restaurant_branches rb on ... and rb.status = 'active'
join menus m               on ... and m.status = 'published'
join menu_items mi         on ... and mi.status = 'active'
join branch_menu_items bmi on ...
  and bmi.availability in ('available', 'limited')
  and bmi.sold_out = false
  and bmi.branch_specific_status = 'available'
where restaurants.status = 'active'
```

This round adds **no new publication SQL** — the positive and negative proofs below exercise the
view exactly as it already existed. Restoring visibility naturally republishes an offering when every
other gate already holds, and naturally fails to publish it when any parent gate is blocking. Proven
on a real PostgreSQL 17.6 cluster, for every gate independently:

| Blocking condition | `hidden -> available` result |
| --- | --- |
| (all other gates satisfied) | **republishes** — the positive proof |
| parent Restaurant is `draft` | Owner's own authority succeeds; catalogue eligibility does not |
| Branch is `inactive` | same |
| Menu is unpublished (`draft`) | same |
| Menu item is not `active` | same |
| `availability = 'unavailable'` | same |
| `sold_out = true` | same |

In every negative case, the visibility mutation itself **succeeds** (the Owner's own authority is
real) — only the *derived* publication eligibility stays blocked by the parent gate. This is the
proof that Owner restore cannot be used to bypass Admin or parent-level authority.

## Authority topology

| Concern | Value |
| --- | --- |
| Permission key | `branch_menu_item.visibility.write`, scope `restaurant`, Owner only |
| Sealed role | `restaurant_owner_branch_menu_item_visibility_write_authority` (`NOLOGIN NOINHERIT NOBYPASSRLS`) |
| Column privilege | `UPDATE(branch_specific_status)` **only** |
| Concurrency token | `branch_specific_status_version bigint not null default 0`, DB-maintained, pure bookkeeping |
| Audit | `restaurant_internal.branch_menu_item_visibility_audit_log`, append-only, FORCE RLS |
| Preview RPC | `restaurant_owner_preview_branch_menu_item_visibility_v1(text, text, text)` — STABLE |
| Mutation RPC | `restaurant_owner_set_branch_menu_item_visibility_v1(text, text, text, bigint)` |
| Result vocabulary | `unauthenticated`, `permission_denied`, `target_not_found`, `invalid_request`, `invalid_transition`, `stale_state`, `no_change` |

### Four independent writers

`sold_out`, `availability`, `price` and now `visibility` are four separate governed operations with
four separate sealed roles, four separate version counters and four separate audit relations. The
migration asserts the independence in both directions before it commits, and the PostgreSQL gate
proves it behaviourally in every direction: the visibility write leaves `sold_out`/`availability`/
`price` untouched, and each of those three predecessor writes leaves `branch_specific_status`
untouched.

### Why the tenant policies are RESTRICTIVE

Same reasoning as every predecessor since RA-2A-P1-R1: `public.branch_menu_items` carries a
**permissive** read policy granted to `PUBLIC`, and PostgreSQL ORs permissive policies together. A
permissive owner-scoped policy would narrow nothing. This round ships a permissive pair that grants
and a **RESTRICTIVE** pair that narrows, and the RPCs additionally join the caller's membership chain
rather than delegating tenancy to row level security.

## Sealed-role successor manifest

Repository evidence:

| Inventory | Count |
| --- | --- |
| RA-1C-R1 governed roles | 17 |
| RA-2A-P1 governed roles | 18 |
| RA-2C-P1 governed roles (closed RA-2B's manifest gap) | 20 |
| **RA-2D-P1 governed roles** | **21** |
| Repository `CREATE ROLE` definitions | 23 |
| — of which Restaurant Owner writers | 4 |
| — remainder, matching RA-1C-R1's adjudication | 19 |

**RA-2D-P1's own successor addition is the visibility writer and nothing else.**

## Gates

| Command | What it proves |
| --- | --- |
| `npm run test:restaurant-owner-visibility-ra-2d-p1` | repository topology, freeze and scope |
| `npm run test:restaurant-owner-visibility-ra-2d-p1-smoke` | every contract claim against the frozen source |
| `npm run test:restaurant-owner-visibility-ra-2d-p1-mutations` | each claim actually kills a corruption |
| `npm run test:restaurant-owner-visibility-ra-2d-p1-postgres` | real PostgreSQL 17.6, non-superuser runner, publication safety |

The PostgreSQL gate needs `RA2DP1_PG_BIN` (a PostgreSQL 17.x `native/bin` directory) and
`RA2DP1_PG_MODULES` (a directory whose `node_modules` contains `pg`). Without them it reports
`skipped` rather than pretending to have proven anything.

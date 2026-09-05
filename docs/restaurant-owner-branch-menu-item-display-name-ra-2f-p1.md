# RA-2F-P1 — Governed Restaurant Owner branch-menu display-name OVERRIDE authority

## What this round governs

An **optional, presentation-only override** of the public display label for one branch-menu
offering: `public.branch_menu_items.branch_specific_name`. Nothing about canonical menu identity is
touched — `menu_item_id` never changes, `menu_items.name` (the canonical dish name) is never written
by this authority, and nutrition, allergens, taxonomy, recommendation and Meal Buddy matching all key
off `menu_item_id` and canonical structured data this round never reaches.

`branch_specific_description` is explicitly **out of scope**. Reconnaissance found materially higher
content-safety risk there — free text can carry factual claims (無花生 / 純素 / 低鈉 / 高蛋白) without
touching structured allergen truth — and that remains deferred pending a content-claim/moderation
policy. This round's writer holds **no privilege at all**, not even `SELECT`, on that column.

## The fallback, unchanged

The public catalogue projection already reads:

```sql
COALESCE(branch_menu_items.branch_specific_name, menu_items.name) AS menu_item_name
```

This round adds **no new publication SQL**. `NULL` means "use the canonical name"; a non-`NULL`
override means "show this text at this branch instead." Governing the move between those two states,
safely, is the entire scope of this round.

## SET / CLEAR, not string-shaped guessing

The Owner-selectable operation vocabulary is exactly `{set, clear}`, chosen explicitly by the caller
— never inferred from the shape of the input string:

| Input | Result |
| --- | --- |
| `set` with a valid 1–80 character canonical string | applied — stores the string |
| `set` with empty or whitespace-only text | `invalid_request` — **never** `clear`, **never** `no_change` |
| `clear` | applied — stores real SQL `NULL` |
| `clear` with a non-`NULL` next value supplied | `invalid_request` — the operation and its payload must agree |
| `set` with a `NULL` next value | `invalid_request` |

CLEAR is never implemented by copying `menu_items.name` into the override column — the durable
representation of "no override" is `NULL`, full stop.

## The canonical text contract (identical to RA-2E-P1's, for a different column)

1 to 80 Unicode characters after outer-trim canonicalization (interior whitespace preserved, no case
folding, no Unicode normalization), control characters refused, no uniqueness requirement. The guard
lives in the same trigger that maintains the version — a value-domain invariant, not an authorization
rule — and is **skipped entirely when the new value is `NULL`**, so `clear` never has to satisfy it.

### Nullable-safe throughout

Both the expected-override concurrency check and the no-change comparison use PostgreSQL's
`IS [NOT] DISTINCT FROM`, never `=` — the only operator that correctly treats two `NULL`s as equal
and a `NULL` vs. a string as different. `NULL` is never conflated with an empty string anywhere in
the RPC.

## Trigger convention: this table's own, not RA-2E's

`branch_menu_items` already carries three sibling version triggers (`sold_out_version`,
`availability_version`, `price_version`) built as a single `BEFORE INSERT OR UPDATE` trigger that
checks `IS DISTINCT FROM` internally, rather than `restaurant_branches`' newer
`BEFORE UPDATE OF <column> ... WHEN` scoping. This round mirrors **this table's own** established
convention for consistency with its three siblings, not the other table's newer pattern.

## Authority topology

| Concern | Value |
| --- | --- |
| Permission key | `branch_menu_item.display_name.write`, scope `restaurant`, Owner only |
| Sealed role | `restaurant_owner_branch_menu_item_display_name_write_authority` (`NOLOGIN NOINHERIT NOBYPASSRLS`) |
| Column privilege | `UPDATE(branch_specific_name)` **only** — zero privilege on `branch_specific_description` |
| Concurrency token | `branch_specific_name_version bigint not null default 0`, independent of every sibling version |
| Audit | `restaurant_internal.branch_menu_item_display_name_audit_log`, nullable previous/next, append-only, FORCE RLS |
| Preview RPC | `restaurant_owner_preview_branch_menu_item_display_name_v1(text, text, text)` — STABLE |
| Mutation RPC | `restaurant_owner_set_branch_menu_item_display_name_v1(text, text, text, text, bigint)` |
| Result vocabulary | `unauthenticated`, `permission_denied`, `target_not_found`, `invalid_request`, `stale_state`, `no_change` |

### Six independent writers, one target table

`sold_out`, `availability`, `price`, `visibility` and now `branch_specific_name` are five separate
governed operations on `branch_menu_items`, each with its own sealed role, version counter and audit
trail (plus `restaurant_branches.name` on the sibling table). The migration asserts independence in
both directions before it commits, and the PostgreSQL gate proves it behaviourally against all four
predecessor writers on the same row.

### Preview: override vs. canonical, kept distinct

```json
{ "branchSpecificDisplayName": null, "canonicalDisplayName": "B Item", "branchSpecificDisplayNameVersion": "0" }
```

The fallback is never materialized into the override field — a future application layer can
truthfully render "currently showing the canonical name" without special-casing.

## Sealed-role successor manifest

| Inventory | Count |
| --- | --- |
| RA-1C-R1 governed roles | 17 |
| RA-2E-P1 governed roles (unified lineage) | 22 |
| **RA-2F-P1 governed roles** | **23** |
| Repository `CREATE ROLE` definitions, before this round | 24 |
| Repository `CREATE ROLE` definitions, after this round | 25 |

## Gates

| Command | What it proves |
| --- | --- |
| `npm run test:restaurant-owner-branch-menu-item-display-name-ra-2f-p1` | repository topology, freeze and scope |
| `npm run test:restaurant-owner-branch-menu-item-display-name-ra-2f-p1-smoke` | every contract claim against the frozen source |
| `npm run test:restaurant-owner-branch-menu-item-display-name-ra-2f-p1-mutations` | each claim actually kills a corruption |
| `npm run test:restaurant-owner-branch-menu-item-display-name-ra-2f-p1-postgres` | real PostgreSQL 17.6, non-superuser runner, full fallback proof |

The PostgreSQL gate needs `RA2FP1_PG_BIN` (a PostgreSQL 17.x `native/bin` directory) and
`RA2FP1_PG_MODULES` (a directory whose `node_modules` contains `pg`). Without them it reports
`skipped` rather than pretending to have proven anything. It proves the full fallback cycle
(`NULL → override → NULL`) against a dedicated, fully publication-eligible fixture, canonical-identity
independence (`menu_item_id`/`menu_items.name` untouched), legacy compatibility (a pre-existing
empty-string override never blocks any of the four predecessor mutations), and publication safety
(a draft Restaurant's item can be SET/CLEARed without gaining catalogue eligibility).

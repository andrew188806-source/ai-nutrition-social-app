# R2B — Restaurant Catalog Authoring Privileged Authority

> Backend/security authority only. No UI. `apps/restaurant-web` is not wired to any of this yet —
> that is R2C. This document is the construction-ready contract R2C consumes.

## Why this round exists

Before R2B, every Restaurant Owner write RPC in this codebase (the RA-2A–RA-2I family) was
`UPDATE`-only against pre-seeded `menus`/`menu_categories`/`menu_items`/`branch_menu_items` rows —
there was no `INSERT` capability anywhere. R2B closes that gap: Restaurant Owners can now create
their own menus, categories, items, and branch linkages, not just edit fields on rows someone else
already inserted.

## Tenant-local canonical semantics

`menu_items.name` is **restaurant-tenant-local** content, not platform-global shared data.
`menu_items.restaurant_id` is a first-class direct FK (redundant with, not merely implied by, the
`menu_category_id → menu_categories.menu_id → menus.restaurant_id` chain), and there is no evidence
anywhere of cross-restaurant row sharing. R2B-1 makes this chain-agreement a DB-enforced invariant
for the first time (below).

## R2B-1 — Tenant consistency triggers

`supabase/migrations/20260918010000_restaurant_catalog_tenant_consistency_r2b_1.sql`.

Two `BEFORE INSERT OR UPDATE` triggers, `SECURITY DEFINER` with `search_path` pinned empty, owned
by the migration-executing role (so they always resolve the parent chain regardless of the writer's
own grants):

- `menu_items`: `restaurant_id` must equal `menu_category_id → menu_categories.menu_id →
  menus.restaurant_id`.
- `branch_menu_items`: `restaurant_id` must equal **both** `branch_id →
  restaurant_branches.restaurant_id` **and** `menu_item_id → menu_items.restaurant_id`.

This is a **relational invariant only** — it grants no authority, reads no JWT, and makes no
authorization decision (that remains RPC/RLS). It fires for every writer, including a privileged
manual fixture write, and is proven directly in the postgres-apply harness (checks 051–053) by
attempting exactly that and observing rejection.

The migration opens with a read-only existing-data precheck: if any row already violates the
invariant, the migration raises and aborts rather than silently repairing data. On the fresh
127-migration baseline this is always zero rows; if Development or Production ever holds
inconsistent historical rows, the migration reports the count and stops — it does not fix them.

## Permission keys and roles

| Permission key | Scope | Sealed role | Migration |
| --- | --- | --- | --- |
| `menu.write` | restaurant | `restaurant_owner_menu_write_authority` | R2B-2 |
| `menu_category.write` | restaurant | `restaurant_owner_menu_category_write_authority` | R2B-3 |
| `menu_item.write` | restaurant | `restaurant_owner_menu_item_write_authority` | R2B-4 |
| `branch_menu_item.create` | restaurant | `restaurant_owner_branch_menu_item_creation_authority` | R2B-5 |

All four are granted to the `owner` role only, following the identical pattern as every RA-2 round.
`branch_menu_item.create` is a genuinely new, separate sealed role from the five existing
`branch_menu_items` field-write roles (sold-out, availability, price, visibility, display-name) —
row creation is a different privilege than editing an existing row, and none of those five roles
was widened.

**Pattern note**: unlike the successor-authority design R2A proposed, these RPCs do **not** call the
generic `public.restaurant_has_restaurant_permission`/`restaurant_has_branch_permission` helpers.
Those functions are `SECURITY DEFINER`, owned by `restaurant_membership_context_reader`, whose
membership was deliberately revoked from `postgres` at the end of its own migration (RA-2B-P0) —
granting `EXECUTE` on them to a brand-new sealed role would require re-acquiring administrative
authority over that frozen predecessor role, which R2B does not do. Every gate instead uses the
same explicit owner+active-membership+permission join every existing RA-2 RPC already uses, which
R2A independently verified is semantically identical.

## RPC contracts (R2C consumes these)

All are `SECURITY DEFINER`, `SET search_path=''`, `SET row_security='on'`, `authenticated`-callable,
take no actor argument (the actor is always derived from the JWT), and return `jsonb`.

### Menu (R2B-2)

- `restaurant_owner_create_menu_v1(p_restaurant_id, p_name) → { ok, state:'created', menuId,
  restaurantId, name, nameVersion, status:'draft', statusVersion, auditId }`. Status is always
  `'draft'` at creation; there is no `p_status` parameter.
- `restaurant_owner_preview_menu_v1(p_restaurant_id, p_menu_id)` — read-only, `STABLE`.
- `restaurant_owner_set_menu_name_v1(p_menu_id, p_expected_name, p_next_name, p_expected_version)`
  — never touches status/statusVersion.
- `restaurant_owner_transition_menu_status_v1(p_menu_id, p_expected_status, p_next_status,
  p_expected_version)` — accepted transitions **only**: `draft→published`, `published→archived`,
  `draft→archived`. No `archived→*` transition exists (no resurrection). Returns
  `invalid_transition` for anything else. Never touches name/nameVersion.

Two independent concurrency tokens, `name_version` and `status_version`, so a pending rename is
never invalidated by an unrelated status change and vice versa.

### Menu Category (R2B-3)

- `restaurant_owner_create_menu_category_v1(p_menu_id, p_name, p_sort_order?)` — **never** accepts
  `restaurant_id`; it is derived exclusively from `p_menu_id → menus.restaurant_id`. Omitted
  `p_sort_order` defaults to the next deterministic slot within the parent menu.
- `restaurant_owner_preview_menu_category_v1(p_restaurant_id, p_menu_category_id)`.
- `restaurant_owner_set_menu_category_content_v1(p_menu_category_id, p_expected_name, p_next_name,
  p_expected_sort_order, p_next_sort_order, p_expected_version)` — rename and reorder share **one**
  `content_version` (the smallest safe concurrency model: `menu_categories` had no version column at
  all before this round, and name/sort_order are not independently-grantable capabilities the way
  RA-2's UPDATE-only fields are, so one combined token is enough — see the migration's own header
  comment for the full reasoning).

**`CATEGORY_DELETE_DEFERRED`**: no delete RPC exists. Destructive semantics are not required for MVP
catalog authoring, and `menu_categories` has no lifecycle/status column to make a soft-delete
meaningful — adding one solely for delete would be scope creep this round explicitly avoids.
Restaurant Owners can create/rename/reorder categories today; delete is a future round's decision.

### Menu Item (R2B-4)

- `restaurant_owner_create_menu_item_v1(p_restaurant_id, p_menu_category_id, p_name, p_description?,
  p_allergens?)`. Two independent gates: (1) caller must hold `menu_item.write` for
  `p_restaurant_id`, and (2) `p_menu_category_id`'s own chain-derived restaurant must **equal**
  `p_restaurant_id` exactly — neither side is trusted alone. `nutrition_badge_status`,
  `badge_enabled`, `nutrition_id`, `tag_ids` and `image_url` are **not RPC parameters** — this is
  structural, not a UI omission: even a defective RPC body could not write them, because the sealed
  role's own `GRANT INSERT`/`GRANT UPDATE` column lists do not cover those columns at all.
- `restaurant_owner_preview_menu_item_v1(p_restaurant_id, p_menu_item_id)`.
- `restaurant_owner_set_menu_item_content_v1(p_menu_item_id, p_expected_name, p_next_name,
  p_expected_description, p_next_description, p_expected_allergens, p_next_allergens,
  p_expected_menu_category_id, p_next_menu_category_id, p_expected_version)` — name, description,
  allergens and category reassignment share one `content_version` (same one-token-per-permission
  reasoning as categories). A category move must resolve within the **same** restaurant or the call
  returns `invalid_request`.
- `restaurant_owner_transition_menu_item_status_v1(...)` — accepted transitions **only**:
  `draft→active`, `active→archived`, `draft→archived`. Independent `status_version`.

Allergens are advisory restaurant-entered data only (no enforced vocabulary, capped at 50 entries of
1–40 code points each) — never treated as verified nutrition/allergen authority; that remains the
separate, unrelated `candidate_allergen_facts` system.

### Branch Menu Item linkage creation (R2B-5)

- `restaurant_owner_link_menu_item_to_branch_v1(p_branch_id, p_menu_item_id, p_price,
  p_availability?)` — creates a new `branch_menu_items` row. `restaurant_id` is derived from **both**
  the branch and the item and **required to match**; cross-tenant combinations fail with
  `target_not_found`. Price reuses RA-2C-P1's exact canonical contract (whole TWD, 1–999999).
  `branch_specific_name`/`branch_specific_description` always start `NULL` (the canonical-fallback
  state) — **the RA-2F frozen contract is untouched**; only the existing SET/CLEAR RPC ever
  populates them. `sold_out`/`branch_specific_status` take their table default. A duplicate
  `(branch_id, menu_item_id)` reports `already_linked`, never a raw constraint error.

Once linked, the new row is an ordinary `branch_menu_items` row — every existing frozen RA-2 field
control (price, availability, sold-out, visibility, display-name) works on it immediately, proven in
the postgres-apply harness (checks 011–012).

## Lifecycle and Consumer visibility

New menus/items always start `draft`. Publishing/activation is a separate, explicit RPC call — never
implicit in create or edit. Consumer catalog visibility is governed entirely by the pre-existing
`consumer_public_restaurant_catalog_v1/v2` gate chain (`restaurant.status='active'`,
`branch.status='active' AND is_active`, `menu.status='published'`, `item.status='active'`, plus
branch-offer availability) — R2B changes nothing about that gate; a newly created item simply has to
satisfy the same conditions every existing item already does.

## Nutrition/taxonomy boundary

Zero change. `menu_item_nutrition` has no writer pipeline anywhere (before or after R2B).
`nutrition_badge_status` defaults `'missing'` and `badge_enabled` defaults `false` on every new item,
exactly like every existing item, and neither is ever settable through R2B's RPCs.

## Transaction model

Each RPC is one `SECURITY DEFINER` function call = one implicit transaction. There is no
client-orchestrated multi-step "create menu + category + item + linkage" flow — each operation is
independently authoritative, because Menu/Menu Item begin as `draft`, so partial completion (e.g. a
menu created but no category yet) is always a valid, non-broken state.

## Audit model

Four new append-only audit tables in `restaurant_internal`, one per authoring round, identical shape
to the existing RA-2F pattern: `actor_auth_user_id`, `membership_id`, `restaurant_id` + affected
entity id(s), an `action` enum, typed previous/next columns (with `CHECK` constraints pinning the
correct shape per action), `created_at`. `FORCE ROW LEVEL SECURITY`, `SELECT`/`INSERT` only to the
round's own sealed role, no `UPDATE`/`DELETE` policy for anyone.

- `menu_authoring_audit_log` — `CREATE` / `RENAME` / `STATUS_TRANSITION`.
- `menu_category_authoring_audit_log` — `CREATE` / `CONTENT_EDIT`.
- `menu_item_authoring_audit_log` — `CREATE` / `CONTENT_EDIT` / `STATUS_TRANSITION`.
- `branch_menu_item_creation_audit_log` — creation only (field edits stay in the existing five RA-2
  audit tables, untouched).

## Current test evidence

```
npm run test:restaurant-catalog-authoring-r2b-guard    # static source-freeze, no DB
npm run test:restaurant-catalog-authoring-r2b-smoke     # contract-vs-source agreement, no DB
npm run test:restaurant-catalog-authoring-r2b-postgres  # fresh PostgreSQL 17 apply + full mutation battery
```

The `-postgres` gate needs `R2B_PG_BIN`/`R2B_PG_MODULES` (or any of the pre-existing `RA2*_PG_BIN`
env pairs, tried as fallbacks) and reports `skipped` without them — same convention as every other
disposable-PostgreSQL gate in this repository. It applies all 132 migrations from zero (never
Development, never Production) and then exercises: the full positive create→edit→publish→link flow;
security negatives (anonymous, non-member, inactive membership, staff role, cross-tenant in every
direction); input validation (empty/whitespace/overlong/control-character names, invalid
price/enum/transition, archived-parent rejection); concurrency (two competing stale edits, duplicate
linkage race); and direct proof of the R2B-1 triggers via privileged fixture writes. 56/56 passing at
authoring time. The `-guard` script is a **frozen single-round** check (pins the migration set and
RPC/role/permission-key shapes as of R2B) — it is expected to FAIL once a later round lands on top of
it; that is normal frozen-round behavior, and the guard must never be loosened to force it green.

## R2C — what the UI layer still owns

No React component, route, or API handler exists yet. R2C should follow the exact file-quadruple
convention every existing RA-2 control already uses (no shared hook exists in this codebase — the
"reuse" is a copy-pattern, not an abstraction): a `runtime/restaurant-owner-<authority>.ts` validator
file, a `-client.ts` fetch wrapper, a `RestaurantOwner<Authority>Control.tsx`/form component, and a
server route + repository. Concretely:

- Replace the `/restaurant/menu/items/new` `DeferredPage` stub with a real create-item form. It can
  reuse the already-loaded, already-tenant-scoped `data.categories`/`data.menus` from
  `loadLiveMenu()` for its dropdowns — no new read RPC is needed for that.
- Branch-linkage creation slots into the existing per-item/per-branch grid in
  `components/runtime/LiveRestaurantViews.tsx`'s `LiveMenu`, alongside the five existing per-offer
  controls (sold-out/availability/price/visibility/display-name).
- Menu/category creation needs new, currently-nonexistent management screens under
  `/restaurant/menu` — exact route naming is a UI detail for R2C, not a product decision made here.

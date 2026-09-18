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

## R2C — UI wiring (implemented)

R2C wired all four authorities into `apps/restaurant-web`. It deviated from the strict per-authority
six-file convention in one respect: rather than one `runtime/restaurant-owner-<x>.ts` +
`-client.ts` pair per authority, it consolidated validators/types/parsers for the whole R2B family
into two shared files (`runtime/restaurant-catalog-authoring.ts`,
`runtime/restaurant-catalog-authoring-client.ts`) plus one shared server-handler file
(`server/restaurant-catalog-authoring-runtime.ts`) and one shared repository
(`repositories/supabase/restaurant-catalog-authoring-repository.ts`) — this document's own text
above explicitly invited that consolidation for the error-mapping layer, and R2C extended the same
reasoning to the rest of the family since these four authorities are one cohesive round, not four
independently-grantable RA-2-style capabilities. The React components remain one-per-authority,
matching the established `RestaurantOwner<X>Control.tsx` naming:

- `components/menu/RestaurantOwnerMenuManagementPanel.tsx` — Menu create/rename/lifecycle, rendered
  in a new panel on `/restaurant/menu`, above the existing per-item/per-branch grid.
- `components/menu/RestaurantOwnerCategoryManagementPanel.tsx` — Category create/rename/reorder,
  same page, scoped by a Menu selector.
- `components/menu/RestaurantOwnerMenuItemCreateForm.tsx` — the real `/restaurant/menu/items/new`
  page (the `DeferredPage` stub is gone), reusing the already-loaded, already-tenant-scoped
  `data.categories`/`data.menus` from `loadLiveMenu()` for its dropdowns — no new read RPC was
  needed. Handles the empty-catalog dead-end explicitly (no Menu → link back; Menu but no Category →
  link back) rather than duplicating Menu/Category creation inline.
- `components/menu/RestaurantOwnerItemCatalogControls.tsx` — content edit + lifecycle for an
  *existing* item, inserted into `LiveMenu`'s item Card (lazy: previews only when the Owner opens
  it, not on every page load, since a restaurant can have many items).
- `components/menu/RestaurantOwnerBranchLinkageStep.tsx` — shared by both the create-item flow and
  the per-item "link to another branch" affordance in `LiveMenu`. Multi-branch selection submits the
  R2B-5 RPC sequentially (never a new bulk RPC) with per-branch result reporting; a failed linkage
  never undoes the item creation, since the item is already a valid draft row either way.

Every new mutation follows R2B's own concurrency contract directly: each row component fetches its
authoritative current state (name/status/content and their version tokens) via the entity's preview
RPC on demand — list-read RPCs (`restaurant_internal_menus_v1` etc.) don't carry the new version
columns, so this mirrors exactly how every existing RA-2 control already works (e.g.
`RestaurantOwnerPriceControl` previews before allowing an edit), not a new pattern.

Refresh strategy: `router.refresh()` (Next.js App Router's own primitive) after any mutation that
changes list membership or a value shown elsewhere on the page — no parallel client cache. No prior
control in this codebase needed this (UPDATE-only fields never change list membership), so this is
the first use of it here, not a deviation from an existing convention.

Mock mode: intentionally untouched. All new write UI renders only in `runtime.mode === "supabase"`;
`/restaurant/menu/items/new` shows a plain unavailable-in-demo message in mock mode instead of a
form. `components/menu/MenuListPanel.tsx` (mock mode's read view) was not modified.

**`RESTAURANT_CATALOG_DEVELOPMENT_LIVE_ACCEPTANCE_PENDING`**: local build/typecheck/guard/smoke and
a local visual pass (with a throwaway, uncommitted preview route feeding static fake props — no real
Supabase session was available) are the only verification performed. No real Owner has exercised
these RPCs, and no cross-tenant/Consumer-visibility runtime proof has been done against Development.
That is R2D's job.

## R2D — Development live acceptance (closed) and the multi-restaurant cookie fix

R2D applied the five R2B migrations to `tastkind-development` (Management API raw-SQL path, the
established convention for this project's known `schema_migrations` drift — history was never
touched) and proved the full self-service flow, cross-tenant denial, tenant-consistency triggers,
stale-state, duplicate-linkage handling, and Consumer visibility gating against real data with a
real authenticated Owner. It also found and fixed one genuine pre-existing R1 defect, unrelated to
R2B/R2C's own code: `SELECTED_RESTAURANT_COOKIE`/`SELECTED_BRANCH_COOKIE` were scoped
`Path=/restaurant`, so the browser never sent them on `/api/restaurant/**` requests. Single-restaurant
owners never noticed (an auto-select fallback masked it); the first genuine multi-restaurant owner
fixture this project has ever had exposed it. Fixed to `Path=/` in `apps/restaurant-web/auth/selection-cookie.ts`
plus its two other exact-path-match cookie-clear call sites.

R2D also surfaced a second, narrower defect and correctly did **not** fix it inline — see R2E below.

## R2E — RA-2F draft-item display-name visibility successor repair (closed)

**The defect R2D found.** RA-2F's sealed role (`restaurant_owner_branch_menu_item_display_name_write_authority`)
already held column-scoped `SELECT` on `menu_items(id, name)` — needed by its preview RPC's
canonical-name-fallback join — but had no RLS policy of its own on `menu_items`. Its only row
visibility fell through to the baseline's permissive `items_public_read_dev` policy, which requires
`status = 'active'`. Before R2B this was unreachable: every `branch_menu_items` row's underlying item
was always active, since only admin-seeded data ever existed. **R2B made this reachable**: R2B-5
legitimately allows linking a still-`draft` item to a branch, so a real, product-valid state now
exists where RA-2F's own join silently finds nothing for a tenant-owned row and returns
`target_not_found`.

**The fix.** One additive migration
(`supabase/migrations/20260919010000_restaurant_owner_branch_menu_item_display_name_draft_visibility_r2e.sql`):
a single new PERMISSIVE, tenant-scoped `SELECT` policy (`menu_items_display_name_context_select`) on
`menu_items` for exactly the RA-2F sealed role, with **no `status` predicate at all** — reusing the
exact permissive-context-read pattern R2B-4 already established for
`restaurant_owner_menu_item_write_authority`'s own reads of `menus`/`menu_categories`. One companion
column grant, `SELECT (restaurant_id)`, was added because the new policy's own tenant predicate needs
to read that column to evaluate at all — nothing broader. No RA-2F RPC body was touched. No historical
migration was edited. No other role (client or sealed) gained anything.

- SET/CLEAR/whitespace-rejection/interior-whitespace-preservation semantics: **unchanged**.
- Canonical-name fallback (`COALESCE(branch_specific_name, menu_items.name)`): **unchanged**.
- Visibility now follows tenant authority, not the item's Consumer-facing lifecycle state — proven
  against `draft`, `active`, and `archived` items alike.
- Browser roles (`anon`/`authenticated`): still zero direct table access to `menu_items`, unchanged.

Verified locally (fresh PostgreSQL 17, 133/133 migrations, 25/25 mutation/negative checks) and live
against Development with a dedicated synthetic draft-item fixture, then cleaned up.

```
RA2F_DRAFT_ITEM_VISIBILITY_SUCCESSOR_ESTABLISHED
R2B_SUCCESSOR_REPAIR_CLOSED
RESTAURANT_CATALOG_AUTHORITY_FINALIZED
```

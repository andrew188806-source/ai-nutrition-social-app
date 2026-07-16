# Phase 2V-C Migration Contract

Status: **Four local-only migrations; deployment not authorized**

## Integrity migration

Adds unique `(id,restaurant_id)` keys to `restaurant_branches` and `menu_items`,
then adds composite foreign keys from `branch_menu_items` to each parent. The
existing unique `(branch_id,menu_item_id)` remains unchanged. Existing rows are
validated normally; no data is changed or backfilled.

`menu_categories` remains unchanged and has no `restaurant_id`. Every relevant
RPC derives category tenant through its menu and rejects inconsistent item/menu
chains. See P2V-C-DI-002.

## Reader grants

The dedicated reader receives column-level `SELECT` only:

- `restaurants`: `id,name,city,category,status`
- `restaurant_branches`: `id,restaurant_id,name,district,address,status`
- `menus`: `id,restaurant_id,name,status`
- `menu_categories`: `id,menu_id,name,sort_order`
- `menu_items`: `id,restaurant_id,menu_category_id,name,description,image_url,allergens,status,nutrition_badge_status`
- `branch_menu_items`: `id,restaurant_id,branch_id,menu_item_id,price,availability,sold_out,branch_specific_name,branch_specific_description,branch_specific_status`
- `menu_item_nutrition`: `id,menu_item_id,calories,protein,carbohydrates,fat,fiber,sugar,sodium,saturated_fat,serving_size,verified_status,is_current`

No table-level SELECT or write privilege is granted. Browser roles receive no
raw-table grant.

## RLS

Each projection table receives:

1. a restrictive tenant policy for `restaurant_membership_context_reader`,
   derived from verified actor, enabled identity, active membership and role;
2. a permissive internal policy requiring the relevant deterministic permission.

The restrictive policy intersects existing permissive public policies and stops
them widening the reader across restaurants. The RPC layer separately enforces
restaurant permission scope and active branch assignment. Policies query only
the membership foundation and parent tenant keys; they do not query branch
assignments and do not form RLS cycles.

## Function ownership and ACL

All seven functions are transferred to the existing `NOLOGIN`, `NOINHERIT`,
`NOBYPASSRLS` owner. Schema CREATE is granted only for ownership transfer and
revoked before commit. After entering owner context, execute is revoked from
PUBLIC, anon and authenticated, then exact execute is granted to authenticated.

The owner-context migration does not restore SET=false. The fresh cleanup
migration contains only the minimum membership option restoration.

## Final Development membership gate

Later Development validation must prove exactly two existing rows for the
postgres/reader relationship, unchanged OIDs/grantors, no third row, every SET
and INHERIT option false, and no effective SET or USAGE path. Any deviation
blocks Phase 2V-C Freeze.

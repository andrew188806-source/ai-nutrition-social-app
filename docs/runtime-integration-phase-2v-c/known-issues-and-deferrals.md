# Phase 2V-C Known Issues and Deferrals

## P2V-C-TR-001 — Development owner-context reuse

Development reuses the accepted two-migration Phase 2V-B pattern. The function
migration temporarily enables SET for postgres, performs ownership and ACL work,
and commits. A fresh migration restores `INHERIT FALSE, SET FALSE` without a role
switch. Final validation must accept exactly the frozen two-row Development
exception and reject a third row or any effective SET/INHERIT path.

This does not approve Production use of the pattern.

## P2V-C-DI-002 — Menu category tenant normalization deferred

`menu_categories` has no direct restaurant key. Phase 2V-C does not add one.
Category tenant is derived through `menu_categories.menu_id → menus.restaurant_id`.
Item and branch-item RPCs explicitly require the item/category/menu restaurant
chain to agree. Direct schema normalization is deferred until before Restaurant
Runtime writes and requires a separate data-compatibility review.

## P2V-C-DD-001 — Aggregate analytics deferred

Aggregate analytics definitions, grants, privacy semantics and prepared runtime
row shapes are not aligned. Phase 2V-C exposes no analytics, ratings, feedback,
favorites or raw consumer data.

## P2V-B-KI-001 — Production managed-role hard gate

The Development two-row managed-grantor exception remains accepted only in
Development. Production is blocked pending fresh professional or officially
Supabase-supported owner/grantor review.

## P2V-B-DV-001 — Actor validation required before N4

Owner, manager, staff, cross-restaurant, cross-branch, inactive, suspended and
revoked actor tests remain outstanding. They do not block local 2V-C drafting,
but all must pass in Development before N4.

## P2V-PERF-001 — Projection complexity review

Branch-scoped menu/category/item/nutrition reads use same-restaurant reachability
joins. Query plans, supporting indexes and bounded result sizes require review
after Phase 2V-D parity work and before Phase 2V-E N4. Performance work must not
weaken tenant predicates or add browser raw grants.

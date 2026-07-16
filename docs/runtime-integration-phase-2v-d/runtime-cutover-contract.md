# Phase 2V-D Runtime Cutover Contract

## Data-source modes

- `mock`: explicit non-production Demo mode with a visible Demo data marker.
- `supabase`: cookie-backed authenticated RPC reads only; no mock fallback.
- `disabled`: configuration-unavailable state and no tenant data.

Missing, unknown and malformed configuration resolves to disabled. Production mock mode is prohibited. No service-role configuration is read.

## Internal RPC allowlist

1. `restaurant_internal_restaurants_v1()`
2. `restaurant_internal_branches_v1(text)`
3. `restaurant_internal_menus_v1(text)`
4. `restaurant_internal_menu_categories_v1(text)`
5. `restaurant_internal_menu_items_v1(text)`
6. `restaurant_internal_branch_menu_items_v1(text)`
7. `restaurant_internal_current_nutrition_v1(text)`

Rows are validated before mapping. ID aliases map to narrow runtime IDs; numeric and null values are preserved. Cross-restaurant relationships, malformed rows and non-current nutrition fail closed. Public nutrition stays on `restaurant_public_published_nutrition_v1` in a separate repository.

## Routes

`/`, `/restaurant`, `/restaurant/locations`, `/restaurant/menu`, `/restaurant/menu/items` and `/restaurant/nutrition` use the explicit runtime factory. Legacy `/menu`, `/analytics` and `/profile` redirect to their Restaurant equivalents. Analytics, pending items, new-item writes, staff, assistant, settings, media and orders preview render the shared read-only unavailable state.

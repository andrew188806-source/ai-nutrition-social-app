# Phase 2V-C Strict Read RPC Contract

Status: **Local draft — no runtime or remote activation**

All functions are `LANGUAGE sql`, `STABLE`, `SECURITY DEFINER`, owned by
`restaurant_membership_context_reader`, configured with `search_path=''` and
`row_security=on`, and executable only by `authenticated` plus their owner.

## Signatures and outputs

| Function | Exact output columns |
| --- | --- |
| `restaurant_internal_restaurants_v1()` | `restaurant_id,name,city,category,status` |
| `restaurant_internal_branches_v1(text)` | `branch_id,restaurant_id,name,district,address,status` |
| `restaurant_internal_menus_v1(text)` | `menu_id,restaurant_id,name,status` |
| `restaurant_internal_menu_categories_v1(text)` | `category_id,menu_id,restaurant_id,name,sort_order` |
| `restaurant_internal_menu_items_v1(text)` | `menu_item_id,restaurant_id,menu_category_id,name,description,image_url,allergens,status,nutrition_badge_status` |
| `restaurant_internal_branch_menu_items_v1(text)` | `branch_menu_item_id,restaurant_id,branch_id,menu_item_id,price,availability,sold_out,branch_specific_name,branch_specific_description,branch_specific_status` |
| `restaurant_internal_current_nutrition_v1(text)` | `nutrition_id,restaurant_id,menu_item_id,calories,protein,carbohydrates,fat,fiber,sugar,sodium,saturated_fat,serving_size,verified_status,is_current` |

The six text arguments are named `p_restaurant_id`. They are query selectors,
not authority claims. Actor identity and active scope come only from the verified
request JWT mechanism inside the existing access-context function.

## Row-scope rules

- Restaurant identity: every active membership represented by self access context.
- Branch: restaurant scope sees all tenant branches; branch scope sees assigned branches.
- Menu: branch scope sees menus containing an item connected to an assigned branch.
- Category: tenant is derived through `menu_id → menus.restaurant_id`; branch
  scope requires a reachable item.
- Item: category and menu must resolve to the item's restaurant; branch scope
  requires a same-restaurant branch-menu association.
- Branch item: branch, item, category and menu must all resolve to the selected
  restaurant; branch scope must match its active assignment.
- Nutrition: only `is_current=true`, with item/category/menu tenant consistency;
  branch scope requires a reachable branch-menu item.

Missing sessions or inactive authorization produce no access-context rows.
Cross-tenant and cross-branch selectors therefore produce zero projection rows.
Malformed verified actor identity follows the frozen Phase 2V-B fail-closed
behavior and cannot authorize a row.

## Exclusions

The functions do not return `legal_name`, `tags`, `plan`, `created_at`,
`is_active`, `tag_ids`, `nutrition_id` from menu items, `badge_enabled`,
nutrition `source`, `confidence_score`, or `updated_at`. They expose no staff,
rating, analytics, audit or governance data.

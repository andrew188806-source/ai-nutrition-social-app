# N4 Browser SELECT Revocation Contract

Status: **contract only; migration drafting and execution are not authorized**

## Future revoke targets

N4 is intended to remove browser-role `SELECT` from both `anon` and `authenticated` for exactly these objects, subject to Development catalog confirmation:

### Tables

- `public.restaurants`
- `public.restaurant_branches`
- `public.menus`
- `public.menu_categories`
- `public.menu_items`
- `public.branch_menu_items`

### Legacy views

- `public.restaurant_public_view`
- `public.published_menus_view`
- `public.published_branch_menu_items_view`

## Already revoked and unchanged

- `public.menu_item_nutrition`
- `public.current_published_menu_item_nutrition`

N4 must not recreate, widen, or otherwise alter browser access to these objects.

## Required preserves

- `anon` and `authenticated` retain `SELECT` on `public.restaurant_public_published_nutrition_v1`.
- `authenticated` retains `SELECT` on `public.consumer_public_next_meal_candidates_v1`; `anon` remains denied.
- `authenticated` retains `EXECUTE` on the seven Phase 2V-C internal read RPCs.
- `authenticated` retains `EXECUTE` on the three Phase 2V-B membership RPCs.
- `restaurant_membership_context_reader` retains its exact column-level privileges.
- Existing owner/internal RLS policies remain unchanged.
- `public.restaurant_consumer_aggregate_metrics` remains browser-unreadable.
- Function ownership, bodies, security configuration, search paths, and membership-role structure remain unchanged.

## Drafting hard gate

Local SQL history is design evidence only. It does not prove current Development ACLs, default ACL effects, dependencies, view ownership, or grantor state. Before any N4 migration is drafted, Claude must collect Development-only catalog evidence for object existence, owners, ACLs, column ACLs, view dependencies, function ACLs, policies, and current browser behavior. DV-001 must pass and ChatGPT must review the evidence.

Unknown objects, unexpected grants, dependent browser runtime, failed actor tests, or incomplete rollback evidence block migration drafting. No local document authorizes a privilege change.


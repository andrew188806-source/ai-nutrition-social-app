# Performance and Query-Plan Contract

Status: **payload evidence CLOSED (Development scope, P2V-D-PERF-002); query-plan evidence OPEN/DEFERRED (P2V-PERF-001)**

Development payload evidence is complete: real credential-backed HTTP calls across all seven RPCs, eight actors, and both restaurants observed a maximum response of 1,249 bytes and a maximum row count of 4, with no unbounded or runaway response. P2V-D-PERF-002 is CLOSED for Development scope on this basis.

Query-plan evidence remains OPEN/DEFERRED (P2V-PERF-001). The only EXPLAIN actually captured (`restaurant_internal_current_nutrition_v1`) rendered as an opaque outer `Function Scan` node with no internal join/index detail — Postgres did not inline the function body, so no `Seq Scan`/`Index Scan` node, per-table actual-vs-plan rows, buffer attribution, or predicate-placement evidence is available from it. This single opaque node must not be treated as inner join/index approval for any of the seven RPCs. The Development catalog/index/table-size inventory portion of the same audit pack was not captured at all (a Supabase SQL Editor multi-statement run only retains its last result set). This Development Freeze must not be interpreted, cited, or relied upon as a Production performance approval of any kind.

## RPC query shapes

All seven functions are `STABLE`, `SECURITY DEFINER`, fixed-search-path reads. Each materializes an authorized scope from `restaurant_current_access_context_v1()` and then applies a fixed tenant predicate.

| RPC | Join/predicate path | Main scale risk |
| --- | --- | --- |
| `restaurant_internal_restaurants_v1` | access context → `restaurants.id`; `access_context.read/self` | repeated membership/context evaluation |
| `restaurant_internal_branches_v1` | scope → branch, `branch.restaurant_id = p_restaurant_id`; restaurant or exact branch scope | branch tenant scan without suitable composite index |
| `restaurant_internal_menus_v1` | menu tenant predicate; branch scope reaches category → item → branch item → branch | correlated reachability and duplicate elimination |
| `restaurant_internal_menu_categories_v1` | category → menu tenant; branch scope reaches item → branch item → branch | category/menu and item/category join indexes |
| `restaurant_internal_menu_items_v1` | item → category → menu with restaurant agreement; branch scope reaches branch item → branch | item/category and tenant composite joins |
| `restaurant_internal_branch_menu_items_v1` | branch item → branch/item → category → menu; all restaurant relationships checked | full-tenant branch-item payload and join fan-out |
| `restaurant_internal_current_nutrition_v1` | current nutrition → item → category → menu; branch reachability via branch item/branch | current-nutrition lookup and full nutrition payload |

The access-context function performs Auth identity, restaurant-user, active membership, role/permission, and active branch-scope lookups. Manager/staff branch scopes can multiply authorization rows; each projection uses `DISTINCT` to close duplicates.

## Local index evidence

Local migrations explicitly provide:

- `restaurant_memberships (restaurant_id, status)` and `(restaurant_user_id, status)`;
- `restaurant_memberships (role_id)`;
- unique membership `(restaurant_user_id, restaurant_id)`;
- branch scopes `(membership_id, status)` and `(branch_id, status)`;
- unique branch scope `(membership_id, branch_id)`;
- unique `(restaurant_branches.id, restaurant_id)` and `(menu_items.id, restaurant_id)` backing tenant-consistent foreign keys.

Local SQL does not prove the complete Development index catalog. Remote catalog and EXPLAIN evidence must determine whether useful indexes exist for `menus.restaurant_id`, `menu_categories.menu_id`, `menu_items.restaurant_id/menu_category_id`, branch-item tenant/item/branch paths, and current nutrition `(menu_item_id, is_current)`. No index migration is authorized here.

Before Production deployment, any large-scale restaurant data import, or any formal scale rollout, this evidence must be completed and captured: inline (non-opaque) `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT JSON)` for all seven RPCs and the access-context function; the buffer hit/read counts per significant node; actual index usage per node; actual-versus-plan row estimation per node; and a representative scale dataset (not the current small Development fixture) exercising the same evidence.

## Page call budget

| Page/load path | Maximum RPC calls | Scheduling |
| --- | ---: | --- |
| Access-context only | 1 restaurants RPC | React request memoized |
| Dashboard | 6 total: access + branches, menus, items, branch items, nutrition | five data RPCs parallel |
| Locations | 2 total: access + branches | sequential after validated selection |
| Menu | 6 total: access + menus, categories, items, branch items, nutrition | five data RPCs parallel |
| Nutrition | 3 total: access + items, nutrition | two data RPCs parallel |

There is no aggregate Dashboard RPC. React `cache()` deduplicates access-context loading within one server render/request only; there is no documented cross-request result cache. Other RPCs are not memoized. Nested layouts/pages or repeated server loaders could duplicate calls and must be measured.

## Evidence to collect

For every RPC and page:

- estimated and actual rows at every significant node;
- total execution time, planning time, buffers, sort/hash memory, and loops;
- tenant row counts and response byte size;
- authorization-scope row count by owner versus branch-scoped actor;
- RPC count and duplicate call count per request;
- sequential versus parallel wall-clock behavior;
- evidence of full-tenant unpaginated payload size and growth projection.

A sequential scan on a small Development table is not automatically a failure. Review actual/estimated rows, cost, buffers, table size, selectivity, and expected scale. Fail when evidence shows material misestimation, repeated large scans, spill, avoidable fan-out, unbounded payload risk, or latency outside the separately approved budget.

## Approved actor claim injection

The audit transaction must receive an approved actor's JWT claims JSON at runtime through an operator-supplied placeholder and set it transaction-locally with `pg_catalog.set_config`. The value must never be written to Git, printed in captured evidence, or reused outside that transaction. This makes `auth.uid()` and the access-context functions evaluate the approved actor rather than empty operator claims, without changing database roles or storing an actor UUID in the audit pack.

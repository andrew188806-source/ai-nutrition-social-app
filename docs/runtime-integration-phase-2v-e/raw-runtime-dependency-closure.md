# Raw Runtime Dependency Closure

Status: **P2V-D-RAW-001 resolved locally; remote privilege state not inferred**

## Investigated artifact

The deleted artifact was:

`apps/restaurant-web/repositories/supabase/supabase-restaurant-read-repository.ts`

It directly selected `restaurants`, `restaurant_branches`, `menus`, `menu_categories`, `menu_items`, `branch_menu_items`, `menu_item_aliases`, analytics projections, and the public nutrition view. Its internal nutrition methods already threw. Complete repository text and import-graph inspection found no active app, factory, service, type-only, or dynamic-import consumer.

## Reference inventory before deletion

| Reference class | Finding | Classification |
| --- | --- | --- |
| App/runtime importer | None | no active dependency |
| Repository factory | No import or branch; live owner reads use the RPC repository and public nutrition uses its dedicated repository | active internal runtime/public-safe |
| Service | No reference | no active dependency |
| Type-only import | None | no active dependency |
| Dynamic import/string loader | None in runtime | no active dependency |
| Guards/smokes | Frozen Phase 1 and Phase 2U source checks | historical executable text; restored byte-for-byte from HEAD and excluded from the active runtime graph |
| Frozen/historical docs | Phase 1 and Phase 2V-D records name the old file | documentation-only and intentionally unchanged |

## Removed exclusive surface

- The dormant raw repository and `createSupabaseRestaurantReadRepository` export.
- Raw restaurant, branch, menu, category, item, branch-item, alias, nutrition-workflow, and analytics REST row types.
- Their raw REST mapper exports.
- Raw/internal/analytics names from the generic readonly REST resource allowlist.
- The private-analytics REST branch that was reachable only through the dormant repository.
- No historical guard or smoke was removed or rewritten. Six Phase 1/Phase 2U scripts and their package entries remain frozen at HEAD even though their old-state assertions may reject the later Phase 2V-E repository.

## Preserved public-safe transport

`server-readonly-client.ts`, `fetch-rest-client.ts`, `readonly-database-client.ts`, the public nutrition row/mapper, and `supabase-public-nutrition-repository.ts` remain required. Their only allowed REST resource is `restaurant_public_published_nutrition_v1`. Both tokenless public reads and an optional caller-provided authenticated header remain server-side compatibility paths; no browser token state is introduced.

## Runtime classification

| Read surface | Classification | Runtime path |
| --- | --- | --- |
| Seven `restaurant_internal_*_v1` functions | active internal runtime | server-only Supabase SSR client `.rpc()` |
| `restaurant_public_published_nutrition_v1` | public-safe | dedicated server-only readonly REST repository |
| Mock console data | explicit mock | selected only by explicit mock data-source mode |
| Raw tables and legacy views | dormant legacy removed | no runtime path |
| Frozen references to the old repository | historical scripts and documentation | not imported or invoked by Restaurant Web runtime; immutable text is not a runtime dependency |

## Closure proof

The active Restaurant Web source scan must continue to prove:

- zero direct read of `restaurants`, `restaurant_branches`, `menus`, `menu_categories`, `menu_items`, `branch_menu_items`, `menu_item_nutrition`, or `current_published_menu_item_nutrition`;
- zero use of the three legacy public views named in the N4 inventory;
- exactly the seven approved internal RPC names;
- only `restaurant_public_published_nutrition_v1` through the readonly REST transport;
- no Supabase-to-mock fallback and no DML/write RPC.

This local dependency proof does not establish current Development grants. N4 remains blocked pending remote catalog and actor evidence.

## Three-way classification

1. **Active executable runtime dependency:** modules reachable from Restaurant Web app, runtime, service, repository, or factory imports. This graph has zero raw table/view reads.
2. **Dormant removed source:** the old Supabase raw repository is absent and has no active importer.
3. **Frozen historical text:** the six restored Phase 1/Phase 2U scripts and frozen documents may name old resources or the deleted repository. Their byte identity is guarded, and they are deliberately excluded from active runtime dependency counts.

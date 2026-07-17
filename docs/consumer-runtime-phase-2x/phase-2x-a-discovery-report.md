# Phase 2X-A Consumer Favorites Discovery Report

Status: local Discovery & Contract Freeze candidate. No Favorites runtime, UI cutover, database connection, or deployment is included.

## Repository baseline

- Branch: `main`.
- Frozen Phase 2W-E baseline: `47ac92d4e669cd8a1e268561c5eda1f6e81eebce`.
- Phase 2W is complete and Frozen. Phase 2X is current; Phase 2Y and Phase 2Z have not started.
- Active local migration inventory remains 34, latest `20260717010000_consumer_ratings_authenticated_read_and_atomic_write.sql`.

## Active schema inventory

`20260712130800_consumer_schema_phase_1_3_ratings_and_favorites.sql` defines exactly two Favorites persistence tables.

### `public.favorite_restaurants`

| Column | Type | Nullable | Default | Constraint / Index relevance |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key |
| `user_id` | `uuid` | NOT NULL | — | FK → `auth.users(id)` ON DELETE CASCADE; RLS owner column |
| `restaurant_id` | `text` | NOT NULL | — | No FK; part of active uniqueness index |
| `collection_label` | `text` | nullable | — | No constraint |
| `sort_order` | `integer` | nullable | — | No constraint; list ordering column (`ASC NULLS LAST`) |
| `created_at` | `timestamptz` | NOT NULL | `now()` | List ordering column (`DESC`) |
| `removed_at` | `timestamptz` | nullable | — | Soft-delete marker; active-row filter `IS NULL`; partial index predicate |

Active uniqueness: `favorite_restaurants_one_active (user_id, restaurant_id) WHERE removed_at IS NULL`. No `updated_at` or `deleted_at`.

### `public.favorite_menu_items`

| Column | Type | Nullable | Default | Constraint / Index relevance |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key |
| `user_id` | `uuid` | NOT NULL | — | FK → `auth.users(id)` ON DELETE CASCADE; RLS owner column |
| `restaurant_id` | `text` | NOT NULL | — | No FK; validates menu-item parent; excluded from active uniqueness index |
| `menu_item_id` | `text` | NOT NULL | — | No FK; part of active uniqueness index |
| `collection_label` | `text` | nullable | — | No constraint |
| `sort_order` | `integer` | nullable | — | No constraint; list ordering column (`ASC NULLS LAST`) |
| `created_at` | `timestamptz` | NOT NULL | `now()` | List ordering column (`DESC`) |
| `removed_at` | `timestamptz` | nullable | — | Soft-delete marker; active-row filter `IS NULL`; partial index predicate |

Active uniqueness: `favorite_menu_items_one_active (user_id, menu_item_id) WHERE removed_at IS NULL`. Restaurant identity is not part of that index. No `updated_at` or `deleted_at`.

The active enum `favorite_entity_type` contains only `restaurant` and `menu_item`. There is no persisted branch, menu, meal, meal-record, self-made dish, or generic favorite target. `taste_profiles.favorite_restaurant_ids` and `taste_profiles.favorite_menu_item_ids` are denormalized preference arrays; the runtime handoff identifies the two favorite tables, not these arrays, as canonical Favorites persistence. Phase 2X must not dual-write them.

## Security and ACL inventory

- RLS is enabled on both favorite tables.
- `favorite_restaurants_owner_all` and `favorite_menu_items_owner_all` apply `auth.uid() = user_id` in both `using` and `with check` clauses for all operations.
- Repository migrations contain no Favorites-specific authenticated table grant, anon grant, revoke, view, RPC, or function.
- No Favorites `SECURITY DEFINER` or owner-context function exists.
- No generated Favorites database type was found. The formal migrations, schema decision register, RLS matrix, privacy classification, and runtime handoff are the local evidence.
- Static repository inspection cannot prove the linked database's effective default ACLs. A later Development catalog/ACL preflight must verify actual grantees before activation.

RLS policy shape is owner-scoped, but RLS alone is not an activation grant. Current Mobile runtime cannot be described as having an authenticated Favorites read or write path.

## Existing runtime inventory

No dedicated Favorites domain, port, repository, adapter, service, factory, composition, source flag, error mapper, guard, or contract smoke exists. There is no disabled/mock/Supabase-prepared Favorites path.

The Frozen Phase 2W Ratings runtime supplies a useful layering pattern—typed results, explicit Auth injection, disabled/mock/Supabase sources, fail-closed flags, runtime validation, and atomic RPC-only writes—but Favorites must remain a separate domain and must not import rating records as favorite state.

The shared `MenuItemRating.isFavorite` mock field is legacy presentation data. It is not canonical Favorites storage. Meal Buddy mock preference arrays and analytics event labels are also outside the Phase 2X persistence contract.

## Existing Mobile inventory

- `apps/mobile/app/meal-log.tsx` stores `favoriteIds` in route-local React state. Meal rows toggle local meal IDs; static Favorite cards use display IDs such as `fav-1`. The state resets with the route and has no hydration, persistence, request serialization, stale-response guard, or canonical target mapper.
- `apps/mobile/app/restaurants.tsx` stores saved restaurants in route-local state keyed by `restaurant.name`, even though its canonical presentation model also carries `restaurantId`.
- `apps/mobile/app/me.tsx` links Favorites back to Meal Log and displays a count derived from static cards.
- The Food Diary static cards include a self-made meal, but the active Favorites schema does not support meal or self-made-dish favorites.
- No current Mobile favorite ID is proven to be the linked database's canonical restaurant/menu-item identifier. Names, `fav-*`, array indexes, local meal IDs, photos, and fuzzy matching are forbidden as persistence targets.

Current toggles are synchronous local mutations. Rapid taps can observe stale closure state; future async cutover additionally requires per-target in-flight serialization, stale-response rejection, and server-result reconciliation. No Phase 2X-A UI change is authorized.

## Discovery decision

Phase 2X may contract only restaurant and menu-item favorites. The missing target foreign keys and absent write functions mean direct client DML is not an acceptable live-write design. Read ACL activation and atomic/idempotent write activation require separate Development migration/security review in later subphases.

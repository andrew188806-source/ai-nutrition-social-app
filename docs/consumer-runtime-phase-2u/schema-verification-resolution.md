# Consumer Runtime Phase 2U — Schema Verification Resolution

Resolves all five `TODO_SCHEMA_VERIFY` blockers from the Phase 2S migration draft.
Phase 2T read-only inspection completed against Development DB `msbgnnoorsoefuiwluye` (tastkind-development, PostgreSQL 17.6).

## [A] Restaurant/Menu Table PK/FK Types

**Question**: Are all PK and FK columns `text`, not `uuid` or `integer`?

**Resolved**: YES. All 7 restaurant/menu raw tables use `text` PKs and FKs.
- `restaurants.id: text NOT NULL`
- `restaurant_branches.id: text NOT NULL, restaurant_id: text NOT NULL`
- `menus.id: text NOT NULL, restaurant_id: text NOT NULL`
- `menu_categories.id: text NOT NULL, menu_id: text NOT NULL`
- `menu_items.id: text NOT NULL, restaurant_id: text NOT NULL, menu_category_id: text NOT NULL`
- `branch_menu_items.id: text NOT NULL, restaurant_id: text NOT NULL, branch_id: text NOT NULL, menu_item_id: text NOT NULL`
- `menu_item_nutrition.id: text NOT NULL, menu_item_id: text NOT NULL`

**Impact on N2**: No cast required. All join conditions use `text` equality.

## [B] deleted_at Column Existence

**Question**: Do restaurant/menu tables have a `deleted_at` soft-delete column?

**Resolved**: NO. No `deleted_at` column on any of the 7 raw tables.

**Impact on N2**: No `deleted_at IS NULL` filter needed. N2 omits soft-delete guard.

## [C] menu_items → menu_categories Join Column

**Question**: Does `menu_items` join to `menu_categories` via `menu_category_id`?

**Resolved**: YES. `menu_items.menu_category_id: text NOT NULL` → `menu_categories.id`.

**Impact on N2**: Join condition `mc.id = mi.menu_category_id` is correct.

## [D] current_published_menu_item_nutrition View Definition

**Question**: What columns does the existing view expose? What is the published gate?

**Resolved via Phase 2T DB inspection**:

View definition (live DB):
```sql
SELECT n.id, i.restaurant_id, n.menu_item_id, n.calories, n.protein,
       n.carbohydrates, n.fat, n.fiber, n.sugar, n.sodium, n.saturated_fat,
       n.serving_size, n.source, n.confidence_score, n.verified_status, n.updated_at
FROM menu_item_nutrition n
JOIN menu_items i ON i.id = n.menu_item_id
JOIN restaurants r ON r.id = i.restaurant_id
WHERE n.is_current = true
  AND n.verified_status = ANY (ARRAY['verified'::text, 'ai_estimated'::text])
  AND i.status = 'active'
  AND r.status = 'active'
```

**Column count**: 16 (not 17 as prior planning documents stated — the discrepancy was a planning error; the live DB is authoritative).

**Columns confirmed**: `id`, `restaurant_id`, `menu_item_id`, `calories`, `protein`, `carbohydrates`, `fat`, `fiber`, `sugar`, `sodium`, `saturated_fat`, `serving_size`, `source`, `confidence_score`, `verified_status`, `updated_at`.

**Internal columns confirmed**: `source`, `confidence_score`, `verified_status` — these must not be exposed to any client projection.

**Publication gate confirmed**: `is_current = true AND verified_status IN ('verified', 'ai_estimated') AND menu_item.status = 'active' AND restaurant.status = 'active'`.

**Owner**: `postgres`. **Grants**: `anon SELECT`, `authenticated SELECT` (development-activation state, pending N3 cleanup in Phase 2U-C).

**N1 action**: Append `nutrition_source_public` (CASE on `n.source`) and `nutrition_updated_at` (alias of `n.updated_at`) as columns 17 and 18.

## [E] nutrition_source_public and nutrition_updated_at Columns

**Question**: Do `nutrition_source_public` and `nutrition_updated_at` already exist in the live view?

**Resolved**: NO. Phase 2T confirmed these columns are ABSENT from the current live view. N1 must add them.

**Source values found in live data**: Only `'ai_estimated'` and `'restaurant_verified'` observed in current published rows. `'platform_reviewed'` mapped to `'platform_reviewed'` as a forward-compatible provision.

**Unknown provenance gate (Gate A)**: Zero rows with unknown/null source values in published data — N1 can be deployed safely.

**Published row uniqueness (Gate B)**: Zero duplicate menu_item_id rows in published view.

**Partial unique index (Gate C)**: `menu_item_nutrition_one_current` confirmed — `CREATE UNIQUE INDEX ... ON menu_item_nutrition(menu_item_id) WHERE is_current = true AND verified_status = ANY (ARRAY['verified', 'ai_estimated'])`.

**Branch-menu uniqueness (Gate D)**: `branch_menu_items_branch_id_menu_item_id_key` confirmed — `CREATE UNIQUE INDEX ... ON branch_menu_items(branch_id, menu_item_id)`.

## Helper-View Dependency Discovery

Direct and transitive dependency scan (via `pg_rewrite` — not the incorrect `pg_depend.objid → pg_class.oid` pattern) found:

| View | Depth | Owner | Disposition |
|------|-------|-------|-------------|
| `current_published_menu_item_nutrition` | 1 | postgres | Internal upstream — N3 will revoke anon+authenticated grants in Phase 2U-C |

No other views depend on `menu_item_nutrition`. After N2 is deployed, `consumer_public_next_meal_candidates_v1` will appear at depth 2 (via the internal view) — not as a direct `menu_item_nutrition` dependent.

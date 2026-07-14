# Consumer Runtime Phase 2S — Consumer Public Restaurant/Menu Read Boundary

**Status**: Draft — not deployed. Awaiting Phase 2T approval.
**Phase**: Consumer Runtime Phase 2S
**Repository**: `D:\haocu app\ai-nutrition-social-mvp`

---

## 1. Why Raw-Table Mobile Reads Are Rejected

Phase 2S explicitly rejects the naive approach of having the Mobile app query raw restaurant/menu tables directly (`restaurants`, `restaurant_branches`, `menus`, `menu_items`, `branch_menu_items`, raw nutrition tables).

**Reason 1 — REST filters are caller-controlled.**
Supabase REST API filters are part of the HTTP query string. Any caller can remove, modify, or omit them. Sending `status=eq.active` from the Mobile app provides no database-level security guarantee. A modified client can retrieve all rows without any filter.

**Reason 2 — Narrow column selects are not a security boundary.**
Supabase REST `select=col1,col2` is a convenience, not access control. The full row is still available to any authenticated client by omitting the column selection parameter.

**Reason 3 — Missing formal DDL/RLS/grant baseline in repository.**
The 21 consumer migrations contain no restaurant/menu table definitions, RLS policies, or grant statements. The restaurant schema exists in an out-of-repository migration set whose exact live DB state is unverified from this repository alone. Phase 2S cannot safely rely on RLS policies it cannot inspect or guard.

**Reason 4 — The development activation pack grants raw table access to anon/authenticated.**
`docs/supabase-runtime-integration/development-public-read-activation-pack.sql` explicitly grants `SELECT ON raw tables TO anon, authenticated`. This is a development convenience that was never reviewed as a production security boundary. Phase 2S replaces this pattern with a narrowed, DB-enforced projection.

---

## 2. Projection Design

### Name

```
public.consumer_public_next_meal_candidates_v1
```

### Row Granularity

One row represents one `(menu_item, branch)` pair.

Branch-level granularity is required because `availability` and `sold_out` are branch-specific attributes on `branch_menu_items`. A menu item available at one branch and sold out at another must produce separate rows with different availability state — the projection filter (availability = 'available', sold_out = false) then excludes the unavailable row.

### Candidate ID

```sql
mi.id::text || ':' || rb.id::text  AS candidate_id
```

Stable, deterministic, no UUID generation required. The Mobile adapter can reconstruct `menuItemId` and `branchId` by splitting on `:`. The `menu_item_id` column is also exposed separately to support `preferredPrototypeId` matching (which compares by menu_item_id, not composite candidate_id).

### Consumer Column Allowlist

| Column | Source | Notes |
|--------|--------|-------|
| `candidate_id` | `mi.id \|\| ':' \|\| rb.id` | Stable composite key |
| `restaurant_id` | `mi.restaurant_id` | For consumer domain mapping |
| `branch_id` | `bmi.branch_id` | For areaLabel / branch context |
| `menu_item_id` | `mi.id` | For preferredPrototypeId matching |
| `meal_name` | `COALESCE(bmi.branch_specific_name, mi.name)` | Branch override preferred |
| `restaurant_name` | `r.name` | Display name |
| `branch_name` | `rb.name` | Display name |
| `district` | `rb.district` | areaLabel for consumer UI |
| `public_image_url` | `mi.image_url` | Nullable; public CDN URL |
| `calories` | `n.calories` | NOT NULL per filter |
| `protein` | `n.protein` | Nullable; null = unknown |
| `carbohydrates` | `n.carbohydrates` | Nullable; null = unknown |
| `fat` | `n.fat` | Nullable; null = unknown |
| `fiber` | `n.fiber` | Nullable; null = unknown |
| `nutrition_source_public` | `n.nutrition_source_public` | Public-safe provenance enum: `'ai_estimated'` \| `'restaurant_confirmed'` \| `'platform_reviewed'`. Never raw `verified_status`. TODO_SCHEMA_VERIFY [E] |
| `nutrition_updated_at` | `n.nutrition_updated_at` | Nullable `timestamptz` — last update to the published nutrition record. TODO_SCHEMA_VERIFY [E] |
| `availability` | `bmi.availability` | Always 'available' per filter |

### Sensitive Field Denylist

The following fields must **never** appear in the consumer projection:

| Field | Reason |
|-------|--------|
| `legal_name` | Legal entity name — internal/commercial |
| `plan` | Subscription tier ('demo'/'starter'/'growth') — commercially sensitive |
| `confidence_score` | Internal ML quality score |
| `source` | Internal nutrition source label |
| `verified_status` | Internal review workflow state — **never exposed directly**. The consumer-safe equivalent is `nutrition_source_public` (a mapped enum with approved public values, not a raw status string) |
| `is_current` | Internal data versioning flag |
| `nutrition_badge_status` | Admin workflow state |
| `badge_enabled` | Admin feature flag |
| `price` | Commercial pricing |
| `sold_out` | Always false in results (filter excludes true); not exposed |
| `branch_specific_status` | Always 'available' in results; internal label not exposed |
| `created_by`, `updated_by`, `reviewed_by` | Ownership audit fields |
| `deleted_at`, `created_at`, `updated_at` | Audit timestamps |
| `sugar`, `sodium`, `saturated_fat`, `serving_size` | Macros not in consumer contract |
| `tag_ids` | UUID references, not resolvable without tag table |
| `allergens` | Array of text; future consideration, not in Phase 2S candidate type |
| All analytics fields | Restaurant-owner only |
| All admin review fields | Admin-only |

---

## 3. Database-Level Row Filters

All filters are enforced inside the view's SQL `WHERE` clause and inner JOIN conditions. No application-layer filtering is required or trusted for security purposes.

**Nutrition publication filters are enforced by `current_published_menu_item_nutrition`, not duplicated here.** The Consumer projection does not re-implement `is_current = true` or `verified_status IN (...)`. These are publication rules owned by the Restaurant nutrition publication layer.

| # | Filter | SQL Predicate | Owner |
|---|--------|--------------|-------|
| 1 | Active restaurant | `r.status = 'active'` | Projection WHERE |
| 2 | Active branch | `rb.status = 'active'` | Projection WHERE |
| 3 | Published menu | `mn.status = 'published'` | Projection WHERE |
| 4 | Active menu item | `mi.status = 'active'` | Projection WHERE |
| 5 | Available branch item | `bmi.availability = 'available'` | Projection WHERE |
| 6 | Not sold out | `bmi.sold_out = false` | Projection WHERE |
| 7 | Branch item status | `bmi.branch_specific_status = 'available'` | Projection WHERE |
| 8 | Published nutrition | `is_current = true`, `verified_status IN (...)` | **Inside `current_published_menu_item_nutrition`** — not copied |
| 9 | Calories not null | `n.calories IS NOT NULL` | Projection JOIN condition |
| B* | Soft-delete (conditional) | `TODO_SCHEMA_VERIFY: r/rb/mi.deleted_at IS NULL` | Projection WHERE (pending [B]) |

Note on Filter 5: `availability = 'available'` (singular value, not `IN ('available', 'limited')`). Items with `availability = 'limited'` are excluded. Only fully-available items appear as consumer candidates.

### Nutrition Source

The Consumer projection joins `public.current_published_menu_item_nutrition` — **not** raw `public.menu_item_nutrition`. This is a hard architectural rule:

- **Raw `menu_item_nutrition` is prohibited as a direct projection dependency.** It contains nutrition history, rejected rows, pending-review rows, and audit fields. Joining it directly and self-applying `is_current`/`verified_status` filters duplicates publication logic and creates a second enforcement point that can diverge from the canonical publication layer.
- **`current_published_menu_item_nutrition` is the single source of truth** for published nutrition. If the remote view definition is later updated (e.g., to narrow or widen what counts as "published"), the Consumer projection benefits automatically without requiring a separate migration.
- **If `TODO_SCHEMA_VERIFY [D]` cannot be resolved** (remote view schema differs from expected), the migration draft must be corrected — not rolled back to raw table access.
- **If the remote published view exposes sensitive columns** (confidence_score, source, etc.), those columns are still excluded by the Consumer projection's SELECT allowlist. The view join does not grant exposure of columns not in the projection's SELECT clause.

### Nutrition Source Provenance

#### Published ≠ Restaurant Confirmed

"Published nutrition" means the row has passed the nutrition publication gate (`is_current = true`, `verified_status IN (published values)`). It does **not** imply all published rows were restaurant-confirmed. An AI-estimated nutrition record that meets the publication criteria is also "published." The consumer UI must not infer restaurant confirmation from the presence of nutrition data alone.

#### Three Public Provenance Categories

The consumer projection exposes `nutrition_source_public` — a stable, consumer-safe enum that maps from internal publication state to one of three public values:

| `nutrition_source_public` | Meaning | Recommended UI label (zh-TW) |
|--------------------------|---------|------------------------------|
| `ai_estimated` | AI model estimated; not independently verified by restaurant or platform reviewer | AI估算 |
| `restaurant_confirmed` | Restaurant staff or owner confirmed the nutrition information | 餐廳已確認 |
| `platform_reviewed` | Platform nutrition reviewer independently verified the data | 平台審核 |

The Mobile UI **must** use these values to render an honest provenance badge on recommendation cards. Never assume `platform_reviewed` or `restaurant_confirmed` for a row simply because it is present in the published view.

#### Data Flow Architecture

```
raw menu_item_nutrition (history, all versions, all statuses)
       │
       │  publication gate
       │  (is_current = true, verified_status IN (...))
       │  maps verified_status → nutrition_source_public
       │  adds nutrition_updated_at
       ▼
current_published_menu_item_nutrition  ← TODO_SCHEMA_VERIFY [D][E]
       │
       │  consumer JOIN (n.menu_item_id = mi.id, n.calories IS NOT NULL)
       │  column allowlist (no raw verified_status / source / confidence_score)
       ▼
consumer_public_next_meal_candidates_v1  ← this projection
       │
       │  Mobile adapter (Supabase REST SELECT — Phase 2T+)
       ▼
U1 recommendation card
       └── shows AI估算 / 餐廳已確認 / 平台審核 badge
           based on nutrition_source_public value
```

#### Why Raw `verified_status` Is Prohibited in the Consumer Projection

1. `verified_status` enum values are internal workflow states (e.g., `pending_review`, `flagged`, `rejected`, `approved`) — not designed for consumer display.
2. The mapping from `verified_status` to consumer categories is schema-specific and not 1:1. A status such as `restaurant_verified` may confirm item existence, not that the restaurant provided actual macro values.
3. Exposing raw status values creates a brittle surface: any future change to the `verified_status` enum would break consumer display without a migration.
4. `nutrition_source_public` provides a stable, public API surface decoupled from internal workflow evolution.
5. If the mapping cannot be confirmed (`TODO_SCHEMA_VERIFY [E]`), the column must NOT be guessed via `CASE` on `verified_status` — the projection must block on [E] resolution.

---

## 4. View Security Model

### Decision: Owner-Level Execution (PostgreSQL Default View Behavior)

In PostgreSQL/Supabase, a view **without** `security_invoker = true` executes with the privileges of the **view owner** (the `postgres` superuser at migration time). This is the default behavior and is equivalent to `SECURITY DEFINER` on functions.

**Why this is required:**

A `security_invoker = true` view executes as the calling user. If consumers query a `security_invoker = true` view, they would need `SELECT` on the base tables (`restaurants`, `menu_items`, etc.). Granting raw table `SELECT` to `authenticated` is explicitly prohibited by Phase 2S design — it would allow consumers to bypass the column projection and row filters by querying tables directly.

**Why this is safe:**

1. The view's `WHERE` clause is the comprehensive row security boundary — it cannot be bypassed by any authenticated consumer.
2. The `SELECT` column list is the comprehensive column security boundary.
3. The view is read-only. No `INSTEAD OF` triggers are defined. `INSERT`/`UPDATE`/`DELETE` against this view will fail.
4. The view owner (`postgres`) has no Supabase service-role API key. Owner-level DB privileges are a PostgreSQL DDL concept distinct from the Supabase service-role credential.
5. Even if the view's `WHERE` clause had a bug, the column allowlist ensures no sensitive fields (legal_name, plan, confidence_score, etc.) are exposed.

**PHASE_2S_SECURITY_MODEL_APPROVED**: This approach is documented, reviewed, and intentional.

### `security_barrier = true`

The view is declared `WITH (security_barrier = true)`.

**Why security_barrier is required:**

PostgreSQL's query planner can push predicates from an outer query **into** a view definition (predicate pushdown). Without `security_barrier`, a caller could construct a query whose outer `WHERE` clause is evaluated against base-table rows before the view's own `WHERE` clause has filtered the visible set. In combination with owner-level execution (which bypasses base-table RLS), this could allow a timing-channel or predicate-injection attack to probe row existence for data the view should be hiding.

`security_barrier = true` disables this optimization: the view's `WHERE` conditions are always evaluated **before** any outer predicate. The view remains the first and only row-security gate.

**What security_barrier does NOT do:**

- Does not change execution role (owner-level execution is preserved)
- Does not grant or restrict column access
- Does not replace the `WHERE` clause as the row-security boundary
- Is not the same as `security_invoker = true` (which is explicitly rejected — see above)

**Guard and deployment check:**

- Phase 2S guard verifies `security_barrier = true` is present in SQL code (after comment stripping)
- Validation query 19 checks `reloptions` in `pg_class` after deployment to confirm the option is actually applied

---

## 5. Role Decision: `authenticated` Only (Not `anon`)

**Recommendation: Grant SELECT to `authenticated` only.**

| Consideration | Rationale |
|---|---|
| Data nature | Restaurant menus are publicly marketed, but the *recommendation* surface is consumer-specific |
| Mobile usage | Consumers must be signed in to receive personalized next-meal recommendations |
| Restaurant Web | Restaurant Web reads at `anon` level (server-side, publishable key), which is a controlled server environment — not an unprivileged mobile client |
| Abuse/scraping | `authenticated` requires a valid Supabase project credential; harder to scrape at scale |
| RLS extension | Future: `authenticated` allows adding consumer-specific row filters (e.g., dietary restrictions, location) |
| Minimum privilege | `authenticated`-only is stricter than `anon`; consistent with all other consumer-data reads |

`anon` is explicitly excluded from the grant. The Mobile app already requires consumer authentication before accessing any recommendation features.

---

## 6. Nutrition Null Handling

| Macro | Phase 2S Handling |
|-------|------------------|
| `calories` | **Required — null rows excluded.** Items with null calories cannot participate in calorie-proximity sort and must not appear as candidates. |
| `protein` | **Nullable — preserved as null.** Null is allowed; the consumer contract accepts `protein?: number \| null`. Do not substitute 0. |
| `carbohydrates` | **Nullable — preserved as null.** Same as protein. |
| `fat` | **Nullable — preserved as null.** Same as protein. |
| `fiber` | **Nullable — preserved as null.** Same as protein. |

**Why not substitute 0 for null macros:**
Substituting 0 would falsely represent the nutritional profile of a dish (e.g., 0g protein for a chicken dish). The consumer contract must accept `null` as meaning "unknown" and render it appropriately (e.g., "—" not "0g"). If the canonical `ConsumerNutritionSnapshot` type requires `number` (not `number | null`) for macros, the contract must be updated to allow null — the data must not be corrupted to fit an inadequate type.

---

## 7. Live Provenance and Sample-Label Decision

This decision was reviewed and **not approved** for the `isSampleData: true` approach in Phase 2S inspection.

| Source | `dataProvenance` | `isSampleData` |
|--------|-----------------|--------------|
| `"mock"` | `"sample"` | `true` |
| `"local-menu-demo"` | `"sample"` | `true` |
| Future: `"supabase-restaurant-menu"` (Phase 2T+) | `"live"` | **`false`** |

**Rationale for `isSampleData: false` on live data:**

Live restaurant menu data from the Supabase projection is genuine public data — even if the recommendation ranking is still at an early (calorie-proximity) stage, the underlying candidates are real. Displaying "示範餐點資料" (sample/demo food data) for a real restaurant's real published menu item would be inaccurate and misleading to users.

**Approved consumer-facing copy for live source:**
- Context note: `餐廳公開菜單資料`
- Context subtext: `目前推薦主要參考今天已記錄的飲食與餐點熱量；完整偏好個人化將於後續提供`

**Prohibited copy for live source:**
- `示範餐點資料` — must not appear for live-sourced candidates

**Implementation note (Phase 2T+):**
- `mapCanonicalToU1NextMeal.toU1Source("supabase-restaurant-menu")` → `"supabase_restaurant_menu"`
- `toCandidateViewModel`: `isSampleData: false` for live sources
- `U1NextMealPresentationSource` widens to include `"supabase_restaurant_menu"`
- U1 content renders different badge for live source vs. sample source
- U1 guard sample-data invariant check #3 must be updated: `isSampleData: true` in mapper applies only to non-live sources

---

## 8. TODO_SCHEMA_VERIFY Checklist

Before promoting `migration-draft.sql` to `supabase/migrations/`, all items must be resolved:

**[A] PK type (text vs. uuid)**
- Development activation pack: `id text PRIMARY KEY`
- Schema drafts: `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- Restaurant-web `RestaurantRow.id`: `string` (compatible with both)
- **Action**: Inspect live DB `information_schema.columns.data_type` for `id` on `restaurants`, `restaurant_branches`, `menu_items`, `branch_menu_items`
- **Impact if uuid**: Remove `::text` casts from `candidate_id` composition; may need `::text` for string concatenation

**[B] deleted_at column (soft-delete)**
- Schema drafts 003/005: `deleted_at timestamptz` present on `restaurants`, `restaurant_branches`, `menu_items`
- Development activation pack: `deleted_at` NOT present
- Restaurant-web `RestaurantRow`: no `deleted_at` field
- **Action**: Inspect live DB columns. If `deleted_at` exists, uncomment filters in migration draft and validation query 11
- **Risk if unresolved**: Soft-deleted data may be visible in projection (high risk if soft-delete is in use)

**[C] menu_items.menu_category_id column**
- Development activation pack: `menu_category_id text NOT NULL REFERENCES menu_categories(id)`
- Schema draft 005: uses `menu_category_items` join table (no direct FK on `menu_items`)
- Restaurant-web `MenuItemRow.menu_category_id`: `string` (confirms column exists on live rows)
- **Confidence**: HIGH — restaurant-web row type confirms this column exists
- **Action**: Verify via `information_schema.columns`; if missing, use the join table alternative (see migration-draft comments)

**[D] `current_published_menu_item_nutrition` remote view (UNVERIFIED) — DIRECT DEPLOY BLOCKER**

**The Consumer projection directly depends on `public.current_published_menu_item_nutrition`. Deployment is prohibited until the remote view definition, columns, owner, reloptions, grants, and published-only semantics are verified.**

- The development activation pack defines a view `current_published_menu_item_nutrition` that pre-joins nutrition with `is_current` and `verified_status` filters.
- **Phase 2S migrates to using this view directly** — it is the nutrition JOIN target in the projection.
- Before Phase 2T deployment, the following must be verified via live DB inspection (see validation query B4):

| Item | Question | Risk |
|------|----------|------|
| View definition | Does it match local draft `012_views.sql`? | Unknown columns could be in scope |
| View owner | Who owns it? | Owner determines execution privileges |
| `reloptions` | `security_barrier`? `security_invoker`? | Absent = potential pushdown risk |
| Consumer grants | Already granted to `anon`/`authenticated`/`PUBLIC`? | If yes, must be revoked or audited |
| Sensitive columns | `confidence_score`, `source`, `reviewed_by`, review workflow? | Must NOT be exposed to consumers |
| Nutrition history | Exposes only current or also historical rows? | Historical rows = data leak |
| Column nullability | `calories`, `protein`, `carbohydrates`, `fat`, `fiber` — nullable? | Affects Phase 2T row type contract |

- **Action**: Run validation queries B4a, B4b, B4c in Development before Phase 2T
- **If sensitive columns found**: the view must NOT be granted to consumers; STEP 2 revoke statements must include it
- **If existing consumer grants found**: Phase 2T STEP 2 must revoke them; record as pre-deployment baseline

**[E] `nutrition_source_public` and `nutrition_updated_at` provenance columns (UNVERIFIED) — DIRECT DEPLOY BLOCKER**

**The Consumer projection assumes `n.nutrition_source_public` and `n.nutrition_updated_at` exist in `public.current_published_menu_item_nutrition`. Deployment is prohibited until these columns are confirmed.**

Before Phase 2T deployment, verify (via validation queries C1–C8):

| Item | Question | Risk if unresolved |
|------|----------|--------------------|
| Column existence | Does remote view expose `nutrition_source_public`? | Consumer projection will error on deploy |
| Column existence | Does remote view expose `nutrition_updated_at`? | Consumer projection will error on deploy |
| Value allowlist | Are all `nutrition_source_public` values in `('ai_estimated', 'restaurant_confirmed', 'platform_reviewed')`? | Unapproved values reach Mobile UI |
| Null constraint | Is `nutrition_source_public` always non-null for published rows? | Null source is an invalid consumer state |
| Timestamp type | Is `nutrition_updated_at` of type `timestamptz`? | Type mismatch requires explicit cast |
| Status mapping | Which internal `verified_status` values map to which public value? Do NOT assume `verified` = `restaurant_confirmed` | Misleads consumers about data quality |
| Confirmation timestamp | Is there a distinct restaurant confirmation timestamp? | Needed to distinguish confirm-date from update-date |
| Reviewer PII | Does `nutrition_updated_at` embed reviewer user ID? | PII must not be exposed to consumers |

**Prohibited if [E] cannot be resolved:**
- Do NOT fall back to joining raw `menu_item_nutrition` for provenance
- Do NOT select raw `verified_status` and expose it as `nutrition_source_public`
- Do NOT use `CASE` logic on `verified_status` in the consumer projection to guess the mapping
- If the published view lacks these columns, Phase 2T must add them to the view definition **before** deploying the consumer projection

**Action**: Run validation queries C1–C8 in Development before Phase 2T.

---

## 9. Files in This Directory

| File | Purpose |
|------|---------|
| `migration-draft.sql` | Forward-only migration draft for the consumer projection view. **Not deployed. Not in supabase/migrations/.** |
| `validation-queries.sql` | Read-only validation queries (18 queries) to verify projection state after deployment. Run only in development. |
| `phase-2s-boundary-design.md` | This document — design decisions, rationale, and verification checklist. |

## 10. Related Files

| File | Role |
|------|------|
| `scripts/consumer-public-restaurant-menu-phase-2s-guard.mjs` | Phase 2S static guard — verifies boundary design artifacts without remote DB access |
| `docs/supabase-schema-drafts/003_restaurants_and_branches.sql` | Restaurant/branch DDL reference |
| `docs/supabase-schema-drafts/005_menus_and_menu_items.sql` | Menu/item DDL reference |
| `docs/supabase-schema-drafts/006_ingredients_and_nutrition.sql` | Nutrition DDL reference |
| `docs/supabase-schema-drafts/012_views.sql` | Existing draft views reference |
| `docs/supabase-schema-drafts/013_rls_policy_drafts.sql` | RLS draft policies reference |
| `docs/supabase-runtime-integration/development-public-read-activation-pack.sql` | Development schema with runtime-confirmed column names |
| `apps/restaurant-web/adapters/supabase/rows.ts` | Live row type contracts (authoritative column name evidence) |

---

## 11. What Phase 2S Does NOT Include

Phase 2S deliberately excludes the following (reserved for Phase 2T or later):

- Mobile Supabase REST client for restaurant reads
- Mobile live recommendation repository (`supabaseConsumerNextMealRecommendationRepository`)
- Widen `ConsumerNextMealRecommendationSource` to include `"supabase-restaurant-menu"`
- Update feature flag set
- Update factory branch
- Update `mapCanonicalToU1NextMeal.ts` mapper
- Widen `U1NextMealPresentationSource`
- Live smoke tests (requires deployed projection)
- Any migration deployment to Development or Production
- Tag resolution (tag_ids → tag names)
- Emoji field population
- TODO_SCHEMA_VERIFY [E] resolution (provenance column live DB verification — required before Phase 2T deployment)

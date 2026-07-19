# Phase 2Y-A Discovery Report — Recommendation Feedback Runtime

## Scope

This document records all versioned migration evidence found for Recommendation Feedback
persistence tables, enum types, indexes, RLS policies, grants/revokes, RPCs, views,
and existing Mobile or domain runtime code.

Discovery was performed by reading only local migration files, TypeScript source, and
documentation. No network, Supabase connection, credential, or remote query was used.

---

## Schema Inventory

### Enum

**`recommendation_feedback_action`** — defined in migration
`20260712130100_consumer_schema_phase_1_3_consumer_enums_and_helpers.sql`

Values: `'shown', 'clicked', 'accepted', 'dismissed', 'saved', 'consumed'`

---

### Tables

#### `recommendation_sessions`

Defined in `20260712130900_consumer_schema_phase_1_3_recommendation_feedback.sql`.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | PK |
| `user_id` | uuid | NOT NULL | — | FK → `auth.users(id)` ON DELETE CASCADE |
| `source_surface` | text | NOT NULL | — | e.g. "mobile-recommendation-home" |
| `context_snapshot` | jsonb | NOT NULL | `'{}'` | Snapshot of ranking context at session start |
| `model_version` | text | NULL | — | Algorithm/model identifier; nullable |
| `schema_version` | text | NOT NULL | `'consumer-recommendation-v1'` | |
| `started_at` | timestamptz | NOT NULL | `now()` | |
| `ended_at` | timestamptz | NULL | — | NULL = session still open |

No `updated_at` column. Session rows are inserted once (create) and may have `ended_at`
set exactly once (end) via a dedicated RPC — this is a one-time lifecycle transition,
not a general update pattern. `recommendation_feedback` rows are purely append-only.
No unique constraint on sessions beyond PK — multiple sessions per user are valid.

#### `recommendation_feedback`

Defined in `20260712130900_consumer_schema_phase_1_3_recommendation_feedback.sql`.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | PK |
| `user_id` | uuid | NOT NULL | — | FK → `auth.users(id)` ON DELETE CASCADE |
| `recommendation_session_id` | uuid | NOT NULL | — | FK → `recommendation_sessions(id)` ON DELETE CASCADE |
| `recommendation_id` | text | NULL | — | Candidate/item ID from recommendation engine |
| `restaurant_id` | text | NULL | — | No FK; canonical text ID |
| `branch_id` | text | NULL | — | Optional branch context; not identity |
| `menu_item_id` | text | NULL | — | No FK; canonical text ID |
| `action` | recommendation_feedback_action | NOT NULL | — | The feedback event type |
| `shown_at` | timestamptz | NULL | — | Timestamp for `shown` action |
| `clicked_at` | timestamptz | NULL | — | Timestamp for `clicked` action |
| `accepted_at` | timestamptz | NULL | — | Timestamp for `accepted` action |
| `dismissed_at` | timestamptz | NULL | — | Timestamp for `dismissed` action |
| `saved_at` | timestamptz | NULL | — | Timestamp for `saved` action |
| `consumed_at` | timestamptz | NULL | — | Timestamp for `consumed` action |
| `rating` | numeric | NULL | — | Optional rating 0-5; constrained |
| `feedback` | text | NULL | — | Optional free-text consumer note |
| `reason` | text | NULL | — | Optional reason for dismiss/negative |
| `source_surface` | text | NOT NULL | — | Surface where event occurred |
| `event_idempotency_key` | text | NOT NULL | — | Caller-generated unique key per event |
| `schema_version` | text | NOT NULL | `'consumer-recommendation-feedback-v1'` | |
| `created_at` | timestamptz | NOT NULL | `now()` | |

**Check constraints:**
- `recommendation_feedback_rating_range`: `rating IS NULL OR (rating >= 0 AND rating <= 5)`
- `recommendation_feedback_entity_present`: `restaurant_id IS NOT NULL OR menu_item_id IS NOT NULL OR recommendation_id IS NOT NULL`

**Note**: No `is_current` or `removed_at` pattern. This is an append-only event log, not a
current-state table. Each row represents one feedback event.

---

### Indexes

Defined in `20260712131200_consumer_schema_phase_1_3_consumer_indexes.sql`.

| Index | Type | Columns | Notes |
|---|---|---|---|
| `recommendation_sessions_user_started_idx` | Non-unique | `(user_id, started_at desc)` | Query recent sessions by user |
| `recommendation_feedback_idempotency_idx` | **UNIQUE** | `(user_id, event_idempotency_key)` | Server-side idempotency gate |
| `recommendation_feedback_restaurant_idx` | Non-unique | `(restaurant_id, created_at desc)` | Analytics access pattern |
| `recommendation_feedback_menu_item_idx` | Non-unique | `(menu_item_id, created_at desc)` | Analytics access pattern |

The `recommendation_feedback_idempotency_idx` unique index is the primary idempotency
guarantee. `ON CONFLICT (user_id, event_idempotency_key)` can be used in future write RPCs.

---

### RLS Policies

Defined in `20260712131400_consumer_schema_phase_1_3_consumer_rls_policy_drafts.sql`.

| Table | RLS Enabled | Policy Name | Operation | USING | WITH CHECK |
|---|---|---|---|---|---|
| `recommendation_sessions` | Yes | `recommendation_sessions_owner_all` | FOR ALL | `auth.uid() = user_id` | `auth.uid() = user_id` |
| `recommendation_feedback` | Yes | `recommendation_feedback_owner_all` | FOR ALL | `auth.uid() = user_id` | `auth.uid() = user_id` |

These policies restrict all operations to the owning authenticated user.
Without an explicit GRANT, the policies do not become reachable.

---

### Grants / Revokes

**None exist** for `recommendation_sessions` or `recommendation_feedback`.

No migration grants SELECT, INSERT, UPDATE, or DELETE on either table to `public`,
`anon`, or `authenticated`. No migration grants EXECUTE on any recommendation feedback RPC
(because no such RPC exists yet).

This means:
- Direct SELECT from `authenticated` role: blocked (no grant)
- Direct INSERT/UPDATE/DELETE from `authenticated` role: blocked (no grant)
- `anon` role: blocked (no grant)
- `public`: blocked (no grant)

Direct DML is fully closed. This is the correct state for Phase 2Y-A.

---

### Views

Defined in `20260712131300_consumer_schema_phase_1_3_consumer_public_private_views.sql`.

**`restaurant_consumer_aggregate_metrics`**:

```sql
select
  restaurant_id,
  menu_item_id,
  count(distinct user_id) as consumer_count,
  count(*) as feedback_count,
  avg(rating) as average_rating,
  max(created_at) as latest_feedback_at
from recommendation_feedback
where restaurant_id is not null
group by restaurant_id, menu_item_id
having count(distinct user_id) >= 10;
```

- Aggregates feedback by `(restaurant_id, menu_item_id)`.
- Privacy threshold: minimum 10 distinct users before a row is visible.
- No SECURITY DEFINER — runs as the querying role.
- Not directly accessible to `authenticated`/`anon` (no grant on underlying table).
- Intended for internal analytics, not consumer UI reads.
- `menu_item_id` is nullable — allows restaurant-level aggregates.

---

### RPCs / Functions / Aggregates

**None exist** for recommendation feedback or sessions.

No `create function` in any migration touches `recommendation_sessions` or
`recommendation_feedback`. All future write access must be via authenticated atomic RPCs
created in Phase 2Y-D.

---

## Existing Runtime Code Inventory

### TypeScript Domain Code

**No recommendation feedback domain code exists** in `apps/mobile/features/`.

Searched: `recommendation_feedback`, `recommendation_session`, `recommendationFeedback`,
`RecommendationFeedback` — zero matches in `apps/`.

### Related Existing Code (read-only, no feedback writing)

- **`apps/mobile/features/consumer-meals/consumerNextMealRecommendationService.ts`**
  Phase 2Q read-only recommendation service. Uses `ConsumerNextMealRecommendationRepository`.
  No feedback event writing.

- **`apps/mobile/features/next-meal-prototype/NextMealPrototypeContent.tsx`**
  UI component with candidate selection (`selectCandidate`) and confirmation
  (`confirmSelectedCandidate`). These map to "clicked" and "accepted" feedback events,
  but no feedback writing occurs. Interactions are local React state only.

- **`apps/mobile/app/recommendation.tsx`**
  Route hosting the prototype. Uses `canonicalProvider` (Phase 2Q). No feedback writing.
  `selectedCandidateId` and `confirmedCandidateId` are local state — not persisted.

### Analytics Paths

None. No placeholder, event call, or analytics track in the prototype UI.

### Session State in Mobile UI

The prototype tracks `selectedCandidateId` and `confirmedCandidateId` in React component
state. These correspond to future "clicked" and "accepted" feedback events. No
`prototypeId`-to-`recommendation_id` mapping is persisted or written.

---

## Cross-Boundary Inventory

### Relationship to Ratings

`user_restaurant_ratings` and `user_menu_item_ratings` are **separate tables** from
`recommendation_feedback`. Recommendation Feedback does not duplicate Ratings state.
A "rating" field exists in `recommendation_feedback` (nullable, 0-5) but it captures
the in-situ feedback rating given during a recommendation interaction, not the canonical
restaurant/item rating managed by the Ratings runtime.

The Ratings boundary remains independent. Phase 2Y must not merge these domains.

### Relationship to Favorites

`favorite_restaurants` and `favorite_menu_items` are **separate tables** from
`recommendation_feedback`. The "saved" action in `recommendation_feedback_action` is a
behavioral feedback event (user expressed intent to save this recommendation), not a
canonical Favorites write. The Favorites boundary remains independent.

### Shared Target Identifiers

`restaurant_id` and `menu_item_id` in `recommendation_feedback` use the same canonical
text identifier space as Favorites and Ratings. No FK enforces existence — the schema
treats these as behavioral metadata keys, not FK-validated references.

---

## Migration Provenance

The schema draft `docs/supabase-consumer-schema-drafts/009_recommendation_feedback.sql`
matches the formal migration exactly (word for word). The migration was promoted from the
draft without modification.

No subsequent migration modifies `recommendation_sessions` or `recommendation_feedback`.
The latest migration as of Phase 2Y-A is `20260718020000_consumer_favorites_atomic_write.sql`
(36 total migrations).

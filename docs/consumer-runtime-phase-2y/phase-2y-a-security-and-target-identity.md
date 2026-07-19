# Phase 2Y-A Security and Target Identity Analysis

## Target Identity

### Canonical Target Resolution

Target identity for `recommendation_feedback` is determined by which of three optional
columns is populated, subject to the `recommendation_feedback_entity_present` constraint:

```
recommendation_id IS NOT NULL  →  kind: "recommendation"
restaurant_id IS NOT NULL AND menu_item_id IS NULL  →  kind: "restaurant"
restaurant_id IS NOT NULL AND menu_item_id IS NOT NULL  →  kind: "menu_item"
```

**`branchId` is metadata, not identity.** It is stored in the `branch_id` column for
analytics context but does not affect the target kind or the idempotency key.

### Column-Level FK Status

| Column | Has FK | Notes |
|---|---|---|
| `recommendation_id` | No | Text; maps to candidate ID from recommendation engine |
| `restaurant_id` | No | Text; canonical restaurant identifier |
| `branch_id` | No | Text; optional branch context |
| `menu_item_id` | No | Text; canonical menu item identifier |

No FK means no server-side existence validation on target IDs. The write RPC in Phase 2Y-D
must decide whether to validate target existence. Given the behavioral event log nature
of this table, existence validation is a future concern — Phase 2Y-D hard gate.

### Client-Side Target Validation (Hard Rules)

The following must be rejected at the Mobile service / target mapper level before any RPC call:

| Input | Rejection Reason |
|---|---|
| Empty string for any ID field | Identity cannot be empty |
| Whitespace-only string | Functionally empty |
| `fav-*` prefix (`/^fav-/i`) | Synthetic local Favorites ID, not canonical |
| `menu_item` kind with null `restaurantId` | Parent consistency required |
| All target fields null/absent | Violates `entity_present` constraint |
| Positional numeric index used as ID | Integer position in array, not a canonical identifier |

**ID format validation note:** Bare integer string rejection (`/^\d+$/`) is NOT included
above. No catalog evidence from migrations confirms what constitutes a valid canonical ID
format. ID format/catalog existence validation is deferred to Phase 2Y-D as a hard gate.
The mapper only rejects clearly invalid forms (empty, whitespace, `fav-*` synthetic IDs).

### Session Ownership Verification

The `recommendation_session_id` in every feedback write is a user-provided UUID.
The feedback write RPC must verify:

```sql
EXISTS (
  SELECT 1 FROM public.recommendation_sessions
  WHERE id = p_session_id AND user_id = auth.uid()
)
```

If the session does not exist or belongs to a different user, the RPC must return
an error code, not silently succeed. This is a Development Hard Gate for Phase 2Y-D.

### `source_surface` Ownership

`source_surface` on feedback event rows is derived from the owning session, NOT accepted
from client input. The client provides only `sessionId` in `RecordRecommendationFeedbackEventInput`.
After session ownership verification, the RPC reads `source_surface` directly from
`recommendation_sessions` and copies it into the feedback row.

This prevents clients from misrepresenting the surface of an event and ensures every
feedback row carries the surface that was declared at session creation time.

### Idempotency Key Ownership

The `event_idempotency_key` is user-provided but scoped to `(user_id, event_idempotency_key)`.
A different user cannot collide with the same key. No cross-user leakage is possible.

---

## Privacy Analysis

### Behavioral Profiling Risk

`recommendation_feedback` records every `shown`, `clicked`, `accepted`, and `dismissed`
event against specific restaurants and menu items. This constitutes behavioral profiling
data. Key risks:

1. **Re-identification**: A pattern of "shown" events reveals which recommendations were
   generated for a user. Combined with `context_snapshot` in the session, this could
   reveal dietary restrictions or health goals.
2. **Sensitive inference**: Systematic dismissal of certain food categories could reveal
   religious, medical, or personal dietary constraints.
3. **Temporal patterns**: `shown_at`, `clicked_at`, etc. timestamps reveal meal-time
   behavior patterns.

### Retention and Deletion

- `ON DELETE CASCADE` on both `user_id` FKs: when a user is deleted from `auth.users`,
  all `recommendation_sessions` and `recommendation_feedback` rows are automatically
  deleted. This is correct.
- No soft-delete pattern exists. Deletion is permanent and cascades correctly.
- Anonymization: not currently modeled in the feedback schema. This is a deferred concern.
  If anonymization replaces hard delete, the FK cascade must be replaced with a nullable
  `user_id` and a separate anonymization migration.

### Raw Feedback Row Exposure

- Current state: no grant to `authenticated` or `anon` for SELECT on `recommendation_feedback`.
- Direct raw row reads by the consumer are blocked and must remain blocked.
- The `recommendation_feedback_owner_all` RLS policy technically allows the owner to read
  their own rows, but without a SELECT grant, this is unreachable from client code.
- Phase 2Y must not add a SELECT grant to `recommendation_feedback` without a specific
  product use case and privacy review.

### Restaurant Owner / Analytics Exposure

- `restaurant_consumer_aggregate_metrics` view aggregates feedback per `(restaurant_id, menu_item_id)`.
- Privacy threshold: `HAVING count(distinct user_id) >= 10` — a restaurant only appears
  in the aggregate view if at least 10 distinct users have feedback rows for it.
- This threshold prevents small-cohort re-identification (e.g., a restaurant with only
  2 users whose feedback pattern could identify individuals).
- The view itself has no SELECT grant and is not accessible from `authenticated`/`anon`
  without one.
- Future restaurant-facing analytics exposure must go through a separate authenticated
  view with appropriate RLS and explicit grant, not through raw `recommendation_feedback`
  table access.

---

## Security Requirements for Future Phase 2Y-D RPCs

The following security requirements are non-negotiable for the write RPCs:

### Session Creation RPC

1. `LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp`
2. `user_id` derived from `auth.uid()` only — never from caller parameter.
3. Authentication check: if `auth.uid() IS NULL` → raise exception.
4. `REVOKE ALL ON FUNCTION ... FROM public, anon, authenticated` before `GRANT EXECUTE ... TO authenticated`.
5. No `service_role` usage in any client path.

### Feedback Event RPC

1. `LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp`
2. `user_id` derived from `auth.uid()` only.
3. Session ownership verified: `SELECT 1 FROM recommendation_sessions WHERE id = p_session_id AND user_id = auth.uid()`.
4. If session not found or not owned: exception with code `SESSION_NOT_OWNED`.
5. Idempotency: `INSERT ... ON CONFLICT (user_id, event_idempotency_key) DO NOTHING`.
6. `GET DIAGNOSTICS v_count = ROW_COUNT` to detect conflict (0 rows = row already existed).
   To distinguish `already_recorded` vs `idempotency_conflict`: read back the existing row's
   action and target; compare against the incoming payload. Same payload → `already_recorded`.
   Different payload → `idempotency_conflict`.
7. `REVOKE ALL ... FROM public, anon, authenticated` before `GRANT EXECUTE ... TO authenticated`.
8. No direct table grants (INSERT, UPDATE, DELETE) to any client-facing role.

### Direct DML Revocation

The following must be explicitly revoked (to be done in the Phase 2Y-D migration):

```sql
REVOKE ALL ON TABLE public.recommendation_sessions FROM public, anon, authenticated;
REVOKE ALL ON TABLE public.recommendation_feedback FROM public, anon, authenticated;
```

Both tables currently have no grants, so these revokes confirm the closed state.
They must appear before any `GRANT EXECUTE` on the new RPCs.

### No SELECT Grant

The Phase 2Y-D migration must NOT grant SELECT on `recommendation_feedback` or
`recommendation_sessions` to `authenticated`, `anon`, or `public`. The write RPCs
return the created session ID and feedback ID in the RPC response — that is sufficient.

### Service Role Path

`service_role` must never appear in client-facing Mobile code paths. The cleanup operator
in smoke tests uses `service_role`-equivalent (`supabase db query --linked`) only within
the test runner, not in production feature code.

---

## Boundary Independence Security

Each of the following boundaries must maintain independent persistence:

| Boundary | Tables | Service |
|---|---|---|
| Ratings | `user_restaurant_ratings`, `user_menu_item_ratings` | `ConsumerRatingService` |
| Favorites | `favorite_restaurants`, `favorite_menu_items` | `ConsumerFavoriteService` |
| Recommendation Feedback | `recommendation_sessions`, `recommendation_feedback` | `ConsumerRecommendationFeedbackService` (future) |

No cross-boundary writes. A "saved" feedback event must NOT trigger a Favorites write.
A "rating" in feedback must NOT trigger a Ratings write. These are separate services with
separate RPC boundaries.

---

## Development Hard Gates (Not Yet Resolved)

The following security questions are deferred to Phase 2Y-D and remain hard gates:

1. **Target existence validation**: Should the write RPC verify `restaurant_id` and
   `menu_item_id` exist in the catalog before inserting? Given the behavioral event log
   nature (no FK), the default is to omit validation. But if the RPC is to be the
   authoritative write path, this should be reviewed.

2. **Session closure**: Resolved and frozen in Phase 2Y-A. Session closure is handled by
   a dedicated `end_authenticated_recommendation_session` RPC. `ended_at` may be set once;
   second call returns `already_ended`. This is no longer a development hard gate.

3. **`feedback` and `reason` fields**: Free-text fields. Must be sanitized (trimmed,
   length-limited) in the RPC. Length limits not defined in the schema. Phase 2Y-D must
   define these.

4. **`rating` optional field on all actions**: Schema allows `rating` on any action, not
   just `consumed`. Should the write RPC restrict rating to specific actions? Deferred.

5. **`context_snapshot` in sessions**: `jsonb NOT NULL default '{}'`. Phase 2Y-B/D must
   define what goes in this snapshot and whether it is client-provided or server-derived.

# Phase 2Y-D-A: Security and Validation Design

**Phase:** Consumer Runtime Phase 2Y-D-A
**Status:** Candidate (not staged, not committed)

---

## 1. Security Model

All three RPCs use the same security model:

- **`SECURITY DEFINER`**: The function executes with the privileges of its owner (a superuser or designated owner), not the caller.
- **Fixed `search_path = pg_catalog, public, pg_temp`**: Prevents search-path injection attacks.
- **`auth.uid()` only**: Ownership is derived exclusively from the JWT-validated `auth.uid()`. No caller-supplied `user_id` or `userId` parameter is accepted.
- **Null auth → fail closed**: If `auth.uid()` is `NULL`, all three functions raise `AUTHENTICATION_REQUIRED` (errcode `28000`) immediately.
- **No table DML grants**: The authenticated role receives no direct `INSERT`, `UPDATE`, or `DELETE` on `recommendation_sessions` or `recommendation_feedback`. All writes go through the three RPCs.
- **No Mobile/browser service_role path**: No `service_role` credential is present in the mobile runtime. The migration does not add any grant to `service_role`. All runtime calls use authenticated user sessions only.
- **Revoke before grant**: `REVOKE ALL` from `public, anon, authenticated` is issued for each function before the targeted `GRANT EXECUTE TO authenticated`.

---

## 2. Session Create: Immutability and Fail-Closed

The `recommendation_sessions` table stores an immutable payload: `(source_surface, model_version, context_snapshot, user_id, schema_version)`. Once written, these fields are never updated by any RPC.

**Idempotency semantics (`create_authenticated_recommendation_session`):**

| Scenario | Result |
|----------|--------|
| First create | `created` — row inserted, `started_at` = `clock_timestamp()` |
| Same actor + same session_id + same payload | `already_created` — convergent |
| Same actor + same session_id + different payload | Raises `SESSION_CREATE_CONFLICT (22023)` — generic; public result: `create_failed` |
| Different actor + same session_id | Raises `SESSION_CREATE_CONFLICT (22023)` — identical exception; does not reveal ownership or existence. Public result: `create_failed`. |

Both same-actor payload conflict and foreign-actor UUID collision raise `SESSION_CREATE_CONFLICT`. The public result in both cases is `create_failed`. No response field distinguishes the two scenarios. The internal exception name must not appear in any public API response.

The `context_snapshot` column is always written as `'{}'::jsonb` by the RPC. The client cannot supply an arbitrary context snapshot.

---

## 3. Session End: First-End Wins

The `end_authenticated_recommendation_session` RPC uses a CAS pattern (`WHERE ended_at IS NULL`) to guarantee that:

1. The first concurrent caller to commit sets `ended_at`.
2. All subsequent callers (same actor, same session_id) receive `already_ended` with the stable `ended_at`.
3. Only `ended_at` is written; all other session columns are immutable.
4. A foreign actor or a missing session receives `{ status: "session_not_found" }` — the RPC does not reveal whether the session exists or belongs to another actor.

---

## 4. Feedback Event: Idempotency and Ordering

The `recommendation_feedback` table has a `UNIQUE` index on `(user_id, event_idempotency_key)`. The RPC uses `ON CONFLICT DO NOTHING` and `GET DIAGNOSTICS row_count = ROW_COUNT` to classify the outcome:

| Scenario | Result |
|----------|--------|
| New event | `recorded`, returns `feedback_id` |
| Same key + same payload | `already_recorded` — convergent |
| Same key + different payload | `idempotency_conflict` — typed failure, no data mutation |
| Ended session | `invalid_session` — fail closed |
| Missing/foreign session | `session_not_found` — fail closed |

**Immutable payload for comparison:** `(recommendation_session_id, action, recommendation_id, restaurant_id, branch_id, menu_item_id, source_surface)`. All fields are compared using `IS NOT DISTINCT FROM` (null-safe) so absent optional fields are handled correctly. `branch_id` is included because it is a persisted immutable event field — a retry with a different `branch_id` signals a different intended write and must be classified as `idempotency_conflict`, not `already_recorded`.

**`source_surface` is derived from the session row**, not from client input. This ensures the feedback table's `source_surface` always matches the session.

---

## 5. Target Validation

### Exact target-shape enforcement (all targets)

Before per-kind validation, the RPC enforces exact field shapes:

| Target kind | Required | Must be null |
|-------------|----------|-------------|
| `recommendation` | `recommendation_id` | `restaurant_id`, `menu_item_id`, `branch_id` |
| `restaurant` | `restaurant_id` | `recommendation_id`, `menu_item_id` |
| `menu_item` | `restaurant_id`, `menu_item_id` | `recommendation_id` |

Cross-kind fields raise `FEEDBACK_TARGET_SHAPE_INVALID (22023)`. Public adapter result: `invalid_target`.

### restaurant target
- `restaurant_id` required, trimmed, max 500 chars, no `fav-` prefix.
- Existence verified via `SELECT ... FROM public.restaurants WHERE id = v_restaurant_id FOR KEY SHARE`.
- `branch_id` optional: if non-null, existence verified via `SELECT ... FROM public.restaurant_branches WHERE id = v_branch_id AND restaurant_id = v_restaurant_id FOR KEY SHARE`. Missing or parent-mismatched branch raises `FEEDBACK_BRANCH_NOT_FOUND_OR_MISMATCH (22023)`. Public adapter result: `invalid_target`.

### menu_item target
- `restaurant_id` and `menu_item_id` both required.
- Restaurant existence verified first.
- Menu item parent verified: `SELECT ... FROM public.menu_items WHERE id = v_menu_item_id AND restaurant_id = v_restaurant_id FOR KEY SHARE`.
- If the menu item exists but under a different restaurant, `FEEDBACK_MENU_ITEM_PARENT_MISMATCH` is raised.
- `branch_id` optional: same existence + parent check against `restaurant_branches` as restaurant target.

### recommendation target
- `recommendation_id` required, trimmed, max 500 chars, no `fav-` prefix, no control characters.
- `restaurant_id`, `menu_item_id`, `branch_id` must all be null — any non-null field raises `FEEDBACK_TARGET_SHAPE_INVALID`.
- **No catalog existence check**: `recommendation_id` is an opaque bounded text ID from the recommendation engine. There is no `public.recommendations` catalog table to verify against.
- This is a **Development hard gate**: Phase 2Y-D-B deployment must test with a controlled `recommendation_id` value and document the opaque-ID strategy.

### Branch catalog (`restaurant_branches`)
- Table: `public.restaurant_branches`
- Columns used: `id` (text), `restaurant_id` (text)
- Constraint: `UNIQUE (id, restaurant_id)` — added in `20260716030000_add_restaurant_projection_integrity_constraints.sql`
- FK from `restaurant_membership_branch_scopes.branch_id` to `restaurant_branches(id)` confirms this is a canonical pre-existing catalog table.
- Validation query: `SELECT 1 FROM public.restaurant_branches WHERE id = v_branch_id AND restaurant_id = v_restaurant_id FOR KEY SHARE`

---

## 6. Input Text Validation (all string parameters)

All text inputs go through:

1. `pg_catalog.btrim(value)` — strip leading/trailing whitespace.
2. `nullif(trimmed, '')` — convert empty string to `NULL`.
3. **Nonempty check** — `IS NULL` after btrim raises a typed exception.
4. **Length bound** — `source_surface` and `model_version`: max 200 chars. Target IDs and `event_idempotency_key`: max 500 chars.
5. **Control character rejection** — regex `~ E'[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f]'` on applicable fields.
6. **Reserved prefix** — `fav-*` prefix rejected on all target IDs and the `event_idempotency_key`.

---

## 7. Error Code Taxonomy

### SQL outcome → adapter result mapping

| RPC | SQL outcome | Adapter result |
|-----|-------------|----------------|
| create | `created` JSON | `{ status: "created" }` |
| create | `already_created` JSON | `{ status: "already_created" }` |
| create | 28000 AUTHENTICATION_REQUIRED | `{ status: "unauthenticated" }` |
| create | 22023 SESSION_CREATE_CONFLICT | `{ status: "create_failed", errorCode: "feedback_database_failed" }` |
| create | 42501 permission denied | `{ status: "create_failed", errorCode: "feedback_permission_denied" }` |
| create | network throw | `{ status: "create_failed", errorCode: "feedback_transport_failed" }` |
| create | malformed JSON | `{ status: "create_failed", errorCode: "feedback_response_malformed" }` |
| end | `ended` / `already_ended` / `session_not_found` JSON | matching Frozen status |
| end | 28000 | `{ status: "unauthenticated" }` |
| end | 42501 | `{ status: "end_failed", errorCode: "feedback_permission_denied" }` |
| end | network throw | `{ status: "end_failed", errorCode: "feedback_transport_failed" }` |
| record | `recorded` / `already_recorded` / `idempotency_conflict` / `session_not_found` / `invalid_session` JSON | matching Frozen status |
| record | 28000 | `{ status: "unauthenticated" }` |
| record | **22023** (any target/catalog/shape validation) | **`{ status: "invalid_target", errorCode: "feedback_target_invalid" }`** |
| record | 42501 | `{ status: "write_failed", errorCode: "feedback_permission_denied" }` |
| record | network throw | `{ status: "write_failed", errorCode: "feedback_transport_failed" }` |
| record | malformed JSON | `{ status: "write_failed", errorCode: "feedback_response_malformed" }` |

SQL internal exception names (SESSION_CREATE_CONFLICT, FEEDBACK_BRANCH_NOT_FOUND_OR_MISMATCH, etc.) must not appear in any public result field. They are used only for adapter-internal error routing.

### RPC-level exceptions (reference)

| PostgreSQL errcode | Raised by | Adapter mapping |
|-------------------|-----------|-----------------|
| `28000` | `AUTHENTICATION_REQUIRED` | → `unauthenticated` |
| `22023` | Validation failures (shape, catalog, collision) — see full mapping above | → `create_failed` / `end_failed` / `invalid_target` depending on operation |
| `42501` | Permission denied (unexpected) | → `create_failed` / `end_failed` / `write_failed` depending on operation |

### RPC-level structured JSON returns

| RPC status | Adapter result |
|-----------|----------------|
| `created` | `ConsumerCreateRecommendationSessionResult { status: "created" }` |
| `already_created` | `{ status: "already_created" }` |
| `ended` | `{ status: "ended" }` |
| `already_ended` | `{ status: "already_ended" }` |
| `session_not_found` | `{ status: "session_not_found" }` |
| `recorded` | `{ status: "recorded" }` |
| `already_recorded` | `{ status: "already_recorded" }` |
| `idempotency_conflict` | `{ status: "idempotency_conflict" }` |
| `invalid_session` | `{ status: "invalid_session", errorCode: "session_ended" }` |

### TypeScript adapter errors

| Error | Code | Retryable |
|-------|------|-----------|
| `ConsumerRecommendationFeedbackAuthenticationRequiredError` | `feedback_authentication_required` | false |
| `ConsumerRecommendationFeedbackPermissionDeniedError` | `feedback_permission_denied` | false |
| `ConsumerRecommendationFeedbackDatabaseFailedError` | `feedback_database_failed` | true |
| `ConsumerRecommendationFeedbackTransportFailedError` | `feedback_transport_failed` | true |
| `ConsumerRecommendationFeedbackResponseMalformedError` | `feedback_response_malformed` | false |

---

## 8. What This Phase Does NOT Validate

- Actual network round-trip to Supabase (no credentials used)
- Concurrent session create convergence under real DB load
- Migration applied to remote schema
- `recommendation_id` catalog existence (Development hard gate: Phase 2Y-D-B)
- `branch_id` existence and restaurant consistency (only format-checked locally)
- Token expiry or re-authentication mid-session behavior

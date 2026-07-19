# Phase 2Y-A Runtime Contract — Recommendation Feedback

## Boundary Statement

Recommendation Feedback is a **write-only event runtime**. The consumer mobile UI
records behavioral feedback events (shown, clicked, accepted, dismissed, saved, consumed)
against recommendation candidates. There is no product use case for reading back raw
feedback rows in the consumer UI. This contract intentionally omits a read runtime.

Rationale: `recommendation_feedback` is an append-only behavioral event log. The only
read path is the `restaurant_consumer_aggregate_metrics` view, which is for internal
analytics and is subject to a privacy threshold. Building a consumer-facing read runtime
for raw feedback events would serve no UI purpose and would expand the attack surface
without justification. If a future product need for self-read emerges, it must be
defined in a dedicated later phase with explicit justification.

---

## Domain Types

### Source Model

```typescript
type ConsumerRecommendationFeedbackSource =
  | "disabled"
  | "mock"
  | "supabase";
```

### Feedback Action Vocabulary

Derived directly from `recommendation_feedback_action` enum (Migration 001):

```typescript
type ConsumerRecommendationFeedbackAction =
  | "shown"
  | "clicked"
  | "accepted"
  | "dismissed"
  | "saved"
  | "consumed";
```

**Vocabulary semantics:**

| Action | Meaning |
|---|---|
| `shown` | Candidate was displayed to the user |
| `clicked` | User tapped/selected the candidate |
| `accepted` | User confirmed the candidate (committed to this meal) |
| `dismissed` | User dismissed/skipped the candidate |
| `saved` | User expressed intent to save (not the same as canonical Favorites write) |
| `consumed` | User reported consuming the recommended item |

Multiple events per session+candidate are allowed. The same candidate may generate
`shown` followed by `clicked` followed by either `accepted` or `dismissed`.

### Session Types

```typescript
type ConsumerRecommendationSession = {
  sessionId: string;
  sourceSurface: string;
  modelVersion: string | null;
  schemaVersion: string;
  startedAt: string;
  endedAt: string | null;
};
```

### Target Identity

```typescript
type ConsumerRecommendationFeedbackTarget =
  | { kind: "recommendation"; recommendationId: string }
  | { kind: "restaurant"; restaurantId: string; branchId?: string | null }
  | { kind: "menu_item"; restaurantId: string; menuItemId: string; branchId?: string | null };
```

**Target resolution rules (from schema constraints):**

- `recommendation_feedback_entity_present` constraint: at least one of
  `restaurant_id`, `menu_item_id`, `recommendation_id` must be NOT NULL.
- `kind: "recommendation"` — uses `recommendation_id` only; maps the candidate ID
  from the recommendation engine. No `restaurant_id` required.
- `kind: "restaurant"` — uses `restaurant_id`; `branchId` is optional metadata.
- `kind: "menu_item"` — uses both `restaurant_id` (parent) and `menu_item_id`;
  `branchId` is optional metadata.
- `branchId` in all cases is metadata, not identity. It does not affect idempotency.

**Rejection rules (hard failures, not fallbacks):**

- Empty string for any ID field → `invalid_target`
- `fav-*` prefix IDs → `invalid_target`
- `menu_item` target with missing `restaurantId` → `invalid_target`
- All ID fields null/empty → `invalid_target`

**No inference, no fuzzy match, no display-name as identity.**

### Session Write Input / Result

```typescript
type CreateRecommendationSessionInput = {
  sessionId: string;
  sourceSurface: string;
  modelVersion?: string | null;
};
```

`contextSnapshot` is NOT accepted from client in Phase 2Y v1. The RPC writes
`context_snapshot = '{}'` (empty JSON object). DB column retained for future use.

```typescript
type ConsumerCreateRecommendationSessionResult =
  | { status: "created"; sessionId: string; startedAt: string; source: ConsumerRecommendationFeedbackSource }
  | { status: "already_created"; sessionId: string; source: ConsumerRecommendationFeedbackSource }
  | { status: "disabled"; source: ConsumerRecommendationFeedbackSource }
  | { status: "unauthenticated"; source: ConsumerRecommendationFeedbackSource }
  | { status: "invalid_input"; source: ConsumerRecommendationFeedbackSource; errorCode: string }
  | { status: "create_failed"; source: ConsumerRecommendationFeedbackSource; errorCode: string };

type EndRecommendationSessionInput = {
  sessionId: string;
};

type ConsumerEndRecommendationSessionResult =
  | { status: "ended"; sessionId: string; endedAt: string; source: ConsumerRecommendationFeedbackSource }
  | { status: "already_ended"; sessionId: string; source: ConsumerRecommendationFeedbackSource }
  | { status: "disabled"; source: ConsumerRecommendationFeedbackSource }
  | { status: "unauthenticated"; source: ConsumerRecommendationFeedbackSource }
  | { status: "session_not_found"; source: ConsumerRecommendationFeedbackSource; errorCode: string }
  | { status: "invalid_session"; source: ConsumerRecommendationFeedbackSource; errorCode: string }
  | { status: "end_failed"; source: ConsumerRecommendationFeedbackSource; errorCode: string };
```

### Feedback Event Write Input / Result

```typescript
type RecordRecommendationFeedbackEventInput = {
  sessionId: string;
  action: ConsumerRecommendationFeedbackAction;
  target: ConsumerRecommendationFeedbackTarget;
  eventIdempotencyKey: string;
};
```

Phase 2Y v1 field exclusions (DB columns retained, not exposed to Mobile):
- `source_surface`: RPC reads from session row after ownership verification — not from client.
- `eventTimestamp`: server clock (`clock_timestamp()`) writes the action-specific column.
- `rating`, `feedbackNote`, `dismissReason`: excluded from v1 public input.

```typescript
type ConsumerRecordRecommendationFeedbackResult =
  | { status: "recorded"; feedbackId: string; source: ConsumerRecommendationFeedbackSource }
  | { status: "already_recorded"; source: ConsumerRecommendationFeedbackSource }
  | { status: "idempotency_conflict"; source: ConsumerRecommendationFeedbackSource; errorCode: string }
  | { status: "disabled"; source: ConsumerRecommendationFeedbackSource }
  | { status: "unauthenticated"; source: ConsumerRecommendationFeedbackSource }
  | { status: "session_not_found"; source: ConsumerRecommendationFeedbackSource; errorCode: string }
  | { status: "invalid_session"; source: ConsumerRecommendationFeedbackSource; errorCode: string }
  | { status: "invalid_target"; source: ConsumerRecommendationFeedbackSource; errorCode: string }
  | { status: "invalid_action"; source: ConsumerRecommendationFeedbackSource; errorCode: string }
  | { status: "write_failed"; source: ConsumerRecommendationFeedbackSource; errorCode: string };
```

---

## Service Interface

```typescript
interface ConsumerRecommendationFeedbackService {
  readonly source: ConsumerRecommendationFeedbackSource;

  createCurrentUserRecommendationSession(
    input: CreateRecommendationSessionInput
  ): Promise<ConsumerCreateRecommendationSessionResult>;

  endCurrentUserRecommendationSession(
    input: EndRecommendationSessionInput
  ): Promise<ConsumerEndRecommendationSessionResult>;

  recordCurrentUserRecommendationFeedbackEvent(
    input: RecordRecommendationFeedbackEventInput
  ): Promise<ConsumerRecordRecommendationFeedbackResult>;
}
```

---

## Authentication / Ownership Contract

- `user_id` is derived exclusively from `auth.uid()` within the RPC — never from client input.
- Client does not pass `userId` or `user_id` in any write input.
- Session ownership is verified server-side: the write RPC must confirm that the session
  belongs to `auth.uid()` before writing feedback.
- Missing or expired auth session → `unauthenticated`; fail closed, no fallback.

---

## Idempotency / Retry / Concurrency Semantics

- **Idempotency key**: caller-generated `event_idempotency_key` (e.g. UUID v4).
  Unique per user per event. Server enforces uniqueness via
  `recommendation_feedback_idempotency_idx` UNIQUE on `(user_id, event_idempotency_key)`.
- **Same key + same payload**: RPC returns `already_recorded`. Safe retry — no side effects.
- **Same key + different payload**: RPC returns `idempotency_conflict`. Client error: the
  caller must not reuse a key for a different event. Fail closed; no write.
- **Conflict detection**: RPC uses `ON CONFLICT (user_id, event_idempotency_key) DO NOTHING`
  with `GET DIAGNOSTICS v_count = ROW_COUNT`. If `v_count = 0`, a row already existed.
  The RPC must read back the existing row's action and target, compare against the incoming
  payload, and return `already_recorded` or `idempotency_conflict` accordingly.
- **No advisory lock required**: each row is uniquely keyed; no current-row update pattern
  (unlike Ratings which updates `is_current`). Insert-or-ignore is safe under concurrent writes.
- **Multiple events per session**: allowed and expected. One session can produce multiple
  feedback rows with distinct `event_idempotency_key` values.
- **Ordering**: the schema does not enforce event ordering. `created_at` is database-generated
  on INSERT. Action-specific timestamp columns are written by server clock (`clock_timestamp()`).

---

## Append-Only Semantics

`recommendation_feedback` is append-only. No UPDATE, no soft delete, no hard delete of
individual rows by the consumer. User deletion cascades naturally via the FK
`ON DELETE CASCADE` on `user_id`.

`recommendation_sessions` has a one-time lifecycle transition: `ended_at` may be set once
by `end_authenticated_recommendation_session` RPC. A session with `ended_at` already set
returns `already_ended` — no second update. This lifecycle is frozen in Phase 2Y-A.

---

## Action / Server Timestamp Mapping

Server clock (`clock_timestamp()`) writes exactly one action-specific timestamp column per
event row. The client does NOT provide event timestamps.

| Action | Column written | Other action columns |
|---|---|---|
| `shown` | `shown_at = clock_timestamp()` | `clicked_at`, `accepted_at`, `dismissed_at`, `saved_at`, `consumed_at` = NULL |
| `clicked` | `clicked_at = clock_timestamp()` | others = NULL |
| `accepted` | `accepted_at = clock_timestamp()` | others = NULL |
| `dismissed` | `dismissed_at = clock_timestamp()` | others = NULL |
| `saved` | `saved_at = clock_timestamp()` | others = NULL |
| `consumed` | `consumed_at = clock_timestamp()` | others = NULL |

`created_at` is database-generated on INSERT. No client-provided timestamp is accepted.

---

## Disabled / Mock / Supabase Source Model

| Source | Behavior |
|---|---|
| `disabled` | All methods return `status: "disabled"`. No network, no storage. Default source. |
| `mock` | In-memory simulation. Session and feedback stored in local Map. Returns deterministic IDs. |
| `supabase` | Live Development only. Calls authenticated atomic RPCs. Requires `auth.uid()`. |

Safe default when flags absent or unrecognized: `disabled`.

---

## Fail-Closed Rules

The following scenarios must always fail closed — no fallback to mock, no silent ignore:

- Missing or unauthenticated session → `unauthenticated`
- `sessionId` does not belong to current user → `invalid_session`
- All target identity fields null/empty → `invalid_target`
- Invalid action value → `invalid_action`
- Network/RPC error → `write_failed` with error code
- Malformed RPC response → `write_failed`
- Client must NOT pass `userId`/`user_id` — if present in input type, it is a compile-time
  error by design (field not in input type)

---

## Boundary Independence

- **Ratings**: `ConsumerRecommendationFeedbackService` does NOT call into Ratings service.
  The `rating` field in feedback is contextual behavioral data, not a canonical Rating record.
- **Favorites**: `ConsumerRecommendationFeedbackService` does NOT call into Favorites service.
  The `saved` action is a behavioral signal, not a canonical Favorite write.
- **Meals**: No meal record linkage in feedback schema. The feedback session is independent
  of meal records.
- Each domain maintains its own service, repository, factory, and composition.

---

## No Read Runtime Statement

This phase explicitly does not build a consumer-facing read runtime for raw feedback events.

Evidence for this decision:
1. No product UI requires reading back raw feedback rows.
2. The `restaurant_consumer_aggregate_metrics` view is for internal analytics only.
3. RLS `owner_all` policy allows owner reads IF a SELECT grant and business need exist.
   Neither exists in Phase 2Y scope.
4. Building a read path without a consumer use case would add surface area without benefit.

If a future product need emerges (e.g., "show me what I've accepted this week"), it must
be defined in a separate phase with explicit UX specification.

Phase 2Y-C is therefore skipped. The subphase listing in `phase-2y-implementation-plan.md`
documents this explicitly.

---

## Future Write RPC Contract (Development Hard Gate)

The following constraints apply to the future write RPCs in Phase 2Y-D.
They are defined here as forward requirements, not yet implemented:

1. RPCs: `create_authenticated_recommendation_session` and
   `record_authenticated_recommendation_feedback_event`.
2. Both must be `LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp`.
3. `auth.uid()` must be called within the function body to derive `user_id`.
4. Function owner: database owner (not `postgres` service role from client).
5. `REVOKE ALL ... FROM public, anon, authenticated` before `GRANT EXECUTE ... TO authenticated`.
6. No direct INSERT/UPDATE/DELETE grant on tables will be given.
7. Session ownership verification: the feedback RPC must verify that the given
   `recommendation_session_id` belongs to `auth.uid()` before inserting.
8. Idempotency: `ON CONFLICT (user_id, event_idempotency_key) DO NOTHING`.
9. Return: the feedback `id` on `recorded`, nothing on `already_recorded`.
10. No `service_role` path in any client-facing code.
11. End session RPC: `end_authenticated_recommendation_session(p_session_id uuid)`.
    Verifies ownership (`auth.uid() = user_id`), checks `ended_at IS NULL`, sets
    `ended_at = clock_timestamp()`. Returns `already_ended` if `ended_at` is already set.
    Same SECURITY DEFINER + fixed search_path requirements.

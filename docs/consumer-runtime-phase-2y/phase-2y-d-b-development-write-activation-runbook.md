# Phase 2Y-D-B: Development Write Activation Runbook

**Phase:** Consumer Runtime Phase 2Y-D-B
**Status:** NOT STARTED — this runbook is authored in Phase 2Y-D-A and executed in Phase 2Y-D-B
**Environment:** Development only (Production = false)

---

## STOP — Prerequisite Checklist

Before executing any step in this runbook:

- [ ] Phase 2Y-D-A is frozen (commit `20260719010000` migration present, HEAD verified)
- [ ] You have a **fresh Development identity** (new session, not reusing a Production token)
- [ ] `Production = false` is confirmed — this runbook MUST NOT run against Production
- [ ] No `service_role` key is used at any step
- [ ] N4 is NOT executed
- [ ] No Phase 2Z work is started

---

## 1. Pre-Deployment Schema Alignment

**Goal:** Confirm the Development database has exactly 36 migrations applied before `20260719010000`.

```sql
-- Count applied migrations in Development
SELECT count(*) FROM supabase_migrations.schema_migrations;
-- Expected: 36
```

```bash
# Confirm the pending migration via Supabase CLI (local schema diff)
supabase db diff --schema public
# Expected: create_authenticated_recommendation_session, end_authenticated_recommendation_session,
#           record_authenticated_recommendation_feedback_event present as pending
```

If the count is not 36, stop. Reconcile the schema before proceeding.

---

## 2. Migration SHA Verification (Pre-Deployment)

```bash
sha256sum supabase/migrations/20260719010000_consumer_recommendation_feedback_atomic_write.sql
# Expected: d214ad6d239df8fb1f268f4be3e201a9ea7c86f274657d189f8df6f4e597b65b
```

If SHA does not match, stop. Do not deploy a modified migration.

---

## 3. Pre-Deployment ACL / Function Inventory

Before running the migration, confirm the three functions do NOT already exist with stale definitions:

```sql
SELECT proname, proowner::regrole, prosecdef, proconfig
FROM pg_proc
WHERE proname IN (
  'create_authenticated_recommendation_session',
  'end_authenticated_recommendation_session',
  'record_authenticated_recommendation_feedback_event'
);
-- Expected: 0 rows (first deployment) or 3 rows matching this migration's definitions
```

---

## 4. Single Migration Deployment

Deploy exactly the one pending migration to the Development database:

```bash
# Via Supabase CLI (local Development, NOT remote Production push):
supabase db push --local
# Or: supabase migration up --local
```

After deployment:

```sql
-- Confirm exactly 37 migrations applied
SELECT count(*) FROM supabase_migrations.schema_migrations;
-- Expected: 37

-- Confirm the migration timestamp is present
SELECT version FROM supabase_migrations.schema_migrations
WHERE version = '20260719010000';
-- Expected: 1 row
```

---

## 5. Post-Deployment Function Verification

```sql
-- Verify function owner, SECURITY DEFINER, and search_path
SELECT
  proname,
  proowner::regrole AS owner,
  prosecdef AS security_definer,
  proconfig AS search_path_config
FROM pg_proc
WHERE proname IN (
  'create_authenticated_recommendation_session',
  'end_authenticated_recommendation_session',
  'record_authenticated_recommendation_feedback_event'
)
ORDER BY proname;
-- Expected: 3 rows, prosecdef = true, proconfig contains 'search_path=pg_catalog, public, pg_temp'

-- Verify EXECUTE is granted only to authenticated
SELECT grantee, privilege_type
FROM information_schema.role_routine_grants
WHERE routine_name IN (
  'create_authenticated_recommendation_session',
  'end_authenticated_recommendation_session',
  'record_authenticated_recommendation_feedback_event'
)
ORDER BY routine_name, grantee;
-- Expected: Only 'authenticated' with 'EXECUTE'. No 'anon', 'public', or 'service_role' rows.
```

---

## 6. Authenticated Direct DML Denial

Confirm the authenticated role cannot write directly to the tables:

```sql
-- As authenticated (not service_role, not superuser)
SET ROLE authenticated;
SET request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}';

INSERT INTO public.recommendation_sessions (id, user_id, source_surface)
VALUES (gen_random_uuid(), auth.uid(), 'test');
-- Expected: ERROR 42501 permission denied for table recommendation_sessions

INSERT INTO public.recommendation_feedback (user_id, recommendation_session_id, action, source_surface, event_idempotency_key)
VALUES (auth.uid(), gen_random_uuid(), 'shown', 'test', 'test-key');
-- Expected: ERROR 42501 permission denied for table recommendation_feedback

RESET ROLE;
```

---

## 7. Development Identity: Catalog ID Determination

Before running the lifecycle test, obtain valid catalog IDs from Development:

```sql
-- Get a valid restaurant_id from Development
SELECT id FROM public.restaurants LIMIT 1;
-- Record as: DEVELOPMENT_RESTAURANT_ID

-- Get a valid menu_item_id with its parent restaurant_id from Development
SELECT id, restaurant_id FROM public.menu_items LIMIT 1;
-- Record as: DEVELOPMENT_MENU_ITEM_ID + DEVELOPMENT_MENU_ITEM_RESTAURANT_ID

-- Get a valid branch_id that belongs to DEVELOPMENT_RESTAURANT_ID from Development
SELECT id FROM public.restaurant_branches
WHERE restaurant_id = '<DEVELOPMENT_RESTAURANT_ID>'
LIMIT 1;
-- Record as: DEVELOPMENT_BRANCH_ID
-- If no branch exists for this restaurant, use a restaurant with branches or omit branch_id in tests.
```

For `recommendation_id`, use a controlled opaque text value (e.g., `"test-rec-00001"`). This value has no catalog entry. Document the opaque-ID strategy as the accepted Development hard gate for Phase 2Y-D-B.

---

## 8. Controlled Two-Actor Lifecycle Test

Use two separate authenticated Development identities (Actor A and Actor B).

### 8.1 Session Create

```sql
-- Actor A: create session
SELECT public.create_authenticated_recommendation_session(
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'development-test-surface',
  'v1-test'
);
-- Expected: { "status": "created", "session_id": "a0000000...", "started_at": "..." }

-- Actor A: retry with same payload → already_created
SELECT public.create_authenticated_recommendation_session(
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'development-test-surface',
  'v1-test'
);
-- Expected: { "status": "already_created", "session_id": "a0000000..." }

-- Actor A: retry with different payload → SESSION_PAYLOAD_CONFLICT
SELECT public.create_authenticated_recommendation_session(
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'different-surface',
  null
);
-- Expected: ERROR 22023 SESSION_PAYLOAD_CONFLICT
```

### 8.2 Six Action Events

Record one event per action using Actor A's session. Verify the correct timestamp column is set:

```sql
SELECT public.record_authenticated_recommendation_feedback_event(
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'shown', 'restaurant', 'key-shown-01',
  null, '<DEVELOPMENT_RESTAURANT_ID>', '<DEVELOPMENT_BRANCH_ID>', null
);
-- Expected: { "status": "recorded", "feedback_id": "..." }
-- Verify: recommendation_feedback row has shown_at set, all other ts columns NULL
-- Verify: branch_id column stores DEVELOPMENT_BRANCH_ID

-- Repeat for: clicked, accepted, dismissed, saved, consumed
-- with unique event_idempotency_key for each
```

### 8.3 Idempotency Conflict

```sql
-- Record event with same key but different payload
SELECT public.record_authenticated_recommendation_feedback_event(
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'clicked', 'restaurant', 'key-shown-01', -- same key, different action
  null, '<DEVELOPMENT_RESTAURANT_ID>', null, null
);
-- Expected: { "status": "idempotency_conflict" }
```

### 8.4 Session End / Concurrency

```sql
-- Actor A: end session
SELECT public.end_authenticated_recommendation_session('a0000000-0000-0000-0000-000000000001'::uuid);
-- Expected: { "status": "ended", ... }

-- Actor A: retry end → already_ended
SELECT public.end_authenticated_recommendation_session('a0000000-0000-0000-0000-000000000001'::uuid);
-- Expected: { "status": "already_ended", "ended_at": "<same timestamp as above>" }

-- Verify ended_at was not changed on retry
SELECT ended_at FROM public.recommendation_sessions WHERE id = 'a0000000-0000-0000-0000-000000000001';
-- Expected: single timestamp, same value from both end calls
```

### 8.5 Ended Session Write Denial

```sql
-- Actor A: attempt to record against ended session
SELECT public.record_authenticated_recommendation_feedback_event(
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'shown', 'restaurant', 'key-after-end',
  null, '<DEVELOPMENT_RESTAURANT_ID>', null, null
);
-- Expected: { "status": "invalid_session" }
```

### 8.6 Cross-Actor Isolation

```sql
-- Actor B: attempt to end Actor A's session
-- (authenticate as Actor B, then:)
SELECT public.end_authenticated_recommendation_session('a0000000-0000-0000-0000-000000000001'::uuid);
-- Expected: { "status": "session_not_found" } (fail closed, no existence leak)

-- Actor B: attempt to record against Actor A's session
SELECT public.record_authenticated_recommendation_feedback_event(
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'shown', 'restaurant', 'key-actor-b',
  null, '<DEVELOPMENT_RESTAURANT_ID>', null, null
);
-- Expected: { "status": "session_not_found" }
```

---

## 9. Aggregate Pre/Post Equality

Before the lifecycle test, record the session and feedback counts:

```sql
SELECT count(*) FROM public.recommendation_sessions;   -- pre_sessions
SELECT count(*) FROM public.recommendation_feedback;   -- pre_events
```

After the lifecycle test, verify expected deltas:
- `recommendation_sessions`: pre + 1 (one test session created)
- `recommendation_feedback`: pre + 6 (one event per action)

---

## 10. Development Data Cleanup

After validation, clean up the Development test session and its cascaded feedback:

```sql
-- Cascade: delete feedback first, then session
DELETE FROM public.recommendation_feedback
WHERE recommendation_session_id = 'a0000000-0000-0000-0000-000000000001';

DELETE FROM public.recommendation_sessions
WHERE id = 'a0000000-0000-0000-0000-000000000001';

-- Verify clean
SELECT count(*) FROM public.recommendation_sessions WHERE id = 'a0000000-0000-0000-0000-000000000001';
-- Expected: 0
SELECT count(*) FROM public.recommendation_feedback WHERE recommendation_session_id = 'a0000000-0000-0000-0000-000000000001';
-- Expected: 0
```

Persistent test data must not remain in Development after this runbook completes.

---

## 11. Phase 2Y-D-B Hard Gates

The following items are **Development deployment blockers** and must be resolved before Phase 2Y-D-B is declared complete:

| Gate | Status |
|------|--------|
| `recommendation_id` catalog existence: no `public.recommendations` table exists. The opaque ID strategy is accepted for Phase 2Y-D-B but must be documented and agreed upon. | **HARD GATE** |
| `branch_id` existence verified at RPC layer via `restaurant_branches` catalog | **COMPLETED IN Phase 2Y-D-A** — branch_id is now catalog-validated; no deferral |
| Post-deployment aggregate equality verified | Must PASS |
| Persistent test data left in Development | Must be ZERO after cleanup |

---

## 12. Forbidden in Phase 2Y-D-B

- No Production or remote operations
- No `service_role` key usage
- No N4 execution
- No Phase 2Z work
- No credential logging or debug output with tokens

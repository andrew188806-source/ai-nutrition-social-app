# Phase 2Y-D-B Development Write Execution Plan

Status: **prepared locally; remote execution not started**
Executor: Claude, in a fresh Development-only session
Project: `tastkind-development` / `msbgnnoorsoefuiwluye` / `ap-southeast-1`
Production: `false`

This is the ordered, fail-closed runbook for deploying only
`20260719010000_consumer_recommendation_feedback_atomic_write.sql` and then running the
credential-backed smoke. The local runner never deploys or repairs migrations. It never uses a
browser `service_role` path. Stop on every mismatch; do not reconcile, repair, or continue.

## Gate A — fresh Development identity

1. Start a fresh operator/CLI session and independently confirm project name
   `tastkind-development`, ref `msbgnnoorsoefuiwluye`, region `ap-southeast-1`, and
   `Production=false`.
2. Confirm the project URL resolves to that exact ref and is not an alias or Production URL.
3. Do not reuse credentials, tokens, or cached project linkage from another environment.

## Gate B — migration alignment before deployment

1. Count remote ledger entries: exactly `36`; local migration files: exactly `37`.
2. Compare the ordered versions and stored checksums of the first 36 entries byte-for-byte/exactly.
3. Confirm remote does not record `20260719010000`; the only pending file is
   `20260719010000_consumer_recommendation_feedback_atomic_write.sql`.
4. Recompute its SHA-256 and require
   `52a0d5708d6f7b32fca573750cc141342774c52467d90dc65efb650d0652af5e`.

## Gate C — read-only catalog and preflight

Using a Development postgres operator or Supabase CLI database permission channel, collect only
schema/ACL evidence and aggregate counts:

- confirm the `recommendation_sessions` and `recommendation_feedback` columns, constraints, and
  expected identity representations;
- confirm RLS is enabled, policy inventory/effective ACL is expected, and authenticated direct
  `INSERT`/`UPDATE`/`DELETE` is denied;
- confirm canonical restaurant, branch, and menu-item IDs and their exact representation;
- confirm branch-to-restaurant and menu-item-to-restaurant relationships are consistent;
- confirm all three RPCs are absent before first deployment, or the remote ledger/function state
  exactly matches the declared expected state; otherwise stop;
- capture only aggregate counts for both tables. Never output user rows or row content.

## Gate D — deploy exactly one Development migration

Deploy only `20260719010000_consumer_recommendation_feedback_atomic_write.sql`. Reconfirm the
target immediately before execution. Do not deploy another pending migration, run a repair, touch
Production, or let the live runner perform deployment.

## Gate E — post-deployment proof

Require all of the following before credentials are supplied:

- remote/local migration count is `37/37`; latest remote version is `20260719010000`; ordered
  ledger and checksum match;
- exactly these RPCs exist: `create_authenticated_recommendation_session`,
  `end_authenticated_recommendation_session`, and
  `record_authenticated_recommendation_feedback_event`;
- each function has the expected owner, `SECURITY DEFINER`, and fixed
  `search_path=pg_catalog, public, pg_temp`;
- `PUBLIC` and `anon` lack `EXECUTE`; only `authenticated` has intended execute access;
- authenticated direct table `INSERT`/`UPDATE`/`DELETE` remains denied and RLS remains enabled;
- the same aggregate queries used at Gate C exactly equal their pre-deployment counts.

The injected operator's `verifyRemoteState()` result must independently report all these booleans
and counts. Any missing or false field fails closed.

## Gate F — controlled credential-backed smoke

Run only after Gate E is completely green, with two distinct Development actors and canonical
Development targets. Before the first write, the exact cleanup operator must be loaded, capability
checked, and ready. Its controlled pre-count must be `0`, and an immediate aggregate baseline must
be captured.

The public path is:

1. `createConsumerAuthPort` with a separate public client and memory session store per actor;
2. `createConsumerRecommendationFeedbackRuntime` with explicit `{ source: "supabase" }`;
3. canonical service methods only—never direct REST/SQL or direct repository/service construction.

The lifecycle proves create, identical create idempotency, colliding/foreign session failure,
supported event write, identical event idempotency, changed-payload `idempotency_conflict`,
`invalid_action`, `invalid_target`, invalid event key (`write_failed` / `event_key_invalid`), end,
repeat end (`already_ended`), actor isolation, session-owned `source_surface`, server timestamps and
action-specific timestamp columns, and absence of client `userId`/`user_id` input.

## Exact cleanup and failure handling

Cleanup is a parameterized operator transaction with exactly two deletes, in child-first order:

```sql
delete from public.recommendation_feedback
where user_id = any($1::uuid[])
  and recommendation_session_id = any($2::uuid[])
  and event_idempotency_key = any($3::text[]);

delete from public.recommendation_sessions
where user_id = any($1::uuid[])
  and id = any($2::uuid[]);
```

Both deletes contain `WHERE` plus exact controlled actor/session/event predicates. `LIKE`, fuzzy
matching, interpolated SQL, and full-table delete are prohibited. The operator is never a browser
`service_role` client.

The `finally` path always attempts cleanup, proves controlled rows=`0`, and proves aggregate counts are restored.
It signs out ACTOR_1 and ACTOR_2, clears both memory sessions, closes the operator, removes
temporary compilation artifacts, and reports `persistentTestData=false`. Cleanup failure overrides
an otherwise successful smoke. Local dry-run includes an injected failure and proves this same
finally contract.

## Privacy and handoff inputs

Output is restricted to PASS/FAIL check names, canonical statuses, booleans, counts, and
`ACTOR_1`/`ACTOR_2`. It must not contain emails, passwords, JWTs, tokens, session tokens, UUIDs,
target/event IDs, database rows, or connection strings. Missing inputs are reported only by key
name. Claude must inject process-local values for the opt-in, project/region/Production markers,
migration and ACL evidence, two actor credentials, canonical targets, controlled UUID/key inputs,
public Supabase URL/key, and cleanup operator module path. No `.env.local` file is read.

Phase 2Z and N4 remain unstarted. Production remains untouched. Successful completion requires
`persistentTestData=false`, equal before/after aggregate counts, and a clean operator close.

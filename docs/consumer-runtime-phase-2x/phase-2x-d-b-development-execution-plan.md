# Consumer Runtime Phase 2X-D-B0 — Development Write Execution Plan

Status: local execution-tool candidate only. Phase 2X-D-A is Frozen. This plan does not authorize a remote command, migration deployment, credential-backed smoke, cleanup, or Freeze.

## Fixed boundary

- Approved target: TastKind Development, project ref `msbgnnoorsoefuiwluye`, Production=`false`.
- Frozen migration: `20260718020000_consumer_favorites_atomic_write.sql`.
- SHA-256: `63257e599b51551a4425eb03b26a5a21319c97fafeb9e7fad08a8c4ec8311475`.
- Before Claude deployment: local/remote=`36/35`, latest remote=`20260718010000`.
- Before the write runner may execute: local/remote=`36/36`, latest remote=`20260718020000`, function/ACL evidence verified, global menu-item ID uniqueness verified, and exact cleanup capability ready.

The runner never deploys or repairs a migration. Claude must complete the Frozen D-A runbook gates and deployment independently before enabling the runner.

## Safe invocation modes

- Default invocation: returns `skipped`, performs no compilation, network request, database operation, authentication, or cleanup.
- `--dry-run`: uses fake Auth, a stateful fake RPC/read client, and a fake parameterized cleanup operator. It never reads live credentials or connects to a database.
- Credential-backed Development mode: requires process-local `TASTKIND_CONSUMER_PHASE2X_DB_DEVELOPMENT_LIVE_SMOKE=true` plus every gate below.

The package scripts expose the guard, safe-default runner, and dry-run separately. Production runtime defaults are not changed.

## Required Development gates

The live runner checks only presence or exact gate values and never prints values. Required key names are:

- `TASTKIND_CONSUMER_PHASE2X_DB_PROJECT_REF`
- `TASTKIND_CONSUMER_PHASE2X_DB_PRODUCTION`
- `TASTKIND_CONSUMER_PHASE2X_DB_LOCAL_MIGRATION_COUNT`
- `TASTKIND_CONSUMER_PHASE2X_DB_REMOTE_MIGRATION_COUNT`
- `TASTKIND_CONSUMER_PHASE2X_DB_LATEST_REMOTE_MIGRATION`
- `TASTKIND_CONSUMER_PHASE2X_DB_MIGRATION_SHA`
- `TASTKIND_CONSUMER_PHASE2X_DB_RPC_ACL_EVIDENCE_VERIFIED`
- `TASTKIND_CONSUMER_PHASE2X_DB_MENU_ID_UNIQUENESS_VERIFIED`
- `TASTKIND_CONSUMER_PHASE2X_DB_CLEANUP_OPERATOR_READY`
- `TASTKIND_CONSUMER_PHASE2X_DB_CLEANUP_OPERATOR_MODULE`
- public Consumer Supabase URL and publishable-key keys already accepted by Consumer Auth
- distinct Actor 1 and Actor 2 email/password keys
- controlled restaurant, menu restaurant, menu item, and wrong-parent restaurant target keys

Missing environment output contains key names only. It contains no value, identity, locator, credential, session, target, or row.

## Formal runtime path

For each actor the live runner creates a separate public client and isolated memory storage through `createConsumerAuthPort`. The same injected client is passed to `createConsumerFavoriteRuntime` with:

```text
readSource=supabase
writeSource=supabase
```

All get/list/add/remove behavior uses the canonical service returned by the factory. The runner does not instantiate a repository or service directly and does not replace application lifecycle calls with REST or SQL. SQL is restricted to operator-only catalog/count evidence, authenticated direct-DML denial probes, and exact exceptional cleanup.

## Controlled lifecycle

After both actors sign in, the operator must prove that the exact actor/target scope has zero active or historical rows. Actor 1 then runs the full restaurant and menu-item lifecycle:

1. missing read;
2. add=`added` and read=`available`;
3. duplicate add=`already_present`;
4. remove=`removed` and repeated remove=`already_absent`;
5. identical concurrent adds converge to `added` plus `already_present` and one active row;
6. identical concurrent removes converge to `removed` plus `already_absent` and no active row;
7. re-add produces a different favorite identity while removed history remains;
8. wrong-parent menu add fails closed with unchanged target counts.

With Actor 1 rows active, Actor 2 must read each target as missing, fail to remove Actor 1's row, create its own row, and see exactly its own controlled target through get/list. The two actors' record identities must differ.

The authenticated public client also attempts INSERT, UPDATE, and DELETE against both Favorites tables. All six attempts must be permission denied, and controlled counts must remain unchanged.

## Cleanup operator contract

The module identified by `TASTKIND_CONSUMER_PHASE2X_DB_CLEANUP_OPERATOR_MODULE` is an operator scratch artifact supplied outside the Repository. It must export `createDevelopmentCleanupOperator()` and return:

- capabilities exactly confirming Development-only, parameterized-query, and transaction support;
- `query(text, parameters)`;
- `transaction([{ text, parameters }, ...])`;
- optional `close()`.

Claude must implement this module using the approved Development postgres operator or Supabase CLI database permission channel, never a browser `service_role` client. The runner supplies parameterized SQL. Cleanup deletes only:

- both exact authenticated actor UUIDs plus the exact controlled restaurant target;
- both exact actor UUIDs plus the exact controlled restaurant/menu-item pair.
- both exact actor UUIDs plus the exact controlled wrong-parent/menu-item pair as a fail-safe if the required denial is violated.

Both deletes contain `WHERE`, exact user and target predicates, no `LIKE`, and include active and removed-history rows. The runner will not start writes until operator capabilities, aggregate baseline, catalog targets, parent relationship, and zero pre-existing controlled rows are proven.

## Finally and failure contract

Cleanup, two-actor sign-out, session clearing, operator close, controlled-row recount, aggregate comparison, and local compilation-artifact removal are in failure-safe `finally` paths. A successful final result requires:

- controlled active/history row count=`0`;
- aggregate table counts exactly equal the pre-smoke baseline;
- both sessions cleared;
- operator cleanup and close successful;
- `persistentTestData=false`.

Any cleanup, logout, count, or aggregate failure forces the final result to `failed`. No commit or Freeze is permitted.

## Privacy and exclusions

Output is limited to PASS/FAIL checks, canonical statuses, booleans, aggregate counts, and `ACTOR_1`/`ACTOR_2` labels. It never includes email, password, token, session, UUID, target ID, favorite ID, row payload, connection string, SQL credential, or exception detail.

Phase 2X-E, Phase 2Y, N4, Production, remote deployment, and Freeze remain outside D-B0. The runner performs no migration operation and stores no credential or target value in the Repository.

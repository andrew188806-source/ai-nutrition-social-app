# Consumer Runtime Phase 2X-C-B — Development Read Activation Runbook

Status: execution preparation only. Codex local validation does not authorize or perform remote access. Claude owns every Development operation described below.

## Fixed identities and boundaries

- Approved project name: `tastkind-development`.
- Approved project ref: `msbgnnoorsoefuiwluye`.
- Approved region: `ap-southeast-1`.
- Production: `false`.
- Local migration count before deployment: `35`.
- Candidate migration: `20260718010000_consumer_favorites_authenticated_read.sql`.
- Candidate SHA-256: `64c3c35b149c129c82f7ac4bf89e4d320db6635a9a6122891d8f97a79547e616`.
- Phase 2X-C-A Frozen Commit: `4053673de0e533e7e4376d21fb4e93c6d85cdff4`.

This runbook never authorizes Production, `service_role`, N4, direct Favorites DML, a Favorites RPC, fixture creation, or a second pending migration. Tokens, credentials, sessions, actor identifiers, target values, and favorite contents must never be printed or copied into evidence.

## Gate A — Fresh remote identity

Claude must obtain a fresh management-plane identity confirmation before any database command and record only the four allowlisted facts:

- project name equals `tastkind-development`;
- project ref equals `msbgnnoorsoefuiwluye`;
- region equals `ap-southeast-1`;
- Production equals `false`.

Use the already-installed Supabase CLI and process-local telemetry opt-out only. Do not run login and do not inspect, transform, or print an access token. If CLI authentication or fresh identity confirmation is unavailable, stop. Never try another project, Production, a privileged key, a user-global configuration change, or a sandbox bypass.

## Gate B — Pre-deployment migration alignment

Before `db push`, Claude must verify all of the following from fresh linked Development evidence:

1. Local migration count is `35`.
2. Remote migration count is `34`.
3. The remote latest version is `20260717010000_consumer_ratings_authenticated_read_and_atomic_write.sql`.
4. All 34 pre-candidate local migrations align exactly with remote history.
5. Remote does not record version `20260718010000`.
6. The only pending file is `20260718010000_consumer_favorites_authenticated_read.sql`.
7. Its SHA-256 is `64c3c35b149c129c82f7ac4bf89e4d320db6635a9a6122891d8f97a79547e616`.

If remote already records `20260718010000`, do not re-execute it. Stop and verify that version, content, and checksum match the Frozen migration. Any other count, version, checksum, history, or pending-file result is a hard stop; no repair, reset, broad push, or history rewrite is authorized.

## Gate C — Read-only catalog preflight

Run the Frozen `phase-2x-c-a-development-readonly-preflight.sql` only after Gate A and Gate B pass. It contains catalog and aggregate `SELECT` statements only. Sanitize its evidence to metadata and aggregate counts.

The review must establish:

- `favorite_restaurants` and `favorite_menu_items` exist with the approved columns and indexes;
- RLS is enabled and current owner policies use `auth.uid() = user_id` in their row predicates;
- effective PUBLIC, anon, and authenticated privileges are known before deployment;
- no Favorites RPC, view, or function exists;
- pre-deployment aggregate row counts are captured without row content;
- catalog identifier representation is known;
- `menu_items.id` global uniqueness is checked;
- cross-restaurant reuse of one `menu_item_id` is checked;
- menu-item/restaurant parent consistency can be verified.

An unresolved identifier or parent-consistency result must be recorded as a read-path risk decision. It does not authorize write activation, and Phase 2X-D remains blocked. Any unexpected function/view, unsafe policy, missing RLS, or catalog mismatch is a deployment stop.

## Gate D — Single Development deployment

Only after Gates A, B, and C all pass may Claude deploy to the linked Development project. The deployment must contain exactly the one pending version `20260718010000`; it must not reset the database or include any other migration.

After deployment, local and remote migration counts must both be `35`, histories must align exactly, and the remote latest version must be `20260718010000_consumer_favorites_authenticated_read.sql`. A deployment failure is a stop condition; no manual hotfix or Production operation is authorized.

## Gate E — Post-deployment ACL and data-preservation verification

Repeat the approved read-only catalog checks and confirm:

- authenticated has `SELECT=true` and `INSERT/UPDATE/DELETE=false` on both Favorites tables;
- anon has `SELECT/INSERT/UPDATE/DELETE=false` on both tables;
- PUBLIC has no Favorites privilege;
- RLS remains enabled and owner policies are byte-semantically unchanged;
- no Favorites RPC, view, or function was added;
- aggregate row counts exactly equal the Gate C pre-deployment counts;
- local and remote migration histories remain aligned at `35`.

The Gate E aggregate counts become the immediate pre-smoke baseline. Only a complete Gate E PASS authorizes the credential-backed read smoke.

## Credential-backed read smoke

Run `npm run test:consumer-phase2x-c-b-live-smoke` only with an explicit process-level opt-in and the Gate E evidence markers required by the runner. Missing credentials are reported only as environment-key names. The runner accepts the repository's phase-scoped smoke convention and, when present, the Development verification aliases `DV_CONSUMER_NON_MEMBER_EMAIL`, `DV_A_OWNER_EMAIL`, and `TASTKIND_DV_TEST_PASSWORD`; values are never logged.

The runner:

- creates Consumer Auth through the formal Auth factory with an injected official Supabase SDK loader;
- creates Favorites through `createConsumerFavoriteRuntime` with `readSource=supabase` and `writeSource=disabled`;
- exercises restaurant and menu-item `getCurrentUserFavorite` plus bounded `listCurrentUserFavorites` pagination;
- accepts `missing`/`empty` or `available` results when internally consistent;
- verifies active-only records, deterministic ordering, cursor progress, and `source=supabase`;
- optionally repeats with a second actor, but never claims controlled cross-actor row isolation without controlled rows;
- repeats reads to prove the authenticated visible result set did not change;
- signs out in `finally` and verifies the session is cleared.

The runner contains no add/remove call, direct table DML, RPC, SQL, fixture, or seed path. Gate E supplies the global pre-smoke aggregate baseline; the smoke supplies repeated current-user read stability. Immediately after the runner exits, Claude must repeat the same read-only aggregate count statements and confirm they exactly match Gate E. This post-smoke comparison supplies the global after proof. Persistent test data must remain `false`.

For local contract validation only, run:

```text
npm run test:consumer-phase2x-c-b-live-smoke -- --dry-run
```

Dry-run uses an injected in-memory fake client, does not read `.env.local`, and performs no network or database operation. Running the smoke without `--dry-run` and without the explicit live opt-in returns a sanitized `SKIP`.

## Evidence and handoff result

Claude's sanitized record must include Gate A–E outcomes, pre/post migration counts, exact migration SHA, immediate pre-smoke and post-smoke aggregate-count equality, actor sign-in/sign-out counts, read operation outcomes without contents, session cleanup, runner native exit code, and the following booleans:

- persistent test data created: `false`;
- Production touched: `false`;
- service role used: `false`;
- N4 executed: `false`;
- Favorites write used: `false`.

Phase 2X-C-B cannot Freeze unless every gate and the credential-backed smoke pass. Phase 2X-D/E and Phase 2Y remain not started.

# Consumer Runtime Phase 2X-D-A — Security and Local Validation

Status: local static and injected fake-client validation only.

## Security decisions

- Every function is `SECURITY DEFINER` with `search_path = pg_catalog, public, pg_temp`.
- Tables and security-sensitive built-ins are schema-qualified.
- Every function derives its owner exclusively from `auth.uid()` and rejects null.
- Add verifies canonical target existence; menu-item add verifies the exact restaurant parent.
- Menu-item conflict/remove paths reject an active row under a different restaurant.
- Advisory transaction locks match the existing active unique-index keys.
- Partial unique indexes remain the final duplicate-active-row backstop.
- Add never rewrites removed history; remove only sets `removed_at` on the current user's active row.
- Function execute is revoked from PUBLIC, anon, and authenticated before being granted only to authenticated.
- Authenticated table `SELECT` remains unchanged and direct table `INSERT`, `UPDATE`, and `DELETE` remain revoked.
- Returned JSON omits ownership, token, policy, and internal security data.

## Runtime validation

The mapper rejects unknown response keys as well as missing, malformed, ownership-bearing, or target-mismatched responses. Record-bearing statuses require a non-empty favorite ID, canonical target, nullable label/integer order, valid timestamp, and an active flag consistent with the operation. `already_absent` accepts only its target identity.

Transport exceptions, authentication denial, permission denial, database errors, and malformed JSON map to the existing typed Favorites failures. The adapter logs no request, response, credential, session, or target payload.

## Local fake-client contract smoke

The Phase 2X-D-A smoke compiles the complete Favorites feature into an operating-system temporary directory and removes it in `finally`. An injected fake client records exact RPC names and arguments without network or database access.

It verifies:

- default write disabled and explicit Supabase opt-in;
- missing Auth/client and invalid source fail closed;
- independent read/write composition and zero factory-time client calls;
- all four RPC names and exact target-only arguments;
- no ownership argument;
- `added`, `already_present`, `removed`, and `already_absent` mapping;
- target and active-state response validation;
- authentication, permission, database, transport, and malformed-response failures;
- no direct DML or mock fallback;
- deterministic repeated mapping and Frozen read behavior.

The smoke must pass twice with the same check count. Local validation also includes the Phase 2X-B mock regression, Phase 2X-C-A read regression, relevant workspace typechecks, schema validators, canonical audit, dependency-tree validation, `git diff --check`, Markdown/secret/artifact scans, migration inventory, frozen-artifact checks, and empty staged diff.

## Forward-compatible regression disposition

The immutable candidate-era smoke scripts are still executed, but their obsolete negative gates are classified precisely as `EXPECTED_PHASE_TRANSITION_RESULT`:

- Frozen Phase 2X-B smoke: native exit `1`, `3` positive assertions pass before one transition assertion fails: `unsupported sources do not fall back to mock`. The failure is solely the legal 2X-B to 2X-C progression that added Supabase read.
- Frozen Phase 2X-C-A smoke: native exit `1`, `3` positive assertions pass before one transition assertion fails: `Supabase write source is rejected`. The failure is solely the legal 2X-C to 2X-D progression that added Supabase write.

Both scripts are fail-fast, so assertions after the approved transition gate are not executed there. The Phase 2X-D-A forward regression smoke replaces those obsolete negative gates with current-runtime positive invariants. It verifies the retained Phase 2X-B mock lifecycle, idempotency, history, actor/store isolation and deterministic dependencies; the retained Phase 2X-C Supabase read mapping, active-only filtering, ordering, cursor, disabled-write and fail-closed behavior; and the complete Phase 2X-D source matrix and dependency gates. It must pass twice deterministically.

The guard verifies byte equivalence of both Frozen smoke files, their exact exit/reason/passing-prefix disposition, the complete forward-smoke result, and the correction-time SHA-256 of every approved production runtime file and the migration. No production compatibility branch, hidden flag, environment-specific behavior, or mock fallback is permitted. Phase 2X-D/E and Phase 2Y regression gates must carry forward historical positive invariants rather than candidate-era assertions that future sources must not exist.

## Not established locally

Local validation does not prove the Development function owner, ACLs, effective grants, catalog global menu-item uniqueness, concurrent database behavior, two-actor isolation, cleanup, or aggregate preservation. Those are hard gates in the Phase 2X-D-B runbook. This candidate performs no HTTP, SQL, credential login, remote operation, database write, or migration deployment.

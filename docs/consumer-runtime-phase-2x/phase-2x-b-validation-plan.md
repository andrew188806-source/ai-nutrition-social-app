# Consumer Runtime Phase 2X-B — Local Validation Plan

Status: local implementation candidate validation only.

## Static guard

The Phase 2X-B guard verifies the candidate file allowlist, empty staged diff, unchanged frozen Phase 2X-A and Phase 2W files, unchanged migrations and package lock, exact source-mode defaults, public API ownership exclusion, deterministic mock dependencies, actor isolation, soft-removal lifecycle, per-entity ordering/cursor contract, and absence of Supabase, network, privileged credential, Mobile UI, Phase 2Y, and N4 implementation paths.

## Contract smoke

The smoke compiles the dedicated TypeScript feature into an operating-system temporary directory and removes that directory in `finally`. It uses only injected in-memory actors, stores, clocks, and ID generators. It covers disabled behavior, authentication failure, invalid targets and pagination, current reads, active-only lists, idempotent add/remove, historical preservation, re-add, entity and actor isolation, deterministic ordering, page limits, cursor resume, runtime-instance isolation, and static no-network/no-database assertions.

The smoke must pass twice with the same check count and outcome. No real credential, Supabase client, HTTP request, SQL statement, database connection, or application database write is permitted.

## Local commands

- `node --check scripts/consumer-favorites-phase-2x-b-guard.mjs`
- `node --check scripts/consumer-favorites-phase-2x-b-contract-smoke.mjs`
- `npm run test:consumer-phase2x-b`
- `npm run test:consumer-phase2x-b-smoke` twice
- relevant workspace typechecks
- `npm ls --depth=0`
- canonical data audit
- `git diff --check`

The Phase 2X-B guard invokes the frozen Phase 2X-A guard as a regression diagnostic. The expected result is `EXPECTED_PHASE_TRANSITION_RESULT`: 37 checks pass and exactly 4 fail. The 4 failures are legitimate Phase 2X-B progression signals — not runtime regressions — and are reported exactly. Future Phase 2X-C/D/E guards must carry their own historical anchor checks and must not require the Phase 2X-A guard to pass 41/41 on later worktrees.

The 4 Phase 2X-A guard failures and their legitimate phase-progression reasons:

1. `HEAD remains the Frozen Phase 2W-E baseline` — HEAD advanced to the Phase 2X-A Frozen Commit `7e4a9148b5caa73955d87570ea6aed645aff9bfe`.
2. `candidate changes stay inside the approved Phase 2X-A boundary` — Phase 2X-B adds files outside the Phase 2X-A allowlist.
3. `no Favorites runtime implementation exists` — Phase 2X-B adds `apps/mobile/features/consumer-favorites/`.
4. `package-lock and dependencies remain unchanged` — Phase 2X-B adds `test:consumer-phase2x-b` and `test:consumer-phase2x-b-smoke` script entries to package.json.

## Exit conditions

The candidate is locally ready only when the Phase 2X-B guard, both smoke runs, relevant typechecks, dependency audit, scope/security scans, migration/package-lock checks, and staged-diff check pass. The Phase 2X-A guard result of 37/41 is the expected phase-transition outcome and is not a freeze blocker.

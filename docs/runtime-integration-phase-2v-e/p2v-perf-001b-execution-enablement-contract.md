# P2V-PERF-001B Execution Enablement Authority Clarification Candidate

Status: **candidate for independent D2 review; not Frozen; execution not authorized**

The normative machine authority is `p2v-perf-001b-execution-enablement-authority.json`, authority `P2V-PERF-001B-EXECUTION-ENABLEMENT-A1`, schema `tastkind.p2v-perf.execution-enablement-authority`, version 1.

This document uses the name **P2V-PERF-001B Execution Enablement** for this candidate's own lifecycle identity. `C01` and `C02` are workload case IDs inside the frozen 35-case inventory; neither this document nor any prior Frozen authority defines a lifecycle node literally named `C02`, and this document does not use that name for itself.

## Exact candidate inventory

1. `docs/runtime-integration-phase-2v-e/p2v-perf-001b-execution-enablement-authority.json`
2. `docs/runtime-integration-phase-2v-e/p2v-perf-001b-execution-enablement-contract.md`
3. `scripts/restaurant-performance-p2v-perf-001b-execution-enablement-authority-guard.mjs`

There is no fourth candidate path in this round. No existing tracked file is modified, staged, or deleted by this candidate. The existing migration candidate `supabase/migrations/20260722010000_cache_restaurant_current_access_context_plan.sql` (SHA-256 `4e08de96d28a5e6d9911b074fa73769ea5b3e21d9e14a089c7f420e16a4fbe72`) is neither modified nor staged.

## Candidate baseline

Branch `main`, HEAD `fb7f8a49fe40d290ffb2cd4285b478b57b309ee4`, exactly 41 tracked migrations. This binding expires only after this exact candidate's independent D2 review and Freeze; it is not an execution baseline and does not itself authorize PostgreSQL 17.6 acquisition, cluster creation, or a formal suite run.

## Frozen bindings

All twenty existing Frozen artifacts — the four C01 implementation artifacts (formal runner, evidence schema, evidence validator, C01 implementation guard), the reauthorization candidate (authority, contract, diagnosis provenance, guard), the remediation candidate (authority, contract, guard), the base authority/contract/guard, the plan-metric-semantics authority/contract/guard, and the dataset-semantics authority/contract/guard — plus the migration candidate, are bound by exact path and SHA-256 in the machine authority's `frozenBindings`. All twenty-one bound files remain byte-for-byte unchanged by this candidate.

## Authority precedence

1. Every existing Frozen authority, the formal runner, the evidence schema, the evidence validator, and every existing guard remain byte-for-byte unchanged.
2. This candidate does not retroactively change any existing BLOCKED, PASS, or Freeze result. Creation of these three files is not PASS evidence and is not execution.
3. This candidate confers no execution authorization before its own independent D2 review and Freeze.
4. After Freeze, this authority prospectively supplies, and only these four things: the 12-method PostgreSQL adapter contract; the formal execution provenance model; exactly eight new future-path authorizations; and a minimal, exact-scoped exception to the package/lockfile prohibition limited to the single direct dependency `pg`.
5. This authority does not claim that any existing Frozen authority previously authorized the 12-method contract, the provenance model, the eight future paths, or the `pg` dependency exception. All four are newly and prospectively authorized here.
6. `C01` and `C02` are workload case IDs, not lifecycle names; this candidate uses only the name P2V-PERF-001B Execution Enablement for itself.

## PostgreSQL 17.6 version policy

The formal-suite exact version is `17.6` (`serverVersionNum` `170006`). This applies **only** to the P2V-PERF-001B formal performance comparability baseline — the exact server version both fresh formal suites must run so cold/warm timing and buffer thresholds remain comparable to the Frozen diagnosis evidence. It is **not** the Development runtime version, **not** the Production runtime version, and establishes **no long-term product version pin**. It does **not** block Development or Production from adopting newer minor security releases within the PostgreSQL 17 line. Any actual deployment version — including a later 17.x minor — requires its own separate deployment-version compatibility and performance validation, which this candidate does not authorize, scope, or perform. A deployment-version validation on a non-17.6 server cannot substitute for a P2V-PERF-001B formal-suite PASS, and a formal-suite PASS on 17.6 cannot substitute for Production version validation.

## Exact eight future authorized paths

No wildcard authorization exists. Effective only after independent review and Freeze of this exact candidate:

1. `package.json` — add the single direct dependency `pg` at an exact pinned version.
2. `package-lock.json` — mechanical lockfile change caused only by `pg` and its required transitive resolution.
3. `docs/runtime-integration-phase-2v-e/p2v-perf-001b-execution-manifest-schema.json` — closed schema for the execution manifest.
4. `scripts/restaurant-performance-p2v-perf-001b-postgres-runtime.mjs` — trusted binary resolution, exact-version verification, process lifecycle, isolated runtime root, PID tracking, stale-process detection, signal-safe stop, cleanup verification.
5. `scripts/restaurant-performance-p2v-perf-001b-postgres-adapter.mjs` — the concrete 12-method adapter implementation.
6. `scripts/restaurant-performance-p2v-perf-001b-execution-provenance.mjs` — raw-byte hashing, manifest generation, formal/synthetic distinction, bundle validation, path containment, atomic output, artifact SHA binding.
7. `scripts/restaurant-performance-p2v-perf-001b-execution-cli.mjs` — argument parsing, trusted runtime construction, local-only enforcement, adapter construction, formal-runner invocation, existing validator invocation, new provenance validator invocation, signal handling, final cleanup, exit codes, evidence bundle output.
8. `scripts/restaurant-performance-p2v-perf-001b-execution-enablement-implementation-guard.mjs` — contract validation and negative self-tests for the seven paths above plus the package/lockfile delta.

No existing tracked path is authorized to be modified: the formal runner, the evidence schema, the evidence validator, the C01 implementation guard, every existing authority/contract/guard file listed in Frozen bindings, the migration candidate, any other existing migration, any application code, any RLS policy, any grant/ACL, any schema change other than the already-authorized function replacement named in the remediation authority, and any Development or Production configuration remain forbidden to modify.

## Dependency exception

The package/lockfile prohibition is excepted **only** for adding the single direct dependency `pg`, at an exact pinned version (floating ranges prohibited), with no other new direct dependency. The lockfile may change only mechanically, as a consequence of `pg` and its required transitive resolution. The future execution-enablement implementation guard must validate this package delta.

## 12-method adapter contract

This section is self-contained: every field below is reproduced verbatim from the machine authority's `adapterContract` object (the `note`, all twelve entries of `methods`, `orderingSummaryAcrossASuite`, and `exactCaseAndProfileOrderRestoration`), so this Markdown can be read on its own and yields the identical formal contract as the JSON, with no "see JSON" cross-reference required for any field. The corrected authority guard performs a deterministic structural deep-equality check between this fenced block and the JSON's `adapterContract` object; the two must never diverge.

These twelve names, argument shapes, and return shapes are derived from the exact, already-Frozen, byte-for-byte-unchanged call sites in the existing formal runner's `executeFormalSuites` function. No prior Frozen authority named these twelve methods; this authority is the first to define them as a formal contract, prospectively, effective only after Freeze — it does not claim they were previously Frozen-authority-defined.

```json execution-enablement-adapter-contract
{
  "note": "All 12 method names, argument shapes, and return shapes below are derived from the exact, already-Frozen, byte-for-byte-unchanged call sites in c01FormalRunner (executeFormalSuites, lines 160-240 at the time of this authority). No prior Frozen authority named these 12 methods; this authority is the first to define them as a formal contract, prospectively, effective only after Freeze.",
  "methods": [
    {
      "name": "rebuildFresh",
      "exactSignature": "async rebuildFresh({ suiteId, postgresVersion, trackedMigrationCount, candidate: { path, sha256 } }) -> Promise<{ postgresVersion, serverVersionNum, trackedMigrationCount, candidateMigrationSha256, freshRebuild, environmentId }>",
      "arguments": {
        "suiteId": "string, one of \"suite-a\"|\"suite-b\"",
        "postgresVersion": "string, always \"17.6\"",
        "trackedMigrationCount": "integer, always 41",
        "candidate": {
          "path": "string, the frozen migration candidate repository-relative path",
          "sha256": "string, 64 lowercase hex"
        }
      },
      "returnShape": {
        "requiredKeys": [
          "postgresVersion",
          "serverVersionNum",
          "trackedMigrationCount",
          "candidateMigrationSha256",
          "freshRebuild",
          "environmentId"
        ],
        "additionalPropertiesAllowed": false
      },
      "nullability": "no field may be null or undefined; missing or mismatched fields cause the runner to throw a rebuild identity mismatch error",
      "callCount": "exactly once per suite (2 total for suite-a and suite-b)",
      "invocationOrder": "first call in the per-suite sequence, before generateFrozenDataset",
      "scope": "suite",
      "sessionLifetime": "not applicable; this call happens before any persistent track session opens",
      "backendLifetime": "not applicable",
      "pidIdentity": "not required at this call",
      "transactionBoundary": "the rebuild (41 tracked migrations, then the single candidate migration) is a schema-level operation; it is not itself a query transaction the runner observes",
      "idempotency": "not defined by Frozen authority; the adapter must ensure a fresh, isolated cluster/database exists for this suiteId every call, and must not reuse a prior suite's cluster/database",
      "reentrancy": "not required; the runner calls this exactly once per suiteId in a fixed sequential loop, never concurrently",
      "cancellationBehavior": "if interrupted, the adapter is responsible for leaving no partially-rebuilt cluster/database claiming freshRebuild:true",
      "cleanupOwnership": "adapter owns cleanup of any partial rebuild on failure; the runner has no rollback logic for this step",
      "throwFailureSemantics": "the adapter may throw; the runner does not catch this call specially and the error propagates to executeFormalSuites' outer try/catch, setting finalDisposition to FAIL",
      "runnerVerifiedFields": [
        "postgresVersion equals CONTRACT.postgresVersion",
        "serverVersionNum equals CONTRACT.serverVersionNum",
        "trackedMigrationCount equals 41",
        "candidateMigrationSha256 equals the frozen candidate sha256",
        "freshRebuild equals true"
      ],
      "adapterSelfVerifyOnlyFields": [
        "that the cluster/database is genuinely fresh and not reused from a prior suite or from baseline/candidate cross-contamination",
        "that the 41 migrations were applied in canonical repository order before the single candidate migration"
      ],
      "executionEntrypointResponsibility": [
        "supplying only a locally-resolved, exact-17.6, trusted PostgreSQL runtime to the adapter",
        "never supplying a Development or Production migration source"
      ]
    },
    {
      "name": "generateFrozenDataset",
      "exactSignature": "async generateFrozenDataset({ suiteId, generation, dataset }) -> Promise<{ semanticHash }>",
      "arguments": {
        "suiteId": "string",
        "generation": "object, the frozen generation/program specification loaded from baseAuthority",
        "dataset": "object, the frozen dataset scale specification loaded from baseAuthority"
      },
      "returnShape": {
        "requiredKeys": [
          "semanticHash"
        ],
        "additionalPropertiesAllowed": false
      },
      "nullability": "semanticHash must be present and must equal the frozen datasetSemanticHash bound in c01FormalRunner's CONTRACT",
      "callCount": "exactly once per suite",
      "invocationOrder": "second call in the per-suite sequence, immediately after rebuildFresh",
      "scope": "suite",
      "sessionLifetime": "not applicable",
      "backendLifetime": "not applicable",
      "pidIdentity": "not required at this call",
      "transactionBoundary": "dataset generation must complete and be committed before any case measurement begins",
      "idempotency": "must be deterministic: identical generation/dataset input must always produce the same semanticHash",
      "reentrancy": "not required; called once per suiteId",
      "cancellationBehavior": "on interruption, adapter must not leave a partially-generated dataset presented as complete",
      "cleanupOwnership": "adapter",
      "throwFailureSemantics": "adapter may throw; propagates uncaught to the outer try/catch",
      "runnerVerifiedFields": [
        "semanticHash equals CONTRACT.datasetSemanticHash"
      ],
      "adapterSelfVerifyOnlyFields": [
        "that generation followed the exact deterministic, counter-derived rule in baseAuthority with no random API"
      ],
      "executionEntrypointResponsibility": [
        "ensuring the same frozen generation/dataset specification is supplied to both baseline and candidate tracks so their semantic hashes match, per migrationAndDatasetIsolation"
      ]
    },
    {
      "name": "captureCatalog",
      "exactSignature": "async captureCatalog({ suiteId }) -> Promise<{ functionOwner, ownerRolsuper, ownerRolbypassrls, functionIdentityPass, returnShapePass, aclPass, rlsPass, indexesPass }>",
      "arguments": {
        "suiteId": "string"
      },
      "returnShape": {
        "requiredKeys": [
          "functionOwner",
          "ownerRolsuper",
          "ownerRolbypassrls",
          "functionIdentityPass",
          "returnShapePass",
          "aclPass",
          "rlsPass",
          "indexesPass"
        ],
        "additionalPropertiesAllowed": false
      },
      "nullability": "functionOwner must equal the frozen direct-inner owner name; the five *Pass fields must be boolean true; ownerRolsuper/ownerRolbypassrls must be boolean false",
      "callCount": "exactly once per suite",
      "invocationOrder": "third call in the per-suite sequence, immediately after generateFrozenDataset",
      "scope": "suite",
      "sessionLifetime": "not applicable",
      "backendLifetime": "not applicable",
      "pidIdentity": "not required at this call",
      "transactionBoundary": "catalog read must reflect the post-rebuild, post-dataset-generation schema state",
      "idempotency": "read-only; may be called again by the execution entrypoint for diagnostics without side effects",
      "reentrancy": "safe to call repeatedly; read-only",
      "cancellationBehavior": "not applicable; read-only",
      "cleanupOwnership": "not applicable",
      "throwFailureSemantics": "adapter may throw; propagates uncaught",
      "runnerVerifiedFields": [
        "functionOwner equals the frozen direct-inner owner",
        "ownerRolsuper === false",
        "ownerRolbypassrls === false",
        "functionIdentityPass, returnShapePass, aclPass, rlsPass, indexesPass all === true"
      ],
      "adapterSelfVerifyOnlyFields": [
        "that the underlying pg_proc/pg_get_function_* catalog reads used to compute these booleans are themselves accurate"
      ],
      "executionEntrypointResponsibility": []
    },
    {
      "name": "runPrechecks",
      "exactSignature": "async runPrechecks({ suiteId, count, cases, actors, catalog }) -> Promise<Array<{ precheckId, passed }>>",
      "arguments": {
        "suiteId": "string",
        "count": "integer, always 29",
        "cases": "array, the 35 frozen case definitions",
        "actors": "array, the 9 frozen actor definitions",
        "catalog": "object, the return value of captureCatalog"
      },
      "returnShape": {
        "kind": "array",
        "length": 29,
        "itemRequiredKeys": [
          "precheckId",
          "passed"
        ],
        "itemAdditionalPropertiesAllowed": true
      },
      "nullability": "each precheckId must equal the exact string PRE-01 through PRE-29 in index order; each passed must be boolean true",
      "callCount": "exactly once per suite",
      "invocationOrder": "fourth call in the per-suite sequence, immediately after captureCatalog",
      "scope": "suite",
      "sessionLifetime": "not applicable",
      "backendLifetime": "not applicable",
      "pidIdentity": "not required at this call",
      "transactionBoundary": "prechecks are read-only security/semantic assertions against the rebuilt schema and generated dataset",
      "idempotency": "read-only, safe to repeat",
      "reentrancy": "safe",
      "cancellationBehavior": "not applicable",
      "cleanupOwnership": "not applicable",
      "throwFailureSemantics": "adapter may throw; propagates uncaught; the runner separately throws if the returned array is not exactly 29 items in exact PRE-01..PRE-29 order with passed:true",
      "runnerVerifiedFields": [
        "array length === 29",
        "precheckId sequence exact and unreordered",
        "every passed === true"
      ],
      "adapterSelfVerifyOnlyFields": [
        "the substantive security/semantic content each precheck actually tests"
      ],
      "executionEntrypointResponsibility": []
    },
    {
      "name": "measureOuterAuthorization",
      "exactSignature": "async measureOuterAuthorization({ suiteId, caseDefinition }) -> Promise<{ rowCount, rowCountPass, payloadSemanticsPass, authorizationPass }>",
      "arguments": {
        "suiteId": "string",
        "caseDefinition": "object, one of the 35 frozen case definitions, in caseId order"
      },
      "returnShape": {
        "requiredKeys": [
          "rowCount",
          "rowCountPass",
          "payloadSemanticsPass",
          "authorizationPass"
        ],
        "additionalPropertiesAllowed": false
      },
      "nullability": "rowCount must equal caseDefinition.expectedRows exactly; the three *Pass fields must be boolean true",
      "callCount": "exactly once per case per suite (35 times per suite)",
      "invocationOrder": "first action for each case, in caseId order, before the outer/inner track loop for that case",
      "scope": "case",
      "sessionLifetime": "not applicable; this is the outer SECURITY DEFINER call path measured independently of the persistent track sessions",
      "backendLifetime": "not applicable",
      "pidIdentity": "not required at this call",
      "transactionBoundary": "one complete outer-authorization invocation per case",
      "idempotency": "not required to be idempotent across calls since it reflects a live authorization check, but must be deterministic for a fixed caseDefinition and unchanged dataset",
      "reentrancy": "safe within a suite's sequential case loop; never called concurrently",
      "cancellationBehavior": "on interruption mid-call, no track evidence for that case may be reported",
      "cleanupOwnership": "adapter",
      "throwFailureSemantics": "adapter may throw; propagates uncaught; runner separately throws \"outer authorization failed\" if any of the four checked fields mismatches",
      "runnerVerifiedFields": [
        "rowCount === caseDefinition.expectedRows",
        "rowCountPass === true",
        "payloadSemanticsPass === true",
        "authorizationPass === true"
      ],
      "adapterSelfVerifyOnlyFields": [
        "the substantive row-level payload content beyond row count"
      ],
      "executionEntrypointResponsibility": []
    },
    {
      "name": "restartForTrack",
      "exactSignature": "async restartForTrack({ suiteId, caseDefinition, trackKind, sequence }) -> Promise<void>",
      "arguments": {
        "suiteId": "string",
        "caseDefinition": "object",
        "trackKind": "string, one of \"outer-security-definer\"|\"secure-direct-inner\"",
        "sequence": "array, always [\"CHECKPOINT\",\"clean-stop\",\"port-closed-proof\",\"restart\"]"
      },
      "returnShape": {
        "kind": "void",
        "note": "the immutable formal runner does not read this call's return value at all"
      },
      "nullability": "not applicable; no return value is validated",
      "callCount": "once per required track per case (0, 1, or 2 times per case, depending on outerEvidenceRequired/innerEvidenceRequired)",
      "invocationOrder": "first action inside each required track's evaluation, before openPersistentTrack",
      "scope": "track",
      "sessionLifetime": "must fully complete a checkpoint, clean stop, port-closed proof, and restart before returning; no persistent session exists yet when this is called",
      "backendLifetime": "no backend is open during this call; any prior backend for this cluster must be fully stopped",
      "pidIdentity": "not applicable to this call itself; establishes the precondition for a fresh postmaster PID after restart",
      "transactionBoundary": "not applicable; this is a process-lifecycle operation, not a SQL transaction",
      "idempotency": "must be safe to be the only restart performed for this exact track; must not be skipped even though the runner ignores the return value",
      "reentrancy": "not required; called once per track per case in the fixed sequential loop",
      "cancellationBehavior": "if the checkpoint, clean stop, port-closed proof, or restart cannot be completed, the adapter MUST throw; silently returning as if this succeeded is prohibited even though the runner does not read the return value",
      "cleanupOwnership": "adapter; a failed restart must not leave the cluster in a state where a subsequent openPersistentTrack could silently reuse a stale backend",
      "throwFailureSemantics": "adapter MUST throw on any failure to complete the CHECKPOINT / clean-stop / port-closed-proof / restart sequence; this requirement exists independently of the runner not reading the return value, and is an execution-entrypoint-enforced requirement (see responsibilityBoundaries.executionCli)",
      "runnerVerifiedFields": [],
      "adapterSelfVerifyOnlyFields": [
        "that CHECKPOINT actually completed",
        "that the postmaster actually stopped cleanly",
        "that the listening port/socket is actually closed before restart",
        "that the restarted postmaster is a genuinely new process, not a reused one"
      ],
      "executionEntrypointResponsibility": [
        "treating an adapter that returns normally from restartForTrack without having genuinely restarted as an execution-integrity failure, since the runner itself cannot detect this"
      ]
    },
    {
      "name": "openPersistentTrack",
      "exactSignature": "async openPersistentTrack({ suiteId, caseDefinition, trackKind, executionRole }) -> Promise<{ identity: { backendPid, sessionId, sessionUser, currentUser, executionRole, rolsuper, rolbypassrls, rowSecurityOn, tenantPredicateEffective } }>",
      "arguments": {
        "suiteId": "string",
        "caseDefinition": "object",
        "trackKind": "string",
        "executionRole": "string, the direct-inner owner name when trackKind is secure-direct-inner, otherwise undefined"
      },
      "returnShape": {
        "requiredKeys": [
          "identity"
        ],
        "identity": {
          "requiredKeys": [
            "backendPid",
            "sessionId",
            "sessionUser",
            "currentUser",
            "executionRole",
            "rolsuper",
            "rolbypassrls",
            "rowSecurityOn",
            "tenantPredicateEffective"
          ],
          "additionalPropertiesAllowed": false
        }
      },
      "nullability": "backendPid must be a positive integer; sessionId must be a non-empty string; rowSecurityOn and tenantPredicateEffective must be boolean true; for secure-direct-inner, executionRole/currentUser must equal the direct-inner owner and rolsuper/rolbypassrls must both be false",
      "callCount": "exactly once per required track per case",
      "invocationOrder": "immediately after restartForTrack for the same track",
      "scope": "track",
      "sessionLifetime": "the returned session/backend must persist unchanged for the entire remainder of this track's evaluation: 1 cold + 2 warm-up + 7 measured measureExplain calls, plus the isolation-proof step if applicable",
      "backendLifetime": "one backend PID for the whole track; no reconnect permitted",
      "pidIdentity": "backendPid established here is the single authoritative PID for every subsequent measureExplain call in this track",
      "transactionBoundary": "opens the persistent session/connection this track will use; does not itself run a measurement",
      "idempotency": "not applicable; each call must open a genuinely new session",
      "reentrancy": "not required; called once per track per case",
      "cancellationBehavior": "if the session cannot be opened with the required identity proofs, the adapter must throw rather than return an incomplete identity object",
      "cleanupOwnership": "adapter must ensure this session is eventually closed via close(session)",
      "throwFailureSemantics": "adapter may throw; propagates uncaught",
      "runnerVerifiedFields": [
        "identity has exactly the 9 keys, no more, no fewer",
        "backendPid integer >= 1",
        "sessionId non-empty string",
        "rowSecurityOn === true",
        "tenantPredicateEffective === true",
        "for secure-direct-inner: executionRole/currentUser equal the frozen direct-inner owner and rolsuper/rolbypassrls both false",
        "for outer-security-definer: executionRole is not the literal string postgres"
      ],
      "adapterSelfVerifyOnlyFields": [
        "that sessionUser and currentUser genuinely reflect the connected role, not a caller-supplied claim"
      ],
      "executionEntrypointResponsibility": [
        "never supplying a superuser or BYPASSRLS role as executionRole for the secure-direct-inner track"
      ]
    },
    {
      "name": "measureExplain",
      "exactSignature": "async measureExplain({ suiteId, caseDefinition, trackKind, session, sequenceLabel, explainOptions }) -> Promise<{ backendPid, sessionId, explainJson, clientWallTimeMs }>",
      "arguments": {
        "suiteId": "string",
        "caseDefinition": "object",
        "trackKind": "string",
        "session": "the object returned by openPersistentTrack for this track",
        "sequenceLabel": "string, one of cold|warm-up-1|warm-up-2|measured-1..measured-7",
        "explainOptions": "array, always [\"ANALYZE\",\"BUFFERS\",\"VERBOSE\",\"FORMAT JSON\"]"
      },
      "returnShape": {
        "requiredKeys": [
          "backendPid",
          "sessionId",
          "explainJson",
          "clientWallTimeMs"
        ],
        "additionalPropertiesAllowed": true
      },
      "nullability": "backendPid/sessionId must equal the same track's session.identity values on every call; explainJson must be a one-element PostgreSQL FORMAT JSON array with a Plan object; clientWallTimeMs must be a finite non-negative number",
      "callCount": "exactly 10 times per track (1 cold + 2 warm-up + 7 measured)",
      "invocationOrder": "cold first, then warm-up-1, warm-up-2 in order, then measured-1 through measured-7 in order; no reordering permitted",
      "scope": "run (one call per sequenceLabel within a track)",
      "sessionLifetime": "must reuse the exact same session/backend across all 10 calls in this track",
      "backendLifetime": "must reuse the exact same backendPid across all 10 calls in this track",
      "pidIdentity": "every returned backendPid/sessionId must equal session.identity.backendPid/sessionId; a mismatch is a formal failure",
      "transactionBoundary": "one EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT JSON) statement per call, in the persistent session",
      "idempotency": "not idempotent by nature (each call measures a live statement execution); repeated calls with the same sequenceLabel are not permitted by the runner's fixed sequence",
      "reentrancy": "not required; sequential calls only within a track",
      "cancellationBehavior": "an incomplete or failed EXPLAIN must throw rather than return partial/fabricated fields",
      "cleanupOwnership": "adapter must not leave the session in a broken state that could affect subsequent calls in the same track",
      "throwFailureSemantics": "adapter may throw; propagates uncaught; the runner separately throws if backendPid/sessionId differ from session.identity",
      "runnerVerifiedFields": [
        "backendPid === session.identity.backendPid",
        "sessionId === session.identity.sessionId",
        "explainJson structural validity (array length 1, object[0].Plan present, required buffer/timing fields finite and non-negative)"
      ],
      "adapterSelfVerifyOnlyFields": [
        "that explainJson is the actual, complete PostgreSQL EXPLAIN output for this statement and this sequenceLabel, not a cached or substituted prior result"
      ],
      "executionEntrypointResponsibility": [
        "computing rawExplainTextSha256 from the pre-parse text this method's underlying query produced, per rawHashingSemantics, since this contract's return value (explainJson) is already a parsed structure by the time the runner sees it"
      ]
    },
    {
      "name": "openSecondFreshBackend",
      "exactSignature": "async openSecondFreshBackend({ suiteId, caseDefinition, trackKind, firstBackendPid }) -> Promise<{ sessionIdentity, executionSharedHitBlocks }>",
      "arguments": {
        "suiteId": "string",
        "caseDefinition": "object",
        "trackKind": "string",
        "firstBackendPid": "integer, the track's primary session backendPid"
      },
      "returnShape": {
        "requiredKeys": [
          "sessionIdentity",
          "executionSharedHitBlocks"
        ],
        "additionalPropertiesAllowed": false,
        "sessionIdentity": {
          "requiredKeys": [
            "backendPid",
            "sessionId",
            "sessionUser",
            "currentUser",
            "executionRole",
            "rolsuper",
            "rolbypassrls",
            "rowSecurityOn",
            "tenantPredicateEffective"
          ],
          "additionalPropertiesAllowed": false
        }
      },
      "nullability": "sessionIdentity.backendPid and sessionIdentity.sessionId must both differ from the track's primary session; executionSharedHitBlocks must be a finite non-negative number",
      "callCount": "exactly once per track per case",
      "invocationOrder": "immediately after the 10 measureExplain calls for the same track",
      "scope": "track",
      "sessionLifetime": "a genuinely new, separate connection/session, opened after the primary track session already exists; not required to persist beyond this single measurement",
      "backendLifetime": "a genuinely new backend PID, distinct from the primary track's backend PID for the entire lifetime of this call",
      "pidIdentity": "must be a real, distinct operating-system-level PostgreSQL backend process; the adapter must not satisfy this by returning a different literal integer for the same underlying connection",
      "transactionBoundary": "one measurement (the equivalent case statement re-executed once from a fresh connection) inside this new backend",
      "idempotency": "not idempotent; a fresh connection is required every call",
      "reentrancy": "not required; called once per track per case",
      "cancellationBehavior": "must throw rather than return a fabricated or reused-connection result if a genuinely fresh backend cannot be opened",
      "cleanupOwnership": "adapter must close this second connection (via close(session) or equivalent internal cleanup) once the measurement is captured",
      "throwFailureSemantics": "adapter may throw; propagates uncaught; the runner separately throws \"second fresh backend proof incomplete\" or \"second backend is not fresh\" if the shape or distinctness checks fail",
      "runnerVerifiedFields": [
        "sessionIdentity has exactly the 9 identity keys and passes the same secure-identity checks as the primary session",
        "executionSharedHitBlocks is finite and non-negative",
        "sessionIdentity.backendPid !== primary session backendPid",
        "sessionIdentity.sessionId !== primary session sessionId"
      ],
      "adapterSelfVerifyOnlyFields": [
        "that the second backend is an actual distinct OS-level PostgreSQL process and not merely a different in-memory object wrapping the same connection or a caller-supplied distinct integer"
      ],
      "executionEntrypointResponsibility": [
        "rejecting an adapter implementation, at design/review time, that could satisfy backendPid/sessionId distinctness without opening a real second connection"
      ]
    },
    {
      "name": "buildIsolationProof",
      "exactSignature": "async buildIsolationProof({ suiteId, caseDefinition, trackKind, node, outerAuthorization, catalog }) -> Promise<object>",
      "arguments": {
        "suiteId": "string",
        "caseDefinition": "object",
        "trackKind": "string",
        "node": "object, one raw plan-node descriptor with actualRows === 0",
        "outerAuthorization": "object, the return value of measureOuterAuthorization for this case",
        "catalog": "object, the return value of captureCatalog"
      },
      "returnShape": {
        "note": "must conform to the 16-key isolation proof structure already defined in the existing Frozen reauthorizationAuthority (estimateRatioClassifications.isolationProof.requiredFields), unchanged by this authority",
        "requiredKeyCount": 16
      },
      "nullability": "every one of the 16 fields is required; the actualRows field must be exactly 0; the isolation-proof completeness determination is made by the existing, unchanged evidence-validator's proofComplete function, not by this adapter's own claim",
      "callCount": "once per plan node with actualRows === 0 found across all runs in this track (zero or more times per track)",
      "invocationOrder": "after all 10 measureExplain calls and after openSecondFreshBackend, once per qualifying zero-actual-row node",
      "scope": "plan node within a track",
      "sessionLifetime": "not applicable; this call assembles evidence, most of it referencing frozen dataset facts rather than opening new sessions, though it may read current session/catalog state passed in",
      "backendLifetime": "not applicable beyond what session/catalog already captured",
      "pidIdentity": "not newly established here; reuses identity already captured by openPersistentTrack",
      "transactionBoundary": "not applicable; assembles a proof object from already-captured facts",
      "idempotency": "must be deterministic for the same node/outerAuthorization/catalog input",
      "reentrancy": "safe; called independently once per qualifying node",
      "cancellationBehavior": "if a required proof field cannot be established, the adapter must omit or falsify nothing and instead return a proof that will legitimately fail the existing proofComplete check, or throw",
      "cleanupOwnership": "not applicable",
      "throwFailureSemantics": "adapter may throw; propagates uncaught",
      "runnerVerifiedFields": [
        "the returned proof is passed unchanged to the existing, unmodified proofComplete function from the existing evidence validator; the runner itself does not separately re-check the 16 fields"
      ],
      "adapterSelfVerifyOnlyFields": [
        "that every referenced fact (actor, tenant, branch, claims, predicate) is drawn from the actual live session/catalog state, not copied from a fixture"
      ],
      "executionEntrypointResponsibility": [
        "never substituting a hard-coded fixture proof (such as the existing evidence validator's addValidIsolationProof helper, which exists only for that module's own self-test) for a formal-mode execution result"
      ]
    },
    {
      "name": "measureDiscardPlansSequence",
      "exactSignature": "async measureDiscardPlansSequence({ suiteId, expectedSteps }) -> Promise<Array<{ step, executionSharedHitBlocks }>>",
      "arguments": {
        "suiteId": "string",
        "expectedSteps": "array, always [\"before-discard\",\"first-after-discard-plans\",\"second-after-discard-plans\"]"
      },
      "returnShape": {
        "kind": "array",
        "length": 3,
        "itemRequiredKeys": [
          "step",
          "executionSharedHitBlocks"
        ]
      },
      "nullability": "step values must exactly match expectedSteps in order; executionSharedHitBlocks must be a finite non-negative number for each of the 3 entries",
      "callCount": "exactly once per suite",
      "invocationOrder": "last adapter call in the per-suite sequence, after all 35 cases have been processed",
      "scope": "suite",
      "sessionLifetime": "must use one session across the before/DISCARD PLANS/after sequence to produce a coherent shared-hit measurement",
      "backendLifetime": "single backend for this measurement",
      "pidIdentity": "not cross-checked against any other track's PID by the runner",
      "transactionBoundary": "before-discard measurement, then DISCARD PLANS, then two after-discard measurements, in the same session",
      "idempotency": "not idempotent; reflects live plan-cache state",
      "reentrancy": "not required; called once per suite",
      "cancellationBehavior": "must throw rather than return a partial 3-step sequence",
      "cleanupOwnership": "adapter",
      "throwFailureSemantics": "adapter may throw; propagates uncaught; the runner's validateDiscardSequence separately throws if the actual values are not exactly [52, 842, 52]",
      "runnerVerifiedFields": [
        "step sequence exact and unreordered",
        "the exact numeric values [52, 842, 52]"
      ],
      "mandatoryHonestMeasurementRule": "The values 52, 842, and 52 are the specific numbers already recorded in the existing, unchanged diagnosisProvenance from a prior investigation. The adapter must return its own actually-measured executionSharedHitBlocks values from a real DISCARD PLANS sequence on this suite's real session. If the real measured values differ from [52, 842, 52], the suite MUST fail via the existing runner's validateDiscardSequence check; the adapter, the execution CLI, and the execution provenance module are all prohibited from overwriting, rounding, or substituting a measured value to force a match. A mismatch is an execution-enablement finding to be reported to the next independent D2 reviewer, not silently corrected.",
      "adapterSelfVerifyOnlyFields": [
        "that DISCARD PLANS was genuinely issued in the same backend between the before and after measurements"
      ],
      "executionEntrypointResponsibility": []
    },
    {
      "name": "close",
      "exactSignature": "async close(session) -> Promise<void>  |  async close() -> Promise<void>",
      "arguments": {
        "session": "optional; the object returned by openPersistentTrack, or omitted"
      },
      "returnShape": {
        "kind": "void"
      },
      "nullability": "not applicable",
      "callCount": "once per track per case when called with a session argument (up to 70 times per suite: 35 cases times up to 2 tracks), plus exactly once with no argument at the very end of executeFormalSuites regardless of success or failure",
      "invocationOrder": "per-track calls happen immediately after that track's evaluation completes; the no-argument call happens last, inside the existing runner's finally block",
      "scope": "close(session) scope is track; close() scope is suite-run-wide",
      "sessionLifetime": "close(session) ends exactly the one persistent backend/session identified by session; it must not close any other track's session",
      "backendLifetime": "close(session) terminates exactly one backend PID; close() with no argument performs final cleanup of any remaining runtime-owned resources (any lingering connections, the isolated PostgreSQL runtime process(es), and any temporary runtime root), without touching Repository files or any pre-existing user PostgreSQL installation",
      "pidIdentity": "close(session) must target only session's own backendPid",
      "transactionBoundary": "not applicable; connection/process teardown only",
      "idempotency": "close must be idempotent: calling close(session) or close() more than once, or calling close() after some or all close(session) calls already ran, must not throw and must not attempt to close an already-closed resource unsafely",
      "reentrancy": "must be safe to call from a failure path (the existing runner's catch/finally) even if a prior close call already ran or partially failed",
      "cancellationBehavior": "on interruption (SIGINT/SIGTERM) reaching the execution CLI, close() must still be invoked and complete cleanup before process exit",
      "cleanupOwnership": "close(session) is the adapter's own per-track cleanup; close() is the adapter's full-run cleanup of every resource it opened, including the isolated PostgreSQL runtime process where responsibilityBoundaries.postgresRuntime does not already own that specific step",
      "throwFailureSemantics": "close should not throw for an already-cleaned-up resource (idempotency requirement above); it may throw for a genuine failure to release a resource, and such a throw must not be silently swallowed by the execution CLI",
      "runnerVerifiedFields": [],
      "adapterSelfVerifyOnlyFields": [
        "that every session opened by openPersistentTrack and openSecondFreshBackend across the entire run has been closed by the time close() with no argument returns"
      ],
      "executionEntrypointResponsibility": [
        "ensuring close() is reached on every code path, including uncaught adapter errors and process signals, per responsibilityBoundaries.executionCli"
      ]
    }
  ],
  "orderingSummaryAcrossASuite": [
    "rebuildFresh",
    "generateFrozenDataset",
    "captureCatalog",
    "runPrechecks",
    "for each of 35 cases in caseId order: measureOuterAuthorization, then for each required track (outer, inner): restartForTrack, openPersistentTrack, measureExplain x10 (cold, warm-up-1, warm-up-2, measured-1..7), openSecondFreshBackend, buildIsolationProof (zero or more times), close(session)",
    "measureDiscardPlansSequence",
    "close() with no argument, always, in the finally block, once per full executeFormalSuites invocation"
  ],
  "exactCaseAndProfileOrderRestoration": {
    "source": "unchanged, existing c01FormalRunner CASE_IDS and PROFILE_IDS exports, and the unchanged baseAuthority cases/thresholdProfiles",
    "caseIds": [
      "C01","C02","R01","R02","B01","B02","M01","M02","K01","K02","I01","I02","I03","J01","J02","J03","N01","N02","N03","D01","D02","D03","D04","D05","D06","D07","D08","D09","D10","P01","P02","P03","P04","P05","P06"
    ],
    "profileIds": [
      "accessTypical","accessWorst","smallTypical","smallWorst","itemsWorst","branchItemsWorst","nutritionWorst","denial","pageDiagnostic"
    ],
    "precheckCount": 29,
    "reorderingProhibited": "This authority does not reorder, add, or remove any case, profile, or precheck. Their exact order is restored unchanged from the existing Frozen c01FormalRunner and baseAuthority; the future postgresAdapter must consume them via loadFrozenMatrix, not a locally redefined list."
  }
}
```

Specific clarified rules:

- `restartForTrack` must throw if it cannot complete `CHECKPOINT`, clean stop, port-closed proof, and restart, even though the existing formal runner never reads this call's return value.
- `close(session)` closes exactly the one persistent backend identified by `session`, and only that one.
- `close()` with no argument performs all remaining final cleanup for the entire run.
- `close` must be idempotent and safe to call again on a failure path.
- The second fresh backend opened by `openSecondFreshBackend` must be a genuinely new, distinct operating-system-level PostgreSQL connection — returning a different literal PID/session-id integer for what is otherwise the same underlying connection does not satisfy this requirement.
- No adapter method may return a hard-coded fixture value in place of a formal, live-measured result.
- `measureDiscardPlansSequence`'s three values must come only from an actual measurement. If the real measured values differ from the diagnosis-derived `52 / 842 / 52`, the suite must FAIL via the existing runner's `validateDiscardSequence`; overwriting or manually supplying a matching value is prohibited.
- The exact 35 case IDs, 9 profile IDs, and 29 precheck IDs are restored unchanged from the existing Frozen formal runner and base authority — this candidate does not reorder them; see `exactCaseAndProfileOrderRestoration` in the fenced block above for the complete, exact, ordered lists.

## Responsibility boundaries

- **Formal runner** (unchanged): orchestration, ordering, classification, aggregation, existing structural invariants, existing evidence object. Opens no connection, manages no cluster, writes no file.
- **PostgreSQL runtime** (future): trusted binary resolution, exact version verification, `initdb`/`pg_ctl`/`postgres` process lifecycle, isolated runtime root, temporary cluster ownership, PID tracking, stale-process detection, signal-safe stop, cleanup verification. Accepts no connection string. Never connects to Development or Production.
- **PostgreSQL adapter** (future): `pg` connection, the 12 methods, persistent backend/session, SQL execution, identity validation, migrations, deterministic dataset generation, catalog/prechecks, EXPLAIN capture, raw observation return. Does not decide final PASS. Does not write final evidence directly.
- **Execution provenance** (future): raw-bytes hashing, manifest generation, formal/synthetic distinction, bundle validation, path containment, atomic output, artifact SHA binding.
- **Execution CLI** (future): argument parsing, trusted runtime construction, local-only enforcement, adapter construction, formal-runner invocation, existing evidence validator invocation, new provenance validator invocation, signal handling, final cleanup, exit codes, evidence bundle output.

## Local-only and credential model

No full connection string, `DATABASE_URL`, Supabase URL, hostname, DNS target, or arbitrary TCP remote target is accepted. No Development or Production endpoint is accepted. No password, JWT, anon key, or service-role key is accepted. `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, and `PGSERVICE` are never inherited from the ambient environment; the execution CLI uses a sanitized environment. The cluster is created and owned by this execution runtime. The PostgreSQL executable comes from an explicit trusted binary directory, must be a regular file (never a symlink), and must be exact version 17.6. Database, cluster, PID, and data-directory identity are bound to this suite's identity; baseline and candidate never share cluster, database, session, backend, or PID.

**Transport is Unix domain socket only**, bound under a runtime-owned, freshly created, mode-0700 temporary directory. Loopback TCP is not an authorized alternative and is not left to implementation choice — a loopback TCP port can be reached via a forwarded remote tunnel in a way a runtime-owned Unix socket path cannot, so this authority decides the transport exclusively rather than deferring it. No arbitrary pre-existing local PostgreSQL service may be treated as this suite's isolated instance, and a loopback port-forward must never be treated as a local isolated PostgreSQL. Shell string execution is prohibited; every subprocess invocation uses an argument array; command substitution is prohibited. Cleanup acts only on the exact runtime-created, ownership-verified path for this run, and must never touch the Repository, a user's pre-existing PostgreSQL data, or any process/container this run did not itself create.

## Migration and dataset isolation

**Baseline track**: a fresh, isolated cluster/database; exactly the 41 existing tracked migrations, in Repository canonical order; the migration candidate is not applied; every migration path and SHA-256 is recorded in the manifest.

**Candidate track**: a distinct fresh, isolated cluster/database; the same 41 tracked migrations in the same order, then the single migration candidate (`supabase/migrations/20260722010000_cache_restaurant_current_access_context_plan.sql`, SHA-256 `4e08de96d28a5e6d9911b074fa73769ea5b3e21d9e14a089c7f420e16a4fbe72`), which is neither modified nor staged.

**Both tracks**: use the identical Frozen deterministic dataset specification and must produce the same dataset semantic hash. Database, cluster, session, backend, and PID never collide between baseline and candidate. Cloning a running baseline database as a candidate shortcut is prohibited. Any migration count, order, or SHA mismatch fails closed.

## Raw EXPLAIN hashing — two distinct hashes

Neither the existing formal runner nor the existing evidence schema is modified.

**A. Existing evidence `explainSha256`** retains its existing definition: `SHA-256(UTF-8 bytes of JSON.stringify(explainJson))`, exactly as already implemented in the existing runner's `extractExplainObservation`. It remains compatible with the existing runner/validator and proves internal JSON-object/derived-field consistency. It must not be described as a hash of PostgreSQL wire bytes, and must not alone be used as proof of live execution.

**B. New provenance `rawExplainTextSha256`** is newly defined: the SHA-256 of the exact byte sequence `Buffer.from(rawExplainText, "utf8")` produces, where `rawExplainText` is the unparsed text value PostgreSQL's `EXPLAIN (... FORMAT JSON)` result field returns via a custom `pg` text parser — computed before any `JSON.parse` of that text. `server_encoding` and `client_encoding` must both be UTF8 for the connection, verified before any measurement. No trimming, pretty-printing, key-sorting, or other normalization/reserialization occurs before hashing. This exact byte sequence must be written verbatim into a raw observation file inside the formal evidence bundle, then re-read and re-hashed to verify the write. It does not include PostgreSQL wire framing and must not be called a raw network packet hash.

The execution manifest must record the complete binding chain: `rawExplainTextSha256` → the parsed `explainJson` derived from it → the existing `explainSha256` computed from that same `explainJson` → the final evidence artifact's own SHA-256. Every link must be independently recomputable from the stored raw files.

## Formal evidence provenance model

The existing evidence schema and validator are unchanged. New: an execution-manifest schema and a provenance validator. A formal PASS requires **all ten** of: existing evidence schema PASS; existing evidence validator PASS; execution manifest schema PASS; provenance validator PASS; exact PostgreSQL 17.6 runtime identity PASS; every raw observation file SHA PASS; adapter/CLI/runtime/provenance module SHA binding PASS; baseline/candidate cluster and dataset isolation PASS; the manifest's `synthetic` boolean equal to `false`; the manifest's execution mode equal to `FORMAL_LIVE`.

The manifest records at least: manifest version, evidence kind, `synthetic` boolean, suite IDs, execution start/end timestamps, Repository HEAD, branch, Frozen authority SHAs, implementation artifact SHAs, PostgreSQL executable paths and SHA, exact PostgreSQL version and `serverVersionNum`, cluster IDs, database IDs, data-directory identity hashes, postmaster PIDs, backend PIDs, session IDs, environment IDs, migration path/order/SHA inventory, dataset semantic hash, raw observation relative paths and SHA, existing evidence path and SHA, candidate migration path and SHA, `developmentTouched=false`, `productionTouched=false`, cleanup status, interruption status, final disposition.

The formal validator must reject: `SYNTHETIC_SELF_TEST`; `synthetic:true`; existing evidence with no accompanying manifest; a mock/fixture producer; missing raw files; hash mismatch; timestamp/order mismatch; implementation SHA mismatch; runtime identity mismatch; cluster/backend/session collision; artificial PASS evidence lacking full formal bundle provenance.

**Assurance boundary, stated honestly**: the manifest and hash chain can verify internal integrity, source-flow consistency, and cross-artifact consistency. They cannot provide unforgeable remote attestation against a malicious operator with full local administrative control who can fabricate arbitrary processes and files. Formal acceptance still requires an independent reviewer to confirm the actual execution command, runtime identity, complete output hashes, and cleanup result. Neither a local self-signed timestamp nor a locally generated ephemeral key may be claimed, alone, as proof of genuine PostgreSQL execution.

## Synthetic self-test policy

Self-tests must not start PostgreSQL, create a cluster/database/container, open a network socket, connect to any remote, or use credentials. Self-tests may import the real adapter module and may use dependency injection to exercise the real adapter's pure validation logic. Any fake transport must be explicitly marked synthetic. Synthetic output must never be written as a formal evidence bundle. The existing `positiveFixture()` passing means only a structural-fixture PASS; the existing validator passing alone does not mean a formal execution PASS. The formal CLI must not accept a fixture adapter. Self-test mode must contain no hidden flag that switches to a real connection.

## Failure semantics

Missing evidence, an invalid or non-finite metric, missing identity/security proof, an inventory or hash mismatch, an unauthorized change, a manifest/provenance mismatch, the wrong PostgreSQL version (including 17.9/17.10 masquerading as 17.6), and a DISCARD PLANS measurement mismatch all FAIL, and none may be silently corrected. This candidate permits no execution implementation, no PostgreSQL 17.6 acquisition, no formal suite, no Freeze, and no retrospective PASS.

## Independent Review and Freeze

Independent D2 review and Freeze of this exact candidate are required before any of the eight future paths may be created or modified, before PostgreSQL 17.6 may be acquired, and before the formal suite may run.

**Current/pre-Freeze next permitted action**: `independent-d2-review`. The only permitted next step immediately after this correction is a new, read-only Independent D2 review of this exact candidate. No execution implementation authorization exists before that review reaches a READY FOR FREEZE verdict and this candidate is then Frozen.

**Post-Freeze next permitted action**: `execution-enablement-implementation-per-authorizedFuturePaths`. Only after this exact candidate is independently reviewed as READY FOR FREEZE and then Frozen may implementation begin — and only for exactly the eight `authorizedFuturePaths` above and the narrow `pg` dependency exception in `dependencyException`. Freeze grants no broader implementation authorization than that.

These two are distinct and must never be described by a single ambiguous sentence: the current/pre-Freeze action is review; the post-Freeze action is implementation of exactly the eight paths. This correction itself does not authorize implementation, does not Freeze anything, and does not retroactively change any existing Frozen, PASS, or BLOCKED result.

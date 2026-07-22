# P2V-PERF-001B C01 Contract Reauthorization Candidate

Status: **candidate for independent review; not Frozen; implementation not authorized**

The normative machine authority is `restaurant-performance-p2v-perf-001b-c01-contract-reauthorization-authority.json`, authority `P2V-PERF-001B-C01-CONTRACT-REAUTHORIZATION-CANDIDATE-1`, schema version 1. The sanitized source record is `restaurant-performance-p2v-perf-001b-c01-diagnosis-provenance.json`.

The exact candidate inventory is:

1. `docs/runtime-integration-phase-2v-e/restaurant-performance-p2v-perf-001b-c01-contract-reauthorization-authority.json`
2. `docs/runtime-integration-phase-2v-e/restaurant-performance-p2v-perf-001b-c01-contract-reauthorization.md`
3. `docs/runtime-integration-phase-2v-e/restaurant-performance-p2v-perf-001b-c01-diagnosis-provenance.json`
4. `scripts/restaurant-performance-p2v-perf-001b-c01-contract-reauthorization-guard.mjs`

This is a supplemental, prospective reauthorization. It does not modify, rewrite, or silently weaken an existing Frozen authority. Only after this exact candidate completes independent review and is Frozen does it supersede the narrow measurement clauses named below. `noRetroactivePass = true`: the existing BLOCKED suite remains BLOCKED, and creation of these files is not PASS evidence. After Freeze, both fresh formal suites must be rerun against the same migration candidate SHA `4e08de96d28a5e6d9911b074fa73769ea5b3e21d9e14a089c7f420e16a4fbe72`.

## Frozen source composition

The parent Frozen HEAD is `a6394ac32702c301016b5cbdef9f03d49a109ea0`, with parent `3c36c5c64d6b02b8da807f5715d67065ba3f7de6`. The migration candidate remains `supabase/migrations/20260722010000_cache_restaurant_current_access_context_plan.sql`. All three remediation artifacts and all nine base/plan/dataset artifacts remain bound by the exact paths and SHA-256 values in the machine authority.

The diagnosis sources have SHA-256 `73e749c1fb67a85e735cc4d44d444a3f4c7ec4c479d482e7cbbae8d516894fb2` and `96eda96fef9b287284b98db2fe644e08996af39d9f032bfd48c1e9b23c1724cd`. The Frozen dataset semantic hash remains `3e5dc3180770097f389a0a9d668a33f3bd0f1a6df43bcbc114b5fb88127eedc2`.

## Re-derived diagnosis

Both candidate suites recorded 1,224 shared hits on cold-first-session and 52 shared hits on every one of seven measured warm runs. A second fresh backend in each suite recorded 1,949 hits. In the same backend, `DISCARD PLANS` produced `52 -> 842 -> 52` in both suites. Secure direct-inner evidence under the NOBYPASSRLS function owner recorded 790 planning hits plus 52 execution hits. The older 1,753 hits plus 179 reads are top-level inclusive Function Scan execution buffers; their hit/read split reflects buffer state.

For C01, profile `accessTypical`, inner track, the relevant branch-scope and branch isolation nodes each recorded Plan Rows 1, Actual Rows 0, and Actual Loops 5. The zero rows are correct branch-isolation behavior for an owner with restaurant-scoped permissions and no active branch scopes. The old direct-inner run used the postgres superuser and is therefore BYPASSRLS-defective evidence. That defect disqualifies the old inner threshold attribution but does not invalidate the outer `SECURITY DEFINER` result.

Raw evidence is distinguished from inference in the diagnosis provenance. The observed sequences and EXPLAIN fields are raw evidence; the internal division of backend-first-use catalog/function initialization beyond the exposed plan component is an inference and is not presented as a separately measured component.

## Cold and warm measurement contract

Each outer or inner track uses one persistent backend and the exact sequence `cold-first-session -> warm-up 1 -> warm-up 2 -> seven measured warm runs`. Reconnect, backend replacement, pre-priming, or selecting favorable runs is prohibited. Every run preserves backend PID and session identity, full EXPLAIN JSON, Planning Time, Execution Time, planning buffers, execution buffers, `clientWallTimeMs`, raw plan, and metric-extraction provenance.

Cold remains mandatory. The original Frozen cold PostgreSQL Execution Time threshold remains unchanged and remains a formal gate. Cold cannot be deleted, primed away, or relabeled as a warm-up. Cold planning and execution buffers are stored separately and reported side-by-side for both suites as `COLD_FIRST_SESSION_PLAN_INITIALIZATION`. The warm `maxSharedHitBlocks <= 256` gate does not apply to cold. No new cold buffer ceiling is invented. Missing, non-finite, or unparseable cold evidence fails closed.

Warm median and warm maximum use only the seven measured top-level PostgreSQL Execution Time values. Cold, both warm-ups, `clientWallTimeMs`, and inner Execution Time are excluded. Original Frozen latency thresholds remain unchanged.

The warm execution-buffer gate uses only top-level execution `Plan` Shared Hit Blocks from the seven measured warm runs. Its rule is `maxSharedHitBlocks <= 256`; all seven raw runs are retained, and any measured run above 256 fails. Cold, warm-ups, Planning buffers, partial-run selection, and median substitution are prohibited inputs.

## Estimate-ratio verdict classifications

The existing loop-adjusted formula and Frozen threshold remain unchanged. Classification is the following canonical ordered, first-match-wins decision table. The final rule makes the partition complete and fail-closed; ordering makes the rules mutually exclusive. `FINITE_EVALUATED` cannot accept Actual Rows zero, and the explicit zero-estimate rule cannot be preempted by a generic non-finite classification.

```json contract-estimate-ratio-decision-table
{
  "kind": "ordered-closed-decision-table",
  "firstMatchWins": true,
  "formulaPreserved": "planned = Plan Rows * Actual Loops; actual = Actual Rows * Actual Loops; ratio = zeroAwareSymmetricRatio(planned, actual)",
  "frozenThresholdPreserved": true,
  "finiteEvaluatedExcludesZeroActual": true,
  "rules": [
    {
      "order": 1,
      "id": "NON_FINITE_OR_UNCLASSIFIED",
      "when": {
        "planRows": "missing-or-not-number-or-non-finite-or-negative",
        "actualRows": "any",
        "actualLoops": "any",
        "isolationProof": "any"
      },
      "verdict": "FAIL"
    },
    {
      "order": 2,
      "id": "NON_FINITE_OR_UNCLASSIFIED",
      "when": {
        "planRows": "valid-non-negative-number",
        "actualRows": "missing-or-not-number-or-non-finite-or-negative",
        "actualLoops": "any",
        "isolationProof": "any"
      },
      "verdict": "FAIL"
    },
    {
      "order": 3,
      "id": "ZERO_ESTIMATE_WITH_ACTUAL_ROWS",
      "when": {
        "planRows": "equal-zero",
        "actualRows": "greater-than-zero",
        "actualLoops": "any",
        "isolationProof": "any"
      },
      "verdict": "FAIL"
    },
    {
      "order": 4,
      "id": "NON_FINITE_OR_UNCLASSIFIED",
      "when": {
        "planRows": "equal-zero",
        "actualRows": "equal-zero",
        "actualLoops": "any",
        "isolationProof": "any"
      },
      "verdict": "FAIL"
    },
    {
      "order": 5,
      "id": "EXPECTED_ZERO_ACTUAL_ISOLATION",
      "when": {
        "planRows": "greater-than-zero",
        "actualRows": "equal-zero",
        "actualLoops": "valid-non-negative-number",
        "isolationProof": "complete-and-resolved"
      },
      "verdict": "SEMANTIC_NA"
    },
    {
      "order": 6,
      "id": "UNEXPECTED_ZERO_ACTUAL",
      "when": {
        "planRows": "greater-than-zero",
        "actualRows": "equal-zero",
        "actualLoops": "any-other-value",
        "isolationProof": "missing-incomplete-failed-or-unresolved"
      },
      "verdict": "FAIL"
    },
    {
      "order": 7,
      "id": "FINITE_EVALUATED",
      "when": {
        "planRows": "greater-than-zero",
        "actualRows": "greater-than-zero",
        "actualLoops": "valid-non-negative-number",
        "existingFrozenRatio": "finite"
      },
      "verdict": "APPLY_EXISTING_FROZEN_THRESHOLD"
    },
    {
      "order": 8,
      "id": "NON_FINITE_OR_UNCLASSIFIED",
      "when": {
        "classification": "not-matched-by-orders-1-through-7"
      },
      "verdict": "FAIL"
    }
  ],
  "isolationProof": {
    "allRequired": true,
    "truthySubstitutionProhibited": true,
    "requiredFields": [
      {
        "id": "frozenCaseIsolationRequirement",
        "type": "object",
        "requiredKeys": [
          "caseId",
          "requirementId",
          "isolationKind",
          "referenceKind",
          "sourceArtifact",
          "jsonPointer"
        ],
        "allowedIsolationKinds": [
          "branch",
          "tenant"
        ],
        "referenceMustResolve": true
      },
      {
        "id": "outerAuthorizationPass",
        "type": "boolean",
        "const": true
      },
      {
        "id": "outerRowCountSemanticsPass",
        "type": "boolean",
        "const": true
      },
      {
        "id": "outerPayloadSemanticsPass",
        "type": "boolean",
        "const": true
      },
      {
        "id": "auditableNodeIsolationPredicateReference",
        "type": "object",
        "requiredKeys": [
          "nodePath",
          "predicateField",
          "predicateText",
          "policyOrJoinReference",
          "referenceKind",
          "sourceArtifact",
          "jsonPointer"
        ],
        "referenceMustResolve": true
      },
      {
        "id": "directInnerFunctionOwner",
        "type": "string",
        "const": "restaurant_membership_context_reader"
      },
      {
        "id": "directInnerOwnerRolsuper",
        "type": "boolean",
        "const": false
      },
      {
        "id": "directInnerOwnerRolbypassrls",
        "type": "boolean",
        "const": false
      },
      {
        "id": "actorFrozenDatasetReference",
        "type": "object",
        "requiredKeys": [
          "actorId",
          "referenceKind",
          "sourceArtifact",
          "jsonPointer"
        ],
        "referenceMustResolve": true
      },
      {
        "id": "tenantFrozenDatasetReference",
        "type": "object",
        "requiredKeys": [
          "tenantId",
          "referenceKind",
          "sourceArtifact",
          "jsonPointer"
        ],
        "referenceMustResolve": true
      },
      {
        "id": "branchFrozenDatasetReference",
        "type": "object",
        "requiredKeys": [
          "branchDisposition",
          "referenceKind",
          "sourceArtifact",
          "jsonPointer"
        ],
        "referenceMustResolve": true
      },
      {
        "id": "claimsFrozenDatasetReference",
        "type": "object",
        "requiredKeys": [
          "claimSubject",
          "referenceKind",
          "sourceArtifact",
          "jsonPointer"
        ],
        "referenceMustResolve": true
      },
      {
        "id": "planRows",
        "type": "finite-non-negative-number",
        "preservedInRawEvidence": true
      },
      {
        "id": "actualRows",
        "type": "finite-non-negative-number",
        "const": 0,
        "preservedInRawEvidence": true
      },
      {
        "id": "actualLoops",
        "type": "finite-non-negative-number",
        "preservedInRawEvidence": true
      },
      {
        "id": "evidenceReferences",
        "type": "array",
        "minimumItems": 5,
        "requiredKeys": [
          "claimId",
          "referenceKind",
          "sourceArtifact",
          "jsonPointer"
        ],
        "eachReferenceMustExistAndResolve": true
      }
    ]
  },
  "referenceResolution": {
    "callerSuppliedResolutionFlagsAuthoritative": false,
    "completenessDeterminedBy": "Guard runtime artifact identity, RFC 6901 pointer, and expected-target semantic resolution",
    "descriptorFields": [
      "referenceKind",
      "sourceArtifact",
      "jsonPointer"
    ],
    "failureDisposition": "FAIL",
    "closedArtifactAllowlist": [
      {
        "path": "docs/runtime-integration-phase-2v-e/p2v-perf-001-representative-scale-authority.json",
        "sha256": "4bfc94a5085a537c3faff97deb8329800f8171e506cbe37c0308a66035a24ade",
        "referenceKinds": [
          "frozen-case-isolation",
          "isolation-predicate",
          "actor",
          "tenant",
          "branch",
          "claims"
        ]
      },
      {
        "path": "docs/runtime-integration-phase-2v-e/restaurant-performance-p2v-perf-001b-c01-diagnosis-provenance.json",
        "sha256": "bff5009d76878f2e459ac81db63b0ca935d205b7dc2db198d70285a55c49e5a1",
        "referenceKinds": [
          "diagnosis-evidence"
        ]
      }
    ],
    "pathSafety": {
      "repositoryRelativePosixOnly": true,
      "absoluteTraversalBackslashNulUriRejected": true,
      "regularFileRequired": true,
      "symlinkRejected": true,
      "realpathContainmentRequired": true
    },
    "jsonPointer": {
      "standard": "RFC 6901",
      "rootPointerAllowed": false,
      "tildeZeroAndOneDecoded": true,
      "illegalEscapeRejected": true,
      "canonicalArrayIndexesOnly": true,
      "dashRejected": true,
      "existenceIndependentOfTruthiness": true
    },
    "expectedTargets": [
      {
        "referenceKind": "frozen-case-isolation",
        "sourceArtifact": "docs/runtime-integration-phase-2v-e/p2v-perf-001-representative-scale-authority.json",
        "jsonPointer": "/cases/0",
        "targetSha256": "dd979d2bd0cf13f95a6d26a10d76667c7d4d1022e5da9e6ef9bad8e95e5f4acd"
      },
      {
        "referenceKind": "isolation-predicate",
        "sourceArtifact": "docs/runtime-integration-phase-2v-e/p2v-perf-001-representative-scale-authority.json",
        "jsonPointer": "/functions/0/filter",
        "targetSha256": "24644038ce8bfc0e526fc7a3b1eb3d3d38c35c04122d902aab255dd77f4611aa"
      },
      {
        "referenceKind": "actor",
        "sourceArtifact": "docs/runtime-integration-phase-2v-e/p2v-perf-001-representative-scale-authority.json",
        "jsonPointer": "/actors/3",
        "targetSha256": "133141294623fb507ebe692879e1451c93cc78dff547eec7bfe9fe9ea5acd276"
      },
      {
        "referenceKind": "tenant",
        "sourceArtifact": "docs/runtime-integration-phase-2v-e/p2v-perf-001-representative-scale-authority.json",
        "jsonPointer": "/targets/noiseTenant01",
        "targetSha256": "9b19dca6f15fbacd6ad915fce397e8b7c40d9445896741c180339d9cb46c88f5"
      },
      {
        "referenceKind": "branch",
        "sourceArtifact": "docs/runtime-integration-phase-2v-e/p2v-perf-001-representative-scale-authority.json",
        "jsonPointer": "/actors/3/branchUuids",
        "targetSha256": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"
      },
      {
        "referenceKind": "claims",
        "sourceArtifact": "docs/runtime-integration-phase-2v-e/p2v-perf-001-representative-scale-authority.json",
        "jsonPointer": "/actors/3/authUserUuid",
        "targetSha256": "a24ab25ae82fb620ab6f5ab70ae9c9c22129fe481252c3518b3df771ec1b0220"
      },
      {
        "referenceKind": "diagnosis-evidence",
        "claimId": "candidate-cold-suite-a",
        "sourceArtifact": "docs/runtime-integration-phase-2v-e/restaurant-performance-p2v-perf-001b-c01-diagnosis-provenance.json",
        "jsonPointer": "/verifiedRawEvidence/candidateColdSharedHitBlocks/candidate-suite-a",
        "targetSha256": "0d866ba9f9fd0f2cbb2134daf52356d2021a3686352d5c19d967305bf9e4bbdc"
      },
      {
        "referenceKind": "diagnosis-evidence",
        "claimId": "candidate-warm-suite-a-first",
        "sourceArtifact": "docs/runtime-integration-phase-2v-e/restaurant-performance-p2v-perf-001b-c01-diagnosis-provenance.json",
        "jsonPointer": "/verifiedRawEvidence/candidateMeasuredWarmSharedHitBlocks/candidate-suite-a/0",
        "targetSha256": "41cfc0d1f2d127b04555b7246d84019b4d27710a3f3aff6e7764375b1e06e05d"
      },
      {
        "referenceKind": "diagnosis-evidence",
        "claimId": "second-backend-suite-a",
        "sourceArtifact": "docs/runtime-integration-phase-2v-e/restaurant-performance-p2v-perf-001b-c01-diagnosis-provenance.json",
        "jsonPointer": "/verifiedRawEvidence/secondFreshBackendSharedHitBlocks/candidate-suite-a",
        "targetSha256": "82887006d04d939ffca870bc268a940df6cf01dbdf12e228ccf476d07d7c9424"
      },
      {
        "referenceKind": "diagnosis-evidence",
        "claimId": "discard-sequence-suite-a",
        "sourceArtifact": "docs/runtime-integration-phase-2v-e/restaurant-performance-p2v-perf-001b-c01-diagnosis-provenance.json",
        "jsonPointer": "/verifiedRawEvidence/discardPlansSharedHitSequence/candidate-suite-a",
        "targetSha256": "a428267c8338c5f1f060e7147c2e1fbe184301baa7ef3f5fc703302616b86e82"
      },
      {
        "referenceKind": "diagnosis-evidence",
        "claimId": "c01-inner-zero-node",
        "sourceArtifact": "docs/runtime-integration-phase-2v-e/restaurant-performance-p2v-perf-001b-c01-diagnosis-provenance.json",
        "jsonPointer": "/verifiedRawEvidence/infinityNodes/0",
        "targetSha256": "68d853c9d02e3301cf00248802a896bd2a90f827a785fb283a6ac049a6ab0d41"
      }
    ]
  },
  "partitionProperties": {
    "deterministic": true,
    "mutuallyExclusiveByFirstMatch": true,
    "completeByFinalFailClosedRule": true,
    "zeroEstimatePositiveActualCannotFallThrough": true,
    "zeroEstimateZeroActualFails": true,
    "unclassifiedFails": true
  }
}
```

The complete isolation proof is structural evidence, not a truthy flag or class ID. It requires all sixteen typed fields above: a resolvable Frozen case isolation requirement; three exact outer PASS booleans; an auditably linked, resolvable node predicate reference; the exact function owner with `rolsuper = false` and `rolbypassrls = false`; separate resolvable actor, tenant, branch, and claims references into the Frozen dataset; preserved Plan Rows, Actual Rows, and Actual Loops; and exactly the five canonical evidence references, each independently resolved. Missing, incomplete, false, malformed, unrelated, or unresolved proof produces `UNEXPECTED_ZERO_ACTUAL`, never semantic N/A.

`sourceArtifact` and `jsonPointer` only describe a reference; neither proves validity. Caller-supplied `resolved`, `exists`, `verified`, `valid`, hash, or similar claims have no authority and are excluded from the proof schema. The Guard alone determines reference completeness at runtime: it requires a typed reference kind, an exact closed artifact allowlist entry, repository-relative POSIX path containment, a non-symlink regular file, a trusted hard-coded artifact SHA-256, successful JSON parsing, strict RFC 6901 resolution, and an exact source/pointer/resolved-target semantic binding. Empty or whitespace values, arbitrary repository files, absolute paths, traversal, backslashes, NUL, URIs, malformed JSON, hash mismatch, illegal pointer escapes, non-canonical array indexes, missing targets, and valid but unrelated targets all fail. A target whose value is `false`, `0`, `null`, or an empty array remains present when the pointer actually resolves; existence is never inferred from truthiness. `EXPECTED_ZERO_ACTUAL_ISOLATION` is available only after every required reference passes that independent resolution.

Zero-row nodes are never ignored wholesale, Infinity is never coerced to a finite value, Plan Rows zero with Actual Rows zero always fails, and raw plan evidence and Frozen case semantics remain intact.

## Secure direct-inner contract

Formal direct-inner execution must use the exact function owner `restaurant_membership_context_reader`, not postgres, a superuser, a BYPASSRLS role, or a service-role shortcut. Evidence must prove `rolsuper = false` and `rolbypassrls = false`, and retain `current_user`, `session_user`, backend PID, and role metadata.

The direct-inner transaction must reproduce the outer case's actor, tenant, branch, claims, and transaction context. It must prove RLS and tenant predicates actually apply. Missing identity, claims, role, RLS, or tenant proof fails. Old superuser direct-inner evidence cannot establish a new inner threshold result; outer authorization evidence remains separately authoritative.

## Preserved Frozen scope

PostgreSQL 17.6, the 41+1 migration rebuild, candidate path and SHA, deterministic dataset and semantic hash, 35 cases, 9 profiles, C01/C02, outer and inner tracks, D01-D10, A05, disabled/inactive/suspended/revoked actors, branch isolation, cross-tenant denial, function identity/signature/return shape/SQL semantics, owner/ACL/NOBYPASSRLS, RLS, tenant predicates, indexes, two fresh suites, Planning Time and Execution Time sources, planning/execution buffer separation, diagnostic-only client wall time, all original cold/warm median/warm maximum latency thresholds, and every gate not expressly superseded remain Frozen.

## Superseded clauses after Freeze only

Only these areas may gain superseding effect: cold/warm buffer aggregation; cold-first-session plan-initialization classification; the estimate-ratio verdict for proven zero-actual isolation; secure direct-inner execution identity; and creation of the exact future runner/schema/validator/implementation-guard files below. Nothing is superseded while this document remains a candidate.

## Future implementation exact-path whitelist

Exactly four future paths are prospectively authorized after independent review and Freeze:

1. `scripts/restaurant-performance-p2v-perf-001b-formal-runner.mjs` — Status: `new path allowed to create`. Formal PostgreSQL 17.6 runner with embedded dataset generation, catalog capture, 29-case prechecks, 35-case/9-profile outer-inner tracks, persistent-session lifecycle, secure direct-inner, metrics, raw evidence, and `--self-test`.
2. `docs/runtime-integration-phase-2v-e/p2v-perf-001b-evidence-schema.json` — Status: `new path allowed to create`. Closed machine-readable evidence schema for suite, environment, case, track, run, EXPLAIN, identity, buffers, cold/warm aggregation, zero-row classification, and provenance.
3. `scripts/restaurant-performance-p2v-perf-001b-evidence-validator.mjs` — Status: `new path allowed to create`. Independent offline evidence validator for schema, completeness, backend continuity, aggregation, non-finite handling, secure identity, two-suite separation, and embedded negative self-tests.
4. `scripts/restaurant-performance-p2v-perf-001b-c01-contract-implementation-guard.mjs` — Status: `new path allowed to create`. Contract validation script with negative self-tests for Frozen bindings, candidate SHA, four-file inventory, runner/schema/validator consistency, security prohibitions, and no-retroactive-pass.

There is no fifth implementation path. No existing tracked path is allowed to be modified. These four implementation paths do not exist in this candidate phase and cannot be created before Freeze. `package.json` and every lockfile remain unauthorized.

## Explicit prohibitions and lifecycle

The migration candidate; all existing 41 migrations; all Frozen authorities, contracts, guards, dataset cases and profiles; SQL/function semantics; RLS; tenant predicates; indexes; owner; ACL; grants; application code; package and lockfiles; Development/Production configuration; Git remote state; and every `/tmp` path are forbidden changes. The four reauthorization candidate files and the four future implementation files are distinct inventories.

Two fresh, independent PostgreSQL 17.6 suites must run only after independent review and Freeze, rebuilding the 41 existing migrations plus the same candidate SHA and covering all 35 cases, all 9 profiles, both tracks, and all security prechecks. Freeze is not automatic. Implementation is not automatic. No formal suite, implementation, Independent Review, B1-D2, N4, or Phase 2V-F begins in this candidate task.

The existing BLOCKED result has not been retrospectively changed. Future implementation files have not been created.

# P2V-PERF-001B C01 Remediation Authorization Contract

Status: **candidate for independent D2 review; runtime remediation not started or authorized**

The normative machine authority is
[`p2v-perf-001b-c01-remediation-authority.json`](./p2v-perf-001b-c01-remediation-authority.json),
schema `tastkind.p2v-perf.c01-remediation-authorization`, version 1, authorization
`P2V-PERF-001B-C01-REMEDIATION-A1`.

This candidate is bound only to candidate preparation on branch `main`, HEAD
`3c36c5c64d6b02b8da807f5715d67065ba3f7de6`, with 41 existing migrations.
That baseline is not permission to implement. Runtime work remains fail-closed
until this exact authorization receives a new independent D2 review and Freeze.

## Frozen composition

All nine Frozen files remain byte-identical. The base contract, base authority,
base guard, plan-metric machine authority, plan Markdown, plan guard, Dataset
Semantics authority, Dataset Semantics Markdown, and Dataset Semantics guard are
bound by the exact paths and SHA-256 values in the machine authority. This
authorization neither replaces nor weakens any Frozen workload, threshold,
dataset, plan-metric, RLS, security, lifecycle, or evidence rule.

## Root-cause basis

The obsolete runner opened a new database session for every measured run. That
produced approximately 1,949 shared-hit blocks and 31–42 ms execution times.
Under the Frozen-authority-correct persistent-session measurement, C01 outer
still failed: warm median 17.076 ms against 15 ms, warm maximum 17.471 ms
against 25 ms, and 842 shared-hit blocks against 256.

The 842 hits are attributed exactly as `842 = 790 + 52`: 790 hits from planning
the 96-node FORCE-RLS-expanded inner statement and 52 hits from inner execution.
The existing SQL `SECURITY DEFINER` function
`restaurant_current_access_context_v1()` re-plans that inner statement on each
call. Existing indexes, statistics, selectivity, and actual data access were
found reasonable; this authority does not authorize an index or statistics
change.

## Persistent-session runner correction

Outer and inner tracks each use a separate persistent database session. Within
each track, cold execution, two warm-ups, and seven measured runs execute in
that same track session, in that order. A session is never shared between
tracks, and no measured run may create a new connection or backend. Here,
`cold` means only the first formal invocation in the new track session. It does
not claim an OS-cache-cold, device-cache-cold, or PostgreSQL-shared-buffer-
cleared state. The outer result remains authoritative and may never be
replaced, masked, or overridden by an inner result.

## Measurement field contract

Every raw run preserves PostgreSQL server metrics and client timing as separate
evidence classes:

- PostgreSQL server planning time is the top-level `Planning Time` from
  `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`, in milliseconds. It is never added
  to or relabeled as `Execution Time` or `clientWallTimeMs`.
- PostgreSQL server execution time is the top-level `Execution Time` from the
  same EXPLAIN JSON statement summary, in milliseconds. SQL-function
  initialization and inner planning inside an outer `Function Scan` remain
  outer server execution when PostgreSQL includes them in outer
  `Execution Time`; they are never reclassified as client overhead. Execution
  time is never mixed with planning time or client wall time.
- Execution buffers come from the top-level `Plan` object, whose inclusive
  values are the whole-plan execution totals for that run. Each cold and
  measured run separately stores `Shared Hit Blocks`, `Shared Read Blocks`,
  `Shared Dirtied Blocks`, `Shared Written Blocks`, all four Local
  Hit/Read/Dirtied/Written fields, and `Temp Read Blocks` and
  `Temp Written Blocks`. Planning buffers, when PostgreSQL emits them, come
  from the top-level `Planning` object and are stored under planning-prefixed
  identities; they are never added to execution buffers or reported as an
  unlabeled combined number.
- `clientWallTimeMs` uses a client monotonic clock around the complete request
  round trip. Client, libpq, serialization, and round-trip overhead remain
  distinct from all server metrics. Client wall time is diagnostic only and
  never substitutes for a Frozen server threshold.

For each track, the formal buffer summaries exclude both warm-ups.
`maxSharedHitBlocks` is the maximum execution `Shared Hit Blocks` across the
cold run and seven measured runs; `maxColdReadBlocks` is the cold execution
`Shared Read Blocks`; `maxWarmReadBlocks` is the maximum of that execution field
across the seven measured runs. Local and temp limits use the maximum matching
execution field across the cold run and seven measured runs. Planning maximum
is the maximum server `Planning Time` across the cold run and seven measured
runs. Every underlying raw value is retained.

For C01 outer evidence, `warmMedianMs` and `warmMaximumMs` use only the seven
top-level PostgreSQL outer `Execution Time` values from the same outer
persistent session. `warmMedianMs` is their median and `warmMaximumMs` is their
maximum. Neither includes the cold run, either warm-up, `clientWallTimeMs`, or
inner `Execution Time`. Inner success cannot replace, mask, or override an
outer failure.

## Sole permitted remediation direction

After independent review and Freeze, implementation may create exactly one
runtime candidate:
`supabase/migrations/20260722010000_cache_restaurant_current_access_context_plan.sql`.
No other runtime candidate or trial alternative is authorized.

That new migration may use `CREATE OR REPLACE FUNCTION` solely to convert
`restaurant_current_access_context_v1()` from `LANGUAGE sql` to
`LANGUAGE plpgsql`, with a static `RETURN QUERY`. Its only purpose is to permit
session plan caching to absorb repeated RLS-expanded inner planning cost.

The replacement must preserve all of the following without drift:

- function identity and complete zero-input signature
  `public.restaurant_current_access_context_v1()`;
- `RETURNS TABLE`/set-returning semantics and these exact ordered return
  columns from the Frozen migration:
  1. `restaurant_id pg_catalog.text` (typmod `-1`),
  2. `role_key pg_catalog.text` (typmod `-1`),
  3. `permission_key pg_catalog.text` (typmod `-1`),
  4. `permission_scope pg_catalog.text` (typmod `-1`),
  5. `branch_id pg_catalog.text` (typmod `-1`);
- every column name, schema-qualified PostgreSQL type identity, typmod, array,
  enum or domain identity, and return-column ordinal; all five current columns
  are non-array, non-enum, non-domain `pg_catalog.text`;
- `STABLE`, `SECURITY DEFINER`, `PARALLEL UNSAFE`, `COST 100`, and `ROWS 1000`;
- empty `search_path` and `row_security=on`;
- the original owner, original `EXECUTE` ACL, and owner `NOBYPASSRLS` status;
- every RLS policy, tenant predicate, branch boundary, and denial semantic.

Before-and-after PostgreSQL 17.6 catalog evidence must prove exact equivalence
for `pg_get_function_identity_arguments`, `pg_get_function_result`,
`pg_get_function_arguments`, `pg_proc.proretset`, `pg_proc.prorettype`,
`pg_proc.proallargtypes`, `pg_proc.proargmodes`, `pg_proc.proargnames`, and the
`pg_type` namespace/name identity of every return type. Expected identity
arguments are empty; expected result is
`TABLE(restaurant_id text, role_key text, permission_key text, permission_scope text, branch_id text)`;
expected arguments are
an empty string because the function has no input arguments; `proretset` is true
and `prorettype` resolves to `pg_catalog.record`. `proallargtypes` resolves to
five ordered `pg_catalog.text` entries, `proargmodes` is five ordered `t`
(`TABLE`) modes, and `proargnames` is the exact five-name return-column list
above. Any catalog or schema-qualified type mismatch fails closed.

`ROWS 1000` is not an incidental metadata correction. It may change only under
a separate authority supported by independent evidence; this authorization
does not provide that authority.

## Evidence and fail-closed disposition

The approximately 52 inner-execution hits are a diagnosis-derived expectation,
not pre-declared pass evidence. A later implementation must be measured in two
fresh, isolated, local PostgreSQL 17.6 suites against all original Frozen
thresholds. If the PL/pgSQL replacement does not pass, the result fails closed.
It may not trigger a semantic change, index addition, threshold relaxation, or
RLS bypass.

Neither development nor production data, credentials, connections, or stale
performance evidence may be used.

## Mandatory post-implementation verification

Both fresh PostgreSQL 17.6 suites must rebuild all 41 existing migrations plus
the one authorized new migration, regenerate the deterministic Frozen dataset,
and rerun all 35 cases and all 9 threshold profiles. Coverage includes C01 and
C02 outer and inner tracks, D01–D10 denial, A05 multi-tenant portfolio,
disabled/inactive/suspended/revoked actors, branch-scope isolation, function
owner, `EXECUTE` ACL, and all function metadata.

Historical guards and smokes, dataset determinism, and all nine Frozen hashes
must also pass. Every listed item is mandatory; partial or diagnostic success
cannot replace a formal failure.

## Candidate lifecycle

This phase contains exactly these three candidates and no fourth file:

1. `docs/runtime-integration-phase-2v-e/p2v-perf-001b-c01-remediation-authority.json`
2. `docs/runtime-integration-phase-2v-e/p2v-perf-001b-c01-remediation-contract.md`
3. `scripts/restaurant-performance-p2v-perf-001b-c01-remediation-guard.mjs`

The next permitted gate is independent D2 review. Freeze, migration
implementation, B1 Retry, N4, and Phase 2V-F do not start automatically.

## Guard external self-integrity

The guard requires an external trust anchor and must be invoked as:

```sh
node scripts/restaurant-performance-p2v-perf-001b-c01-remediation-guard.mjs \
  --expected-self-sha256 <64-lowercase-hex-digest>
```

`--expected-self-sha256` is mandatory and accepts exactly 64 lowercase
hexadecimal characters. Before parsing the authority or printing any semantic
PASS, the guard hashes the actual bytes of its executing file and exits
non-zero on a missing, malformed, uppercase, or mismatched expected digest. On
success it prints the verified self SHA-256 and continues. The Corrected
Candidate Report publishes the final digest and exact invocation for the next
independent D2 reviewer. The final guard digest is deliberately not hard-coded
inside the guard or authority, avoiding a circular self-hash.

# P2V-PERF-001A-D1 Executable Plan-Metric Semantics Clarification

Status: **P2V-PERF-001A-D1 clarification candidate; ready only after its guard and independent D2 review**

This document composes with, and does not edit, the Frozen P2V-PERF-001A
authority at commit `b95d92ef58bc956bac1fb32cfb09b77309645b47`.
The bound base JSON SHA-256 is
`4bfc94a5085a537c3faff97deb8329800f8171e506cbe37c0308a66035a24ade`.
The machine-readable authority is
[`p2v-perf-001-plan-metric-semantics-authority.json`](./p2v-perf-001-plan-metric-semantics-authority.json),
schema `tastkind.p2v-perf.plan-metric-semantics`, version 1, for PostgreSQL
major version 17.

## Precedence and scope

This clarification is normative only for the executable calculations behind
the five existing profile fields: `maxEstimateRatio`, `maxFanout`,
`maxNestedLoopRows`, `maxSortMemoryKb`, and `maxHashMemoryKb`. It supplies the
calculation semantics omitted by the base authority and takes precedence only
for those semantics. The base authority retains every numeric threshold, nine
profiles, 35 case classifications, outer/inner obligations, scan and buffer
rules, payload and authorization rules, and zero-spill policy. A conflict
outside this narrow scope fails closed.

The JSON `program` objects use the closed `P2V_PLAN_METRIC_DSL_1` vocabulary.
Field paths are arrays of literal PostgreSQL `FORMAT JSON` keys. A conforming
runner interprets these objects; it does not translate prose into formulas.

## Common execution semantics

Input is one PostgreSQL 17 `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT JSON)`
top-level array with exactly one `Plan`. Plan nodes are visited recursively via
`Plans`; `Workers` records are participants, not additional plan nodes.

Every required metric is a finite, non-negative JSON number. Missing values,
numeric strings, null, booleans, negative values, NaN, infinities, and malformed
structures fail closed. Loop-adjusted actual rows are `Actual Rows × Actual
Loops`; loop-adjusted planned rows are `Plan Rows × Actual Loops`.

PostgreSQL plan-node row fields are leader-aggregated. Worker row fields are
never added again for estimation, fan-out, or nested-loop calculations. Memory
records differ: the leader and each reported worker are independent participant
observations. Their maximum is used, never their sum. Multiple qualifying nodes
also aggregate by maximum.

The machine rule `worker-actual-loops-positive` governs every Sort and Hash
worker participant. Its worker collection path is literal `["Workers"]`, worker
identity path is `["Worker Number"]`, and execution field path relative to the
worker record is `["Actual Loops"]`. The execution predicate is a finite,
non-negative JSON number greater than zero. Missing or empty `Workers` means
there are no worker observations. A present worker with `Actual Loops == 0` is
unexecuted: its runtime memory/spill fields may be absent, it creates no memory
or spill observation, and its metric contribution is zero. A present worker
with positive `Actual Loops` is executed and must supply every runtime field
required by its node kind. Missing execution evidence, numeric strings,
malformed values, negatives, NaN, and infinities fail closed; none is treated as
an unexecuted worker. Leader and executed-worker observations remain independent
and compose by maximum, never by addition.

Only inner evidence receives these five metrics. Each case evaluates the one
measured PostgreSQL-buffer-cold inner run and all seven measured warm inner
runs. The two warm-ups and all outer runs are excluded. Every measured run must
pass; the diagnostic case value is the maximum of its eight run values. Exact
threshold equality passes (`value <= threshold`). Missing evidence fails.
Mandatory metric failure fails the suite; diagnostic failure is completely
reported but does not become a mandatory gate.

## Estimation ratio

Every plan node qualifies. For a node:

`planned = Plan Rows × Actual Loops`

`actual = Actual Rows × Actual Loops`

If both are zero, ratio is 1. If exactly one is zero, the observation is an
infinite-ratio fail. Otherwise ratio is
`max(planned / actual, actual / planned)`. The per-run value is the maximum node
ratio and must be `<= maxEstimateRatio`. Worker rows are ignored because the
node values are already leader-aggregated.

## Fan-out

Each direct `parent.Plans[i]` edge qualifies except a child whose `Parent
Relationship` is `InitPlan` or `SubPlan`. The observation is:

`(child.Actual Rows × child.Actual Loops) /
 (parent.Actual Rows × parent.Actual Loops)`

This measures rows processed by a tuple-flow child per row emitted by its
parent. Zero/zero is 1; positive/zero is an infinite-ratio fail. Nested ordinary
edges are evaluated recursively. The per-run maximum must be `<= maxFanout`.

## Nested-loop processed rows

Only `Node Type == "Nested Loop"` qualifies. Its direct inner side is exactly
`Plans[1]`; fewer than two children fails closed. The observation is
`Plans[1].Actual Rows × Plans[1].Actual Loops`. This captures all direct inner
rescans without summing the same nested plan again through its parent. Multiple
Nested Loops aggregate by maximum and must be `<= maxNestedLoopRows`.

## Sort memory and spill

`Sort` and `Incremental Sort` qualify. An executed `Sort` uses literal fields
`Sort Space Used` and `Sort Space Type`. `Memory` contributes the already-kB
value. `Disk` is an unconditional spill failure and its disk value is not added
to memory.

For `Incremental Sort`, the exact optional groups are `Full-sort Groups` and
`Pre-sorted Groups`. Memory observations use `Sort Space Memory.Peak Sort Space
Used`; positive `Sort Space Disk.Peak Sort Space Used` is a spill failure.
Absent groups contribute nothing, but an executed node with no runtime group
evidence fails closed. Leader and worker observations, then multiple nodes,
aggregate by maximum. The result must be `<= maxSortMemoryKb` and have no spill.
An unexecuted qualifying node (`Actual Loops == 0`) contributes zero without
requiring runtime sort fields. Worker execution is independently decided by the
machine worker rule above; an unexecuted worker cannot trigger a memory or spill
observation, while an executed worker missing either required Sort field or the
applicable Incremental Sort evidence fails closed.

## Hash memory and spill

Qualifying nodes are `Hash`, plus `Aggregate` whose `Strategy` is `Hashed` or
`Mixed`. `Hash Join` itself is excluded; its `Hash` child owns the memory
evidence. Every participant contributes literal `Peak Memory Usage` in kB.

`Hash` requires `Hash Batches`; a value above 1 fails spill. Qualifying
`Aggregate` requires `HashAgg Batches` and `Disk Usage`; batches above 1 or
positive disk usage fails spill. Leader and worker observations are never
summed, including shared/parallel hash reports. Participant and node maxima must
be `<= maxHashMemoryKb`, with no spill. An unexecuted qualifying node contributes
zero without requiring runtime hash fields. Worker execution is independently
decided by the machine worker rule above; an unexecuted worker cannot trigger a
memory, batch, disk, or spill observation, while an executed worker missing any
applicable memory, batch, or disk field fails closed.

## Evidence and fixtures

Each metric's JSON rule declares its exact diagnostic fields. Evidence retains
node/edge paths, participant identity where applicable, operands, calculated
value, threshold, spill state, and verdict. The authority includes executable
fixtures for exact/under/over estimates, every zero case, repeated loops,
fan-out exclusions, nested and multiple Nested Loops, in-memory/external/
incremental/parallel sorts, ordinary/aggregate/multi-batch/parallel hashes,
missing worker fields, malformed metrics, equality, and just-over-threshold
failure. The D1 guard executes those fixtures through the machine-rule
evaluator and also runs process-local negative mutations.

This clarification starts no PostgreSQL process, creates no dataset, and runs
no workload. P2V-PERF-001B-B1 remains blocked until this candidate receives an
independent D2 review and Freeze.

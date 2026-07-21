# Performance and Query-Plan Contract

Status: **P2V-PERF-001A-C1 corrected authority candidate; P2V-PERF-001 remains OPEN until a reviewed P2V-PERF-001B run**

The normative, machine-readable authority is
[`p2v-perf-001-representative-scale-authority.json`](./p2v-perf-001-representative-scale-authority.json).
It defines an isolated PostgreSQL 17.6 MVP production-planning acceptance tier.
It is not a cloud or final Production SLA.

P2V-PERF-001A-C1 changes authority only. It does not create the representative
dataset, install or start PostgreSQL, run `EXPLAIN ANALYZE`, connect to
Development or Production, or begin P2V-PERF-001B, N4 or Phase 2V-F.

## Historical evidence boundary

P2V-D-PERF-002 remains CLOSED only for its small Development fixture. Its
observed maximum of 4 rows and 1,249 bytes is historical evidence and is not
extrapolated into any representative-scale row, payload or latency threshold.
The earlier opaque `Function Scan` is likewise not inner-plan evidence.

## Frozen function inventory

The workload covers the access-context function and all seven formal internal
read RPCs. Inputs, exact ordered outputs, source tables/functions, identity keys,
frozen index names, known index gaps, source migrations, body hashes and
lexer-aware parameter-token counts are recorded in the JSON authority.

| Function | Input | Identity | Outer behavior |
| --- | --- | --- | --- |
| `restaurant_current_access_context_v1` | `{}` | restaurant/permission/scope/branch | full authorized context |
| `restaurant_internal_restaurants_v1` | `{}` | `restaurant_id` | full authorized portfolio |
| `restaurant_internal_branches_v1` | `{p_restaurant_id:text}` | `branch_id` | full permitted result |
| `restaurant_internal_menus_v1` | `{p_restaurant_id:text}` | `menu_id` | full permitted result |
| `restaurant_internal_menu_categories_v1` | `{p_restaurant_id:text}` | `category_id` | full permitted result |
| `restaurant_internal_menu_items_v1` | `{p_restaurant_id:text}` | `menu_item_id` | full permitted result |
| `restaurant_internal_branch_menu_items_v1` | `{p_restaurant_id:text}` | `branch_menu_item_id` | full permitted result |
| `restaurant_internal_current_nutrition_v1` | `{p_restaurant_id:text}` | `nutrition_id` | full permitted current result |

The frozen functions contain no `ORDER BY`, `LIMIT` or `OFFSET`; the live adapter
also exposes no pagination parameters. Outer evidence therefore measures the
complete legal payload. P01-P06 are explicitly body-derived inner diagnostics,
not claims that the RPC API is paginated.

## Exact representative dataset

Seed: `2026072101`. UUID namespace:
`8c5a2a10-18d1-5b7e-9df4-202607210001`.

- 50 tenants: 45 active, 3 paused, 1 draft and 1 archived.
- 700 Auth users and 700 restaurant users: 679 distinct membership users,
  21 enabled non-members, 699 enabled and 1 disabled.
- 216 branches, 106 menus, 488 categories, 5,520 items, 27,760 branch items,
  11,040 nutrition rows, 5,520 current nutrition rows and 4,256 rows eligible
  for the frozen current-published view.
- 688 memberships, 1,184 branch scopes, 3 migration-owned roles and 14
  migration-owned permissions.
- Maximum tenant: 20 branches, 8 menus, 96 categories, 1,600 items, 16,000
  branch items, 3,200 nutrition rows, 100 memberships and 400 branch scopes.
- Each of 49 noise tenants: 4 branches, 2 menus, 8 categories, 80 items, 240
  branch items, 160 nutrition rows, 12 memberships and 16 branch scopes.

Every generated table has a field-level contract in the JSON: PK/FK UUIDv5
formula, every required field, valid check-constrained values, lifecycle
distribution, nullable formula, timestamp, uniqueness method, generation order
and count formula. The exact FK-safe table order has 13 one-to-one keys:
`auth.users`, `restaurants`, `restaurant_branches`, `menus`,
`menu_categories`, `menu_items`, `branch_menu_items`, `menu_item_nutrition`,
`restaurant_users`, `restaurant_roles`, `role_permissions`,
`restaurant_memberships`, and `restaurant_membership_branch_scopes`. Roles and
permissions are separate table arrays, never a combined label. Items use
`categoryOrdinal = itemWithinMenu mod categoriesPerMenu`, so every item has one
non-null category and the maximum tenant's 96 categories remain reachable.
Nutrition uses exactly two versions per item, one current, with explicit source,
confidence, verified status and numeric/null rules. The public-view total is
`1,440 + 44 × 64 = 4,256`.

### Exact user and membership identity map

All user ordinals are zero-based integers `0..699`. A01-A09 reserve ordinals
`0..8` in actor-ID order. Their Auth and restaurant-user UUIDv5 names remain
`${seed}:auth-actor:${actorId}` and `${seed}:restaurant-user:${actorId}`.
Filler ordinals `9..699` use exactly `${seed}:auth-fill:${userOrdinal3}` and
`${seed}:restaurant-user-fill:${userOrdinal3}`. Every Auth row has the unique
email `perf-auth-${userOrdinal3}@example.invalid`; every restaurant-user at
ordinal `u` references the Auth UUID at the same ordinal `u`. The guard
enumerates all 700 names and UUIDs and rejects any collision, missing FK,
duplicate pairing or actor/filler overlap.

Memberships have serials `0..687`: max-tenant ordinal `m` has serial `m`, while
noise `(t,m)` has `100 + (t-1) × 12 + m`. Seventeen exact overrides bind A01,
A02, A03, A04, A07, A08 and A09 once and bind A05/user ordinal 4 to membership
ordinal 0 in each tenant 1 through 10. For every other serial, its zero-based
rank among ascending non-override serials maps to user ordinal `9 + rank`.
Thus 671 non-overrides use ordinals `9..679`; with eight membership actors there
are exactly 679 membership users. A05 is the sole duplicate exception: ten
assignments create nine duplicates beyond the first. The exact 21 non-members
are ordinal 5 (A06) plus ordinals `680..699`.

Branch-scope IDs and FKs are likewise formula-complete. Active scope ordinals
are `0..4` for the maximum tenant and `0..1` for noise tenants; inactive scope
ordinals are explicitly `5` and `0`, respectively. A03's inactive scope uses
branch ordinal 5 rather than its formula-default branch 4, avoiding collision
with A03's exact active branch override `0..4`. The guard enumerates all 1,184
scope PKs and membership/branch FKs and enforces the frozen
`(membership_id, branch_id)` uniqueness constraint.

### Exact semantic hash

After all rows are materialized and before `ANALYZE`, the runner constructs a
13-element JSON array in the exact table order above. Each table object contains
`table`, `columns` and `rows`; `columns` is the table-specific literal list in
the JSON authority, and each row is a value array in that column order. Rows are
sorted by the declared PK order using lowercase UUID/text UTF-8 bytes; the
composite permission key is `role_id`, `permission_key`, `permission_scope`.

The envelope uses RFC 8785 canonical JSON and UTF-8 with no BOM, insignificant
whitespace or trailing newline. UUIDs are lowercase canonical strings;
timestamps are UTC millisecond ISO-8601; strings receive no Unicode
normalization; arrays retain declared order; null and booleans are JSON native;
integers are canonical JSON integers; SQL numeric values are normalized
non-exponent decimal JSON strings without redundant zeros. Migration-created
timestamps for roles/permissions are excluded, while their exact frozen seed
columns are separate arrays. SHA-256 output is 64 lowercase hex characters.
Both fresh suites must produce byte-identical envelopes and hashes.

## Exact targets and actor derivation

- Maximum tenant: `ae9ecea9-6f54-554e-97f2-2e69c8bff621`
- Noise tenant 01: `cb327052-b06e-5fe2-9ce7-f6299ec61db8`
- Noise tenant 49: `c8ff8e59-3967-5acf-a247-d5c147d2f33c`
- A02/A03 exact branches: `2e0cd205-5359-547c-8c54-e24e075d9d4b`,
  `d58ced72-f1da-5028-bde5-d39a9211689d`,
  `76021568-1fdf-5e34-bd90-32ab851dc68c`,
  `f88793bc-1116-5bc3-a04a-59cb57e6c05c`, and
  `91102298-a3bc-5cee-b99f-d3408b46b9ed`.

Actor tuple order is access, restaurants, branches, menus, categories, items,
branch-items and nutrition:

- A01 max owner: `(5,1,20,8,96,1600,16000,1600)`.
- A02 max manager/five branches: `(17,1,5,8,96,1120,4000,1120)`.
- A03 max staff/five branches: `(16,1,5,8,96,1120,4000,1120)`.
- A04 typical owner: `(5,1,4,2,8,80,240,80)`.
- A05 ten-tenant portfolio owner: `(50,10,4,2,8,80,240,80)` for selected noise 01.
- A06 non-member: all zero.
- A07 noise-49 owner: A04-sized own result; maximum-tenant parameterized calls zero.
- A08 inactive member and A09 disabled user: all zero.

The JSON records literal Auth user, restaurant user and membership UUIDs, exact
membership ordinals, roles, statuses and branches. It also defines every denied
target; the runner does not select actors or restaurants heuristically.

## Exact workload inventory

There are exactly 35 unique cases:

- Mandatory: C01-C02, R01-R02, B01-B02, M01-M02, K01-K02, I01-I03,
  J01-J03, N01-N03 and D01-D10.
- Diagnostic: P01-P06 only.

Every case records `caseId`, `functionName`, `actorId`, exact target, a directly
executable argument object, expected rows, threshold profile, classification,
three evidence obligations, authorization disposition and purpose. P01-P06 also
record exact `LIMIT 100` and first/deepest offsets.

Any mandatory track or assertion failure fails its suite. Diagnostic failure is
recorded and does not fail the mandatory suite, but P2V-PERF-001 cannot close
until the diagnostic failure receives an explicit reviewed disposition.

## Quantitative threshold profiles

Each profile contains separate `outer`, `inner` and `result` objects. Timing tuple
is cold execution / warm median / warm maximum / planning maximum in ms; buffer
tuple is shared hits / cold physical reads / warm physical reads. Outer and inner
budgets are evaluated independently and never combined.

| Profile | Timing (outer and inner) | Buffers (outer and inner) | Result rows / bytes |
| --- | --- | --- | --- |
| `accessTypical` | `80/15/25/5` | `256/256/0` | `5 / 8,192` |
| `accessWorst` | `150/30/50/8` | `1,024/512/0` | `50 / 65,536` |
| `smallTypical` | `100/20/35/8` | `1,024/512/0` | `240 / 200,000` |
| `smallWorst` | `250/60/100/12` | `4,096/1,536/8` | `1,120 / 524,288` |
| `itemsWorst` | `400/100/180/15` | `8,192/2,048/16` | `1,600 / 2,500,000` |
| `branchItemsWorst` | `600/200/300/20` | `12,000/4,096/32` | `16,000 / 12,000,000` |
| `nutritionWorst` | `450/120/200/15` | `9,000/3,072/16` | `1,600 / 1,800,000` |
| `denial` | `100/20/35/8` | `512/256/0` | `0 / 2` |
| `pageDiagnostic` | inner `250/60/100/12` | inner `4,096/1,536/8` | `100 / 200,000` |

Every applicable track requires zero local hits/reads and zero temp reads/writes.
Every inner profile limits estimation ratio, rows removed, fan-out, nested-loop
rows and sort/hash memory; exact values remain normative in JSON. External sort,
disk hash, nonzero temp I/O or nonzero local-buffer use fails.

Canonical payload bytes are PostgreSQL 17.6 `jsonb` text bytes after identity-key
ordering, computed with the exact expression in JSON. This is a deterministic
engineering payload measure, not a claim about HTTP framing or RPC order.

## Independent outer and inner cold tracks

For every applicable case in both suites, outer and inner use different restart
cycles.

Outer track: `CHECKPOINT` → clean stop → port-closed proof → restart → one
PostgreSQL-buffer-cold exact-RPC measurement → two unmeasured outer warm-ups →
seven measured outer runs → independent outer thresholds.

Inner track: another `CHECKPOINT` → another clean stop → another port-closed proof
→ restart → one PostgreSQL-buffer-cold body-derived measurement → two unmeasured
inner warm-ups → seven measured inner runs → independent inner thresholds and
plan rules.

No OS/page-cache/device-cold claim is made. Authorization is proven only by the
outer RPC. Inner plans prove only the frozen-body-derived query plan.

## ANALYZE and sequential-scan algorithm

Each suite reconstructs 41 migrations, generates data, computes the semantic
hash, executes the three exact `ANALYZE` commands in JSON, and then captures
`pg_class.reltuples` through `pg_namespace` by OID. Rounded `reltuples` must equal
the exact generated counts; the unrounded positive value is the only scan-rule
denominator.

Only nodes with both `Schema` and `Relation Name` resolve to base relations.
Alias is evidence only; derived/CTE/function nodes receive no relation-size rule.
Partition children are evaluated separately. Leader-aggregated parallel metrics
are counted once.

For each base OID, effective sequential executions are the sum of `Actual Loops`
over every `Seq Scan` node. With `reltuples > 512`, more than one execution fails.
Exactly one execution passes only when:

- `(Actual Rows × Actual Loops) / reltuples >= 0.25`;
- aggregated filter/join rows removed are at most twice returned rows; and
- that node stays within the case's inner shared-hit/read limits.

Zero-return large scans fail. Missing/non-finite metrics fail. Relations at or
below 512 rows may use sequential scans but retain every other case threshold.

## Frozen-body extraction and SQL lexer

The runner LF-normalizes the frozen migration, identifies the exact function
signature and `AS` dollar delimiter, extracts through its matching delimiter,
and hashes the original UTF-8 body before any transformation.

The lexer contract covers normal code, unquoted and quoted identifiers,
standard/E/U& strings, line comments, arbitrarily nested block comments,
untagged/tagged dollar quotes, `$digits` parameters and operators/punctuation.
Only a complete unquoted identifier that PostgreSQL-folds to
`p_restaurant_id` is counted and replaced. The pre-replacement token count must
match authority, and a second tokenization must find zero remaining matches.
Parameterized bodies are prepared with exactly one `text` parameter and bound
from the literal case argument. Zero-argument bodies remain unchanged.

An opaque outer `Function Scan` is recorded but never satisfies inner evidence.
Inner JSON traversal captures scan/index/join types, rows, loops, filters,
buffers, sort and hash/spill evidence. Inlined execution never substitutes for
formal outer authorization evidence.

# Phase 2V-E Development Freeze Record

Phase: Runtime Integration Phase 2V-E (TastKind / 好廚 Restaurant Web).
Freeze date: 2026-07-17.

## Baseline

- Starting HEAD: `3d5340f489cc6fb29fa77da6d1d32f38e22c16e8` (frozen Phase 2V-D).
- Branch: `main`.
- Development migrations: 33/33.
- Latest migration: `20260716060000_restore_restaurant_internal_reader_set_option.sql`.
- Production: excluded from this package throughout.

## DV-001 and Restaurant B — final result

Credential-backed HTTP evidence was collected against all eight approved Development actors, using each actor's own access token over the real PostgREST path, for all seven internal RPCs against both restaurants (Restaurant A: `dev-restaurant-haochu`; Restaurant B: `dev-restaurant-hidden`).

- DV001_CREDENTIAL_BACKED_HTTP=PASS
- DV001_FULLY_CLOSED=true (RPC authorization scope: test groups 1–4 and 11 of `dv-001-actor-validation-plan.md`)
- 8/8 sign-in=PASS, 8/8 global logout=PASS
- Owner/manager/staff positive scopes and inactive/suspended/revoked/non-member fail-closed: PASS, matching the approved actor matrix exactly
- B_OWNER_POSITIVE_PATH=PASS — all six Restaurant-B-scoped RPCs HTTP 200, row_count=1 each; `restaurant_internal_restaurants_v1` scoped to Restaurant B only
- B_OWNER_CROSS_TENANT_DENIAL=PASS — all seven RPCs against Restaurant A returned row_count=0 for `restaurant-b-owner`
- Anonymous internal-RPC denial=PASS — all seven RPCs returned HTTP 401 for a true anon token
- Public-safe regression=PASS — `restaurant_public_published_nutrition_v1` returned HTTP 200 for anon

## P2V-D-PERF-002 — closed scope

CLOSED (Development scope). Real HTTP payload evidence across all seven RPCs, eight actors, and both restaurants: maximum observed response 1,249 bytes, maximum row count 4, no unbounded or runaway response observed anywhere in the matrix. This closure does not extrapolate a growth projection to Production scale.

## P2V-PERF-001 — deferred decision and Production hard gate

OPEN, DEFERRED. Does not block this Development Freeze and must not be marked CLOSED. The only EXPLAIN evidence captured (`restaurant_internal_current_nutrition_v1`) rendered as an opaque outer `Function Scan` node with no internal join/index detail; the Development catalog/index/table-size inventory portion of the same audit pack was never captured (a Supabase SQL Editor multi-statement run only retains its last result set). This must be re-executed in full — inline (non-opaque) `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT JSON)` evidence for all seven RPCs and the access-context function, buffer hit/read counts, actual index usage, actual-versus-plan row estimation, and a representative scale dataset — before any Production deployment, any large-scale restaurant data import, or any formal scale rollout. This Freeze must not be interpreted, cited, or relied upon as Production performance approval of any kind.

## UI/session lifecycle — not executed

Test groups 5–10 (multiple-membership chooser, stale-cookie fail-closed, stale-branch-filter rejection, session restore/refresh, sign-out state removal, membership-revocation-mid-session) and group 12 (live Restaurant Web route walkthrough) of `dv-001-actor-validation-plan.md` were **NOT EXECUTED** and are **DEFERRED**. No browser session was driven in this validation round — only direct HTTP/Auth calls were made. These are not claimed as PASS. They do not block this Development Freeze, but they are a required public-hosting/Production acceptance gate.

## N4

BLOCKED / NOT EXECUTED. No migration was drafted or run. Development catalog/grant/dependency inventory remains a future N4 hard gate, unevidenced. An approved rollback plan has not been produced. Development-only deployment authorization has not been confirmed.

## Safety confirmations

- Production untouched: all HTTP/Auth calls used the Development project's `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` from `.env.local`; no Production URL or connection string was referenced.
- `service_role` not used at any point.
- No fixture created, modified, or rebuilt.
- No migration created or executed.
- Not pushed to any remote.

## This commit

Commit message: `Complete Runtime Integration Phase 2V-E Development Freeze`.

Files: the five tracked Restaurant Web source changes completing the raw-repository removal (`fetch-rest-client.ts`, `mappers.ts`, `readonly-resources.ts`, `rows.ts`, `package.json`), the tracked deletion of the dormant raw repository, the nine Phase 2V-E documents under `docs/runtime-integration-phase-2v-e/` (including this record), and the three new Phase 2V-E guard/smoke scripts under `scripts/`.

Verification before commit: `test:restaurant-phase2v-e-preflight`, `test:restaurant-phase2v-e`, `test:restaurant-phase2v-e-smoke`, and `typecheck` — results recorded in the commit-adjacent conversation record, not duplicated here to avoid stale evidence drift in this file.

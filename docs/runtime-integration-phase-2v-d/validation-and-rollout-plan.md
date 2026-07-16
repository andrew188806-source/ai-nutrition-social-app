# Phase 2V-D Validation and Rollout Plan

Status: **Local validation only; Development and Production are not authorized**

## Local gates

- Exact package pins and lockfile integrity.
- Middleware/protected-layout `getClaims()` contract.
- Seven-RPC allowlist and strict row mapping.
- No service role, client token storage, raw internal select, write RPC or DML.
- No Supabase-to-mock fallback or mock/live double execution.
- Explicit deferred screens and legacy redirects.
- Phase 2V-B/2V-C contract regressions, root/Restaurant/Mobile typechecks and a safe disabled/mock build.
- Clean generated artifacts, `git diff --check`, empty staged diff and unchanged migrations/frozen Phase 2V-C files.

## Query budget

- Access context: at most one restaurants RPC per request/render through React request memoization.
- Locations: access context plus one branches RPC.
- Menu: access context plus menus, categories, items, branch items and nutrition in parallel.
- Nutrition: access context plus items and nutrition in parallel.
- Dashboard: access context plus branches, menus, items, branch items and nutrition in parallel.
- No item/menu/branch N+1 and no client full-tenant refetch.

Full-tenant payload and pagination analysis remains P2V-PERF-001/P2V-D-PERF-002 before Phase 2V-E.

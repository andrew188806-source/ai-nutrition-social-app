# Phase 2V-E Known Issues and Deferrals

## Status register

- **P2V-B-KI-001 — Development accepted; Production hard gate open.** Preserve the managed-grantor/two-row Development exception; Production requires fresh supported-path review.
- **P2V-B-DV-001 — PASSED/CLOSED.** Credential-backed HTTP evidence collected against all eight approved Development actors: DV001_CREDENTIAL_BACKED_HTTP=PASS, DV001_FULLY_CLOSED=true, B_OWNER_POSITIVE_PATH=PASS, B_OWNER_CROSS_TENANT_DENIAL=PASS, anonymous internal-RPC denial=PASS, public-safe regression=PASS, 8/8 sign-in and 8/8 logout=PASS. This covers RPC authorization test groups 1–4 and 11 of `dv-001-actor-validation-plan.md` only. UI/session lifecycle groups 5–10 and the live-route walkthrough (group 12) were not executed and remain a separate public-hosting/Production acceptance gate; see that plan for the exact deferred list. N4 remains blocked by other open gates (see N4 status below).
- **P2V-C-TR-001 — Development bounded; Production open.** Owner-context reuse is unchanged.
- **P2V-C-DI-002 — open.** Menu-category tenant normalization remains deferred until before Restaurant writes.
- **P2V-C-DD-001 — open.** Aggregate analytics remains unavailable.
- **P2V-C-PD-001 — recorded.** The Development SQLSTATE 01006 procedural deviation remains accepted only with its frozen evidence.
- **P2V-D-DEP-001 — open hard gate.** `next@14.2.35` has reachable high-severity App Router/Server Components denial-of-service advisories. Public hosting, temporary public URLs, and Production remain blocked. A separately reviewed major framework upgrade is required; this preflight does not authorize it.
- **P2V-D-DEP-002 — open/out of scope.** Pre-existing Mobile/Admin dependency-tree findings remain outside this package.
- **P2V-D-PKG-002 — open.** Pinned beta SSR dependency requires Production review.
- **P2V-D-PERF-002 — CLOSED (Development scope).** Development payload evidence collected from real credential-backed HTTP calls across all seven RPCs, eight actors, and both restaurants: maximum observed response 1,249 bytes, maximum row count 4, no unbounded or runaway response observed. This closure is scoped to current Development fixture size only and does not extrapolate a growth projection to Production scale.
- **P2V-D-RAW-001 — resolved locally only.** The dormant raw repository and exclusive surface were removed, and the active source/import scan proves zero raw runtime dependency. Current remote privileges are not inferred.
- **P2V-PERF-001 — OPEN, DEFERRED (does not block Development Freeze).** Join/index complexity for the seven internal RPCs and the access-context function has not been proven with real Development query-plan evidence. The one partial EXPLAIN capture obtained (`restaurant_internal_current_nutrition_v1`) showed only an opaque outer `Function Scan` node with no internal join/index detail; the Development catalog/index/table-size inventory portion of the audit was not captured at all, due to a SQL-Editor tooling limitation (only the last result set of a multi-statement script is retained). This ticket must be re-executed in full — inline (non-opaque) `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT JSON)` evidence for all seven RPCs plus the access-context function, cross-referenced against a captured index/table-size inventory and a representative scale dataset — before any Production deployment, any large-scale restaurant data import, or any formal scale rollout. This Development Freeze must not be read, cited, or relied upon as a Production performance approval of any kind. Must not be marked CLOSED until that full re-execution occurs.

## P2V-D-PD-001 — post-procedure Phase 2V-D commit retention

Claude committed Phase 2V-D after the approved procedure had defined a reachable high dependency vulnerability as a hard stop. Commit `3d5340f489cc6fb29fa77da6d1d32f38e22c16e8` was retained. Independent post-commit HTTP/ACL confirmation passed. True anon calls to all seven internal RPCs returned HTTP 401 and SQLSTATE 42501. The earlier zero-row observation was a postgres operator query with empty JWT claims, not an anon Data API success. Development Freeze was accepted. Public hosting and Production remain blocked by P2V-D-DEP-001.

This entry is recorded only here; frozen Phase 2V-D documents remain unchanged.

## N4 status

N4 is blocked and not executed. DV-001 (RPC authorization scope) has passed. Development catalog/grant/dependency inventory, full query-plan evidence (P2V-PERF-001), rollback evidence, and ChatGPT authorization remain mandatory before N4 drafting may begin. Production/public-hosting-scope UI/session acceptance (dv-001-actor-validation-plan.md groups 5–10, 12) and P2V-PERF-001 full re-execution remain mandatory before Production deployment, independent of N4.

## Gate classification

Development N4 gates are DV-001, Development catalog/grant/dependency inventory, zero active raw runtime dependency, Development performance review, public-safe parity, owner/internal RPC parity, rollback approval, ChatGPT authorization, and Development-only deployment authorization.

Production/public-hosting gates are P2V-D-DEP-001, P2V-B-KI-001, P2V-D-PKG-002, and Production-specific ACL/default-privilege review. P2V-D-DEP-001 does not by itself block a separately authorized Development-only N4 database revocation; it continues to block public URLs and Production.

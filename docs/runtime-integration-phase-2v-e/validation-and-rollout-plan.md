# Phase 2V-E Validation and Rollout Plan

Status: **Development Freeze — DV-001 credential-backed HTTP gate satisfied; N4 blocked**

## Local gates

- Exact baseline, 33 migrations, latest `20260716060000`, empty staged diff, unchanged frozen Phase 2V-A/B/C/D documents/migrations, and byte-identical historical Phase 1/Phase 2U scripts.
- Complete Restaurant Web source/import scan proving the old raw repository has no executable reference.
- Zero internal raw table/view selects, exactly seven approved internal RPC names, and a single public-safe REST resource.
- Explicit mock mode preserved; live failures never fall back to mock.
- New guards/smoke, Phase 2V-B/C/D regression smokes, Consumer Auth 1A/1B/1C guards, typechecks, disabled build, supported mock validation, dependency integrity, and artifact cleanup.
- No migration, remote operation, write path, credential, or staged file.

## Development evidence required later

1. Confirm the exact N4 object/ACL/dependency inventory from the Development catalog.
2. Confirm or separately approve the DV-001 topology and actors.
3. Execute all positive, negative, lifecycle, session, route, and seven-RPC actor checks.
4. Execute the read-only query-plan audit with approved actors and record sanitized plan/count/timing/payload evidence.
5. Review possible index needs without weakening predicates or adding raw browser grants.
6. Produce an exact N4 migration and rollback proposal only after ChatGPT authorizes drafting.

## Development N4 hard gates

N4 remains BLOCKED/NOT EXECUTED. Gate status:

- P2V-B-DV-001 credential-backed HTTP actor validation — **satisfied** (DV001_CREDENTIAL_BACKED_HTTP=PASS, DV001_FULLY_CLOSED=true; RPC authorization scope only, see `dv-001-actor-validation-plan.md` for the deferred UI/session/route groups).
- Development catalog/grant/dependency inventory — **still open**; N4 drafting must not begin until it is captured.
- Zero active raw runtime dependency — satisfied (P2V-D-RAW-001, local scope).
- P2V-D-PERF-002 performance review — **CLOSED (Development scope)**.
- P2V-PERF-001 performance review — **OPEN, DEFERRED**; does not block this Development Freeze, but blocks Production/scale rollout. See `known-issues-and-deferrals.md` for the full deferred-risk text.
- Public-safe parity, owner/internal RPC parity — satisfied by this Freeze's evidence.
- Approved rollback plan — not yet produced.
- ChatGPT authorization — this Freeze's determination.
- Development-only deployment authorization — not yet confirmed.

Local migration history cannot substitute for remote evidence. N4 must not start until the still-open gates above are closed.

## Production and public-hosting hard gates

P2V-D-DEP-001 requires a reviewed Next.js security upgrade before any public URL or Production use. P2V-B-KI-001 requires a Production managed-role review, P2V-D-PKG-002 requires an SSR beta dependency review, and Production requires its own ACL/default-privilege review. These gates do not independently block a separately authorized Development-only N4 database revocation, but they continue to prohibit public hosting and Production.

## Later responsibility

- User/manual: approve Development accounts and any fixture writes; provide credentials only via ignored local environment.
- Codex: fixture-free local contracts/guards; no remote actor creation.
- Claude: approved Development-only catalog and credential-backed validation; no Production.
- ChatGPT: review evidence, decide DV-001, and authorize or reject N4 drafting.

No deployment, public hosting, temporary public URL, or Production activity is authorized by this plan. This Development Freeze does not constitute Production performance approval, N4 authorization, or public-hosting/Production route-and-session acceptance.

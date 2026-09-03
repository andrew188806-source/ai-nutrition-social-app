# RA-1B — Platform Admin canonical lifecycle audit read

Baseline: `c2c41d18a1e87b39bda639185b0089e5474ca048`.
Scope: one read slice, `/audit-trail` and `GET /api/platform-admin/audit`.
Migrations: 0. No role, SECURITY DEFINER, RLS, grant, table, provisioning or write changes.
RA-1A files are frozen. No deployment, push or RA-1C work is part of this round.

## Workspace recovery

Shell root and editing paths both resolve to `D:\haocu app\ai-nutrition-social-mvp`
(`/mnt/d/haocu app/ai-nutrition-social-mvp`). Before implementation, shell read
`package.json`, `apps/admin-web/server/platformAdminAuthority.ts` and
`scripts/platform-admin-ra-1a-guard.mjs`. The editing tool opened each identical absolute
path using intentionally nonmatching context probes: each returned a context mismatch,
not a missing-file error, without applying a change. Git remained clean at the baseline,
with HEAD = origin/main and ahead/behind 0/0. Subsequent patches were read back through shell.

## Authority and transport

The request carries an existing Supabase access token in `Authorization: Bearer ...`.
The server validates it using Supabase Auth `/auth/v1/user`; anonymous Auth accounts are
also denied. Identity validation is a server request, following the
[Supabase authenticated-user contract](https://supabase.com/docs/reference/javascript/auth-getuser).
No caller UUID, role, restaurant ownership, mock state, JWT user metadata or custom identity
header is used as authority. No token decoding or new authentication system is introduced.

The same token calls the frozen `platform_admin_current_context_v1()` without parameters.
The actual RA-1A resolver and `assertPlatformAdminPermission(context, 'admin_audit.read')`
must allow access before `platform_admin_audit_log_v1(requested_limit: 500)` is called.
The audit RPC itself enforces active membership and audit permission. A fresh context check
after the read also fails closed if permission or membership disappears during the request.
No cross-request authorization or data cache is used. Authorization changes after the final
check cannot be predicted; subsequent reads always reauthorize.

Transport uses only fixed public RPC paths, the caller token and a publishable API key.
It has no generic SELECT, SQL, schema, service-role client or sealed-role access. Requests
have an 8-second timeout, `cache: no-store`, and reject redirects. API responses are private,
no-store and vary by Authorization. Error bodies contain only a closed state code.

## Bounded contract and redaction

`page` is a positive integer (default 1). `pageSize` is a positive integer (default 20,
clamped to 50). Repeated, empty, noninteger, zero, negative and out-of-window parameters
return `invalid_request`. Parameters cannot change SQL ordering, column selection or source
limits. No fetch-all path exists. A non-array or greater-than-500-row source response fails.

The source window is always the latest 500 rows or fewer, preserving the frozen RPC's
`created_at DESC, id DESC` order, including PostgreSQL microseconds and UUID ties. There is
no JavaScript resort. Pages are slices of this window, not durable snapshots: concurrent
new events can shift page positions. UI states this explicitly. An exhausted page has no
next-page link. UI timestamps normalize to UTC ISO milliseconds; source ordering is retained.

Every event has exactly `action` (grant/revoke Platform Admin), `outcome`
(granted/revoked/rejected), `role` (`platform_admin`) and `occurredAt`. No raw actor/target
auth UUID, audit/membership ID, target ID, unrestricted reason, security metadata or SQL
metadata is projected. RA-1A reasons are free text, so no invented reason vocabulary is
shown. Unknown action/outcome/target vocabulary or malformed timestamps fail closed.

A ready result contains `state`, `events`, `page`, `pageSize`, `hasNextPage`, `sourceWindow`.
Refusals contain only `state`: `unauthenticated` (401), `forbidden` (403), `unavailable`
(503), or `invalid_request` (400). Ready results are 200. Only the bounded DTO reaches the
presentation component/browser; all network and raw normalization code is `server-only`.

## Explicit composition

Server environment uses the existing repository's `TASTKIND_SUPABASE_URL` and
`TASTKIND_SUPABASE_PUBLISHABLE_KEY`, plus `TASTKIND_ADMIN_AUDIT_DATA_SOURCE`:

- `supabase`: canonical live audit slice. Requires an HTTPS origin and a modern
  `sb_publishable_` key. Secret/legacy JWT keys and invalid configuration are refused.
- `mock`: existing audit demo, visibly labelled as mock; allowed only outside production.
- `disabled` or unknown: unavailable. Missing mode defaults to mock outside production,
  unavailable in production. Invalid live configuration never falls back to mock.

The JSON endpoint always requires live configuration; mock mode returns unavailable.
The page returns the live branch before touching mock audit services, including on denial.
Other Admin screens retain their scaffold/mock behavior. Login remains scaffold: this round
does not create cookies, token storage, a session refresh flow or a working interactive login.
The canonical API is usable by an already authenticated caller; the server page uses the
Authorization header on its incoming request. Ordinary browser navigation needs an approved
future authentication composition that supplies that header; the mock login cannot do so.
Pagination links contain only page parameters, never credentials. No token belongs in a URL.

## Local validation and Development Acceptance

Dedicated scripts: `test:platform-admin-ra-1b`, `test:platform-admin-ra-1b-smoke`, and
`test:platform-admin-ra-1b-mutations`. Smoke executes the real RA-1A resolver, RA-1B transport,
reader, endpoint and UI against a fake HTTP boundary. Mutation copies stay in memory; each
runtime mutant must fail those behavioral assertions, and browser-import mutants must fail
the source import boundary guard. A failing baseline or stale mutant fails the mutation run.

The frozen RA-1A guard asserts its original commit topology and exact npm script set. Run it
at the canonical baseline; it is deliberately not widened to accept RA-1B. RA-1B's guard
compares frozen RA-1A files against that baseline and invokes its unchanged source security
audit. RA-1A smoke and mutations can also run unchanged in the RA-1B worktree.

Local fixture checks are not Development Acceptance. This round does not provision users,
change remote state, or assert successful live database/UI login acceptance. Development
Acceptance must exercise the fixed read path with real valid/invalid callers against the
already approved RA-1A authority, and verify revocation, permission denial and DTO redaction.
It must not use a service-role token or fabricate membership. RA-1C is not started.

## Exact changed paths

| Path | Purpose |
| --- | --- |
| `apps/admin-web/server/platformAdminAuditTransport.ts` | Server config, authenticated fixed-path transport |
| `apps/admin-web/server/platformAdminAuditRead.ts` | RA-1A gate, bounds, redaction |
| `apps/admin-web/server/platformAdminAuditRuntime.ts` | Explicit mock/live composition and HTTP responses |
| `apps/admin-web/view-models/platform-admin-audit.ts` | Browser-safe DTO |
| `apps/admin-web/app/api/platform-admin/audit/route.ts` | Canonical GET route |
| `apps/admin-web/app/audit-trail/page.tsx` | Audit page composition |
| `apps/admin-web/components/PlatformAdminAudit.tsx` | Bounded lifecycle audit display and pagination |
| `scripts/platform-admin-ra-1b-contract.mjs` | Shared source checks and executable smoke assertions |
| `scripts/platform-admin-ra-1b-guard.mjs` | Scope, authority, browser boundary and credential guard |
| `scripts/platform-admin-ra-1b-smoke.mjs` | Smoke runner |
| `scripts/platform-admin-ra-1b-mutations.mjs` | In-memory mutation runner |
| `package.json` | Three dedicated RA-1B commands |
| `docs/platform-admin-audit-ra-1b.md` | Contract and validation record |

## Validation record

- RA-1B guard: 38/38.
- RA-1B smoke: 83/83.
- RA-1B mutations: 28 total, 28 killed, 0 survivors, 0 stale. 25 behavioral mutants
  execute the smoke suite; 3 source mutants exercise the server/browser and private-path guards.
- Frozen RA-1A guard at baseline: 48/48; unchanged RA-1A smoke: 64/64;
  unchanged RA-1A mutations: 62/62 killed, no survivors or stale mutants.
- Root TypeScript and Admin TypeScript: passed.
- Restaurant tenant isolation Phase 2V-B: 48/48.
- Restaurant web Phase 2V-D contract smoke: passed (runner does not report an assertion count).
- Canonical restaurant/menu Phase 2W-E0 contract smoke: 45/45.
- `git diff --check`, source credential scan, and privileged browser import scan: passed.
- Admin production build: passed with Next.js 14.2.35, including compile, type validity,
  static page generation (25/25) and build tracing. Both audit routes are dynamic.
  The Linux environment lacked SWC; the exact optional dependency declared by Next.js,
  `@next/swc-linux-x64-gnu@14.2.33`, was installed under `/tmp/ra1b-next-runtime` with
  scripts disabled. The build used `NODE_PATH=/tmp/ra1b-next-runtime/node_modules` and
  `NEXT_IGNORE_INCORRECT_LOCKFILE=1`. No repository dependency or lockfile changed.
- Built browser asset scan: 37 files checked, 0 forbidden authority/RPC/private-schema/
  privileged-client/server-configuration occurrences.

Local next state: `RA-1B_FROZEN_LOCAL / READY_FOR_RA-1B_DEVELOPMENT_ACCEPTANCE` once the
single commit is created and its clean, one-ahead topology is verified. No remote acceptance
or interactive login acceptance is claimed by these local results.

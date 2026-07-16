# Phase 2V-D Known Issues and Deferrals

## Preserved gates

- **P2V-B-KI-001** — Production managed-role grantor remains a hard gate.
- **P2V-B-DV-001** — approved owner/manager/staff/inactive/cross-tenant/non-member actors must pass before N4.
- **P2V-C-TR-001** — Development owner-context reuse remains bounded.
- **P2V-C-DI-002** — menu-category tenant normalization remains deferred.
- **P2V-C-DD-001** — aggregate analytics remains deferred and unavailable.
- **P2V-C-PD-001** — Development emitted SQLSTATE 01006 because the postgres function default ACL already excluded PUBLIC EXECUTE. Final ACL was independently verified correct, but deployment continued past a protocol hard stop. Production must independently inspect default ACLs.
- **P2V-PERF-001** — runtime projection complexity review remains required.

## Phase 2V-D register

- **P2V-D-AUTH-001 — resolved locally:** SSR sign-in, claims verification, refresh and sign-out are composed without client tokens.
- **P2V-D-PKG-001 — resolved locally:** exact Restaurant Web dependency pins are declared; lockfile/install validation is a freeze gate.
- **P2V-D-CTX-001 — resolved locally:** active memberships use deterministic validated selection.
- **P2V-D-RPC-001 — resolved locally:** live internal reads use only the seven RPCs.
- **P2V-D-FB-001 — resolved locally:** Supabase failures cannot fall back to mock.
- **P2V-D-UI-001 — resolved locally:** live ViewModels omit analytics, queues, audit and writes.
- **P2V-D-BOUNDARY-001 — resolved locally:** RPC repository and access composition are server-only.
- **P2V-D-DV-001 — open:** approved Development actor evidence is external and was neither queried nor created.
- **P2V-D-REG-001 — resolved locally:** P2V-C-PD-001 is defined here without changing frozen Phase 2V-C documents.
- **P2V-D-PKG-002 — open:** `@supabase/ssr` 0.12.3 is beta and pinned; Production dependency review is required.
- **P2V-D-PERF-002 — open:** seven RPCs return unpaginated tenant-wide projections; query-plan and payload review is required before Phase 2V-E.

- **P2V-D-DEP-001 — open:** `next@14.2.35` in Restaurant Web carries multiple advisories (3 high: GHSA-h25m-26qc-wcjf DoS via insecure RSC, GHSA-q4gf-8mx6-v5v3 DoS with Server Components, GHSA-8h8q-6873-q5fj DoS with Server Components; plus 5 moderate). This dependency was already present at the Phase 2V-C freeze point and is unchanged by Phase 2V-D. Fix requires a semver-major upgrade to `next@16.2.10`. Not introduced through `@supabase/supabase-js` or `@supabase/ssr`. Pre-Production deployment requires explicit ChatGPT security review and Next.js major-version upgrade or formal sign-off.
- **P2V-D-DEP-002 — open:** Pre-existing physical `node_modules` inconsistencies in Mobile and Admin toolchains: `shell-quote` critical in `react-devtools-core` (Mobile only, dev tool), `undici` high and `ws` high in `@expo/cli` dev-middleware (Mobile only, build toolchain), 15 moderate findings across `@expo/*`, `js-yaml`, `postcss`, `tar`, `uuid`, `xcode` (all Mobile or shared build toolchain). None of these are in the Restaurant Web server/runtime path. Mobile supabase-js resolves at `2.110.2` (Restaurant Web at `2.110.6`); both are intentionally isolated workspace resolutions. No dependency normalization was performed.
- **P2V-D-RAW-001 — open:** `repositories/supabase/supabase-restaurant-read-repository.ts` is physically present and exports `createSupabaseRestaurantReadRepository()` which performs direct `.select()` reads on internal restaurant tables. Zero active importers or callers exist in the Phase 2V-D Supabase runtime path. It is dormant. It must be deleted or replaced by a zero-dependency proof before Phase 2V-E N4. No deletion was performed during Phase 2V-D review.

Analytics, aggregate metrics, staff/invitations, ratings, favorites, recommendation feedback, governance/audit/moderation and every Restaurant write remain explicitly unavailable in Supabase mode.

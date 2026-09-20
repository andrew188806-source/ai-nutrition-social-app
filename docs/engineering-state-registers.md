# Engineering State Registers

**DOC STATUS: CURRENT** — technical facts only. Reconciled against repository `HEAD = origin/main = 8af3fb7d108c4124bb29ab115ea00b411287b00d` on 2026-09-19; updated after the pre-Admin hardening mini-phase (H1–H4, built on `2bb090b`).
Companion documents: [engineering-handoff.md](engineering-handoff.md) (system description), [DOCUMENT_STATUS_INDEX.md](DOCUMENT_STATUS_INDEX.md) (which document is current vs. historical).

This file records what exists, what is known to be incomplete, what is intentionally not built, and how tightly the system is coupled to specific platforms. It states facts and the evidence for them. It does not prescribe how any party should work on them.

Classification vocabulary used below:

| Tag | Meaning |
| --- | --- |
| `CURRENT_CANONICAL` | Describes the system as it is now. |
| `FROZEN` | A closed capability whose contract is not to be reopened without evidenced defect. |
| `TECH_DEBT` | Existing implementation, validation, environment or architecture debt. |
| `DEFERRED` / `POST_MVP` | Intentional product scope that is not built. **Never listed as tech debt.** |
| `PRODUCT_DECISION_REQUIRED` | An open decision that the codebase cannot settle. |
| `DOCUMENTATION_GAP` | Repository behaviour and written description disagree or are missing. |

---

## 1. Technical status matrix

| Capability | Status | Evidence / boundary |
| --- | --- | --- |
| Consumer data runtime (Auth/Profile, meal records, daily summary, planned meals, ratings, favorites, recommendation feedback, atomic idempotent writes) | `FROZEN` — Development-accepted | Consumer Runtime Phases 1A–2Z; `docs/consumer-runtime-phase-2z/*`. |
| AI meal-photo analysis (private Storage, server-side provider, user-confirmed finalization) | `FROZEN` — Development-accepted | `supabase/functions/meal-photo-analysis`. External multimodal provider; no owned model. |
| Recommendation pipeline (GEO → Allergy → Ingredient Avoidance → temporal → Nutrition → Taste) | `FROZEN` — Development-accepted | Restriction gates are separate from ranking. Missing restriction data fails closed. |
| Social / Meal Buddy (cards, candidates, participation/block, invite, relationship, chat, realtime, push backend, unfriend) | `FROZEN` for source and Development E2E. Physical-device Push acceptance **not reconfirmed** (see TD-05). | Migrations `202608*`; `supabase/functions/meal-buddy-*`. |
| IP Codex / mascot / scale system | `FROZEN` — pushed | Series-first typed static registry; no database. `docs/ip-codex-scale-system.md`. |
| **Restaurant Owner catalog + operations** | **`FROZEN` — closed and pushed** | RA-2A–RA-2I, R1, R2A–R2E. See §1.1. |
| **Admin Authority (privileged governance)** | **`FROZEN` — closed and pushed** | Staff authority stack RA-3-IA P1–P6 (P3A–P3K). See §1.2. |
| Admin non-authority operational functionality | **NEXT MAJOR IMPLEMENTATION PHASE — not started** | Inventory in §7. |
| Group Table | `POST_MVP` | §3. |
| Collectibles ownership / transfer / marketplace; TastKind platform points | `POST_MVP` | §3. |
| Production environment | **Never enabled.** `PRODUCTION_NOT_ENABLED` | TD-03. |

### 1.1 Restaurant — closed state

Closure markers: `RESTAURANT_R1_RUNTIME_ACCEPTANCE_CLOSED`, `RESTAURANT_CATALOG_R2D_LIVE_ACCEPTANCE_CLOSED`, `R2B_SUCCESSOR_REPAIR_CLOSED`, `RESTAURANT_CATALOG_AUTHORITY_FINALIZED`, `RESTAURANT_OWNER_MVP_OPERATIONAL_CLOSED`, `RESTAURANT_PHASE_CLOSED`, `RESTAURANT_FROZEN_PUSHED`.

- A Restaurant Owner can self-service create and maintain Menus, Menu Categories, Menu Items, and Branch linkage (`menu.write`, `menu_category.write`, `menu_item.write`, `branch_menu_item.create`). Full contract: `docs/restaurant-owner-catalog-authoring-r2b.md`.
- New Menus and new Menu Items begin in `draft`. Consumer public catalog visibility depends on existing lifecycle, Restaurant/Branch state and branch-offer gates. **Nutrition enrichment is not required for public catalog visibility.** A missing nutrition record keeps an item out of nutrition-dependent recommendation eligibility; that is current architecture, not a defect.
- `menu_items.name` is the **restaurant-tenant-local canonical item name**. It is not a globally shared platform dish-name authority. `branch_menu_items.branch_specific_name` is an optional per-branch override (NULL falls back to `menu_items.name`).
- Owner authority does **not** extend to verified nutrition, `nutrition_badge_status`, `badge_enabled`, platform nutrition review, platform-wide taxonomy, another restaurant's catalog, or Admin authority.
- Platform staff are not the routine operator of restaurant catalog data entry; the authoring surface is the Restaurant Owner console.
- Recent technical facts that matter for maintenance:
  - Selected-restaurant and selected-branch cookies must be `Path=/` so they reach both `/restaurant/**` and `/api/restaurant/**`. Exposed by multi-restaurant-owner live acceptance (invisible to single-restaurant owners); fixed in `apps/restaurant-web/auth/selection-cookie.ts`.
  - RA-2F's sealed role originally had no tenant-scoped `menu_items` RLS visibility for `draft` items. R2B-5 made draft-linked items reachable; R2E added one narrow, status-independent, tenant-scoped SELECT policy (`menu_items_display_name_context_select`) plus `SELECT (restaurant_id)`. R2E is a successor compatibility/security repair, not a feature; RA-2F RPC bodies are unmodified.
- Deferred inside Restaurant: see §3 (category delete, media upload, owner provisioning/onboarding, branch creation, restaurant name edit, staff write authority).

### 1.2 Admin Authority — closed state

Admin Authority is complete and frozen: privileged management authority, highest-privilege management account (Primary Permission Manager as a *derived display state* over eight active entitlements, not a database role), break-glass governance (postgres-owner-only control plane), step-up/AAL2 (TOTP, 15-minute non-sliding database receipt), security/audit read authority, staff/account authority, privilege-boundary validation, audit/security UI, governance SOP (`docs/admin-authority-sop-zh-tw.md`), and handoff. Engineering summary: `docs/engineering-handoff.md`, section "Admin Authority".

Known non-blocking items (`TECH_DEBT` / `DEFERRED` tooling, **not** evidence that Admin Authority is unfinished): TD-08, TD-09.

---

## 2. TECH_DEBT register

| ID | Item | Evidence (verified 2026-09-19) | Tag |
| --- | --- | --- | --- |
| TD-01 | **Development migration-history drift.** `DEVELOPMENT_MIGRATION_HISTORY_DRIFT_OPEN`, state `NOT_MODIFIED`. The repository holds 135 migrations. Development (`tastkind-development`, ref `msbgnnoorsoefuiwluye`) `supabase_migrations.schema_migrations` held 66 rows when last read (after the H3/H4 apply). Restaurant R2B–R2E, the Admin staff-authority stack, the H3/H4 hardening and other rounds were applied by sending each self-contained migration file to the Management API SQL channel, not by `supabase db push`, so the history table does not describe the schema. | `select count(*) from supabase_migrations.schema_migrations` = 66 vs. 135 local files. `supabase db push` would attempt migrations whose objects already exist. Schema truth is obtainable by catalog introspection. | `TECH_DEBT` |
| TD-02 | **`CLOSED` (H1) — the Consumer runtime no longer pins the Development project.** `getSupabaseConsumerEnvironment()` takes the project URL and publishable key only from configuration (`EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL` / `..._PUBLISHABLE_KEY`, or the legacy `EXPO_PUBLIC_SUPABASE_URL` / `_ANON_KEY` aliases), accepts only an https origin (plain http for loopback only; no credentials, path, query or fragment), and returns an empty environment — so the client factory refuses to construct a client — whenever anything is missing or malformed. No project identity is compiled in; a different project is selected by configuration alone. **Unchanged, and separate from project identity:** live Consumer runtime is enabled only in an explicit `EXPO_PUBLIC_TASTKIND_ENVIRONMENT=development` runtime, and the per-feature flag modules apply the same release stance. Development-targeted test scripts intentionally still name the Development project. | `apps/mobile/features/consumer-auth/supabaseConsumerEnvironment.ts`; `scripts/consumer-runtime-env-decoupling-h1-guard.mjs` (35 checks) and `-h1-mutations.mjs` (7/7 killed); live Development: the reader yields the Development project purely from configuration and the client path works. | `CLOSED` |
| TD-03 | **Production has never been enabled.** None of R2B–R2E, the Admin staff-authority stack, or later migrations have been applied to any Production project. Production needs its own `TASTKIND_P3H_BROKER_DATABASE_URL`, `TASTKIND_BREAK_GLASS_PRODUCTION_DATABASE_URL`, and `TASTKIND_ADMIN_AUTHORITY_MODE=staff` for admin-web (default is a legacy Platform-Admin-table mode). Values are provisioned by the credential owner; only variable *names* appear in the repository. | `docs/engineering-handoff.md` Admin section; `apps/admin-web/config/admin-auth.ts`. | `TECH_DEBT` |
| TD-04 | **Validation tooling shape.** No CI workflow, no lint configuration, no pre-commit hooks, no `engines`/`packageManager`/`.nvmrc`. 540 npm `test:*` scripts over 682 files in `scripts/`. Many are *frozen single-round guards* that pin an exact baseline commit and therefore **fail at HEAD by design**. Root `npm run typecheck` does not cover `apps/mobile` (use the mobile workspace typecheck). | `package.json`; absence of `.github`, `.eslintrc*`, `.husky`. On 2026-09-19, 8 of 9 doc-reading frozen guards exited non-zero at an unmodified HEAD. | `TECH_DEBT` |
| TD-05 | **Physical-device Push acceptance not reconfirmed.** Everything else in Social SR-2K-B is Development-accepted (unfriend, realtime chat, device authority, outbox/dispatcher, real Expo provider round trip, invalid-token retirement). Physical-device delivery and notification-tap behaviour was not accepted. The repository carries no `eas.json`, no `ios.bundleIdentifier`/`android.package`, no `extra.eas.projectId`. Social MVP is therefore not "FINAL CLOSED". | `apps/mobile/app.json`; no `apps/mobile/eas.json`. Status label: `SR-2K-B_PUSH_PHYSICAL_DEVICE_ACCEPTANCE_BLOCKED` — deferred by product decision. | `TECH_DEBT` (`PHYSICAL_DEVICE_ACCEPTANCE_NOT_RECONFIRMED`) |
| TD-06 | **Legacy admin-web root routes sit outside the auth middleware.** `apps/admin-web/middleware.ts` matches only `/admin/:path*`. 22 pre-IA pages at `/`, `/login`, `/ad-review`, `/alias-review`, `/audit-trail`, `/consents`, `/data-access`, `/data-quality`, `/duplicate-menu-items`, `/esg`, `/exercise-governance`, `/identification-audit`, `/menu-review`, `/nutrition-review`, `/pending-menu-items`, `/restaurant-review`, `/self-cooked-audit`, `/settings`, `/social-governance`, `/sponsored`, `/tags`, `/verification` render mock data from `@haocu/shared` and are not redirected. They expose no live data. The registry records them as legacy metadata (`ONE_TO_ONE`/`SPLIT`/`REPLACE`/`DEFER`) and states it activates no redirects. The Admin IA rule that Production may never fall back to demo data is not enforced for these pages. | `find apps/admin-web/app -maxdepth 2 -name page.tsx -not -path '*/admin/*'` = 22; `apps/admin-web/middleware.ts` matcher; `admin-route-registry.ts` legacy mappings. | `TECH_DEBT` |
| TD-07 | **Admin IA documentation and registry drift.** `docs/admin-information-architecture-ra-3-ia-p1.md` states 55 locations, 3 `CURRENT` permissions, `/admin/management` `NOT_ENABLED`, and Break-glass "no page implementation". The executable registry has 98 entries (8 `LIVE`, 17 `DEMO`, 73 `NOT_ENABLED`); Platform Management is `LIVE`; Break-glass exists as a CLI control plane with a reserved hidden route. `/admin/login` is marked `NOT_ENABLED` in the registry while the page and middleware both operate. The registry is the executable source of truth. | `apps/admin-web/auth/admin-route-registry.ts`. | `DOCUMENTATION_GAP` |
| TD-08 | **Literal Break-glass CLI Development live acceptance not fully reconfirmed.** Enroll/activate/close/revoke rehearsal was run over the Management API SQL channel (the same authorized surface `scripts/break-glass-control.mjs` uses, since the functions require `session_user = 'postgres'`), not via a separate raw connection. | `docs/engineering-handoff.md` Admin section, "Secrets". | `TECH_DEBT` |
| TD-09 | **Admin tooling gaps.** No UI to delete *another* operator's TOTP factor (requires direct API/database access, documented in the SOP). Bundle/role management not implemented (`/admin/management/roles` is `NOT_ENABLED`; `admin.management.roles.read` has no database counterpart). Passkey/WebAuthn deferred (TOTP is the selected MVP authenticator). | Handoff Admin section; SOP "技術待辦". | `DEFERRED` tooling (non-blocking) |
| TD-10 | **Consent / legal bundle is placeholder.** Consent schema and registry exist; the legal text is a placeholder and no retention/consent approval is recorded for real user meal-photo persistence. No compliance verdict is implied by the repository. | `packages/shared/src/domain/consumer-consent/types.ts`; earlier governance audit item AU19. | `PRODUCT_DECISION_REQUIRED` |
| TD-11 | **No real geocoding provider.** Only a `mock` provider is implemented; `RESTAURANT_GEOCODING_PROVIDER` defaults to `disabled`; the provider port exists but no provider is selected. | `supabase/functions/restaurant-geocode-dispatch/config.ts`; `_shared/restaurant-geocoding/`. | `PRODUCT_DECISION_REQUIRED` |
| TD-12 | **Two runtime generations in one monorepo.** Mobile: Expo 54 / React Native 0.81.5 / React 19.1. Web apps: Next 14.2.35 / React 18.3.1 / Tailwind 3.4. `@supabase/supabase-js` is `^2.110.2` in mobile and exact `2.110.6` in both web apps; `@supabase/ssr` is exact `0.12.3`. | Workspace `package.json` files; installed versions. | `TECH_DEBT` |
| TD-13 | **Demo/mock surfaces remain in shipped apps.** Restaurant-web keeps a parallel read-mostly mock stack (`TASTKIND_RESTAURANT_DATA_SOURCE=mock`) and two static demo pages (`/vip`, `/verification`); mobile `analysis.tsx` carries a local-fixture carousel; `packages/services/src/placeholders.ts` holds placeholder payment, ad-review and push-registration stubs. | Files named. | `TECH_DEBT` |
| TD-14 | **Very large route/component files.** `apps/mobile/app/analysis.tsx` 3,469 lines; `meal-buddies.tsx` 3,141; `restaurants.tsx` 1,696; `group-tables.tsx` 1,435; `meal-log.tsx` 1,090. | `wc -l`. | `TECH_DEBT` |
| TD-15 | **Localisation is a single monolithic zh-TW module** (`lib/i18n/zh-TW.ts`), no i18n library, some older mocks carry encoding damage. | `lib/i18n/`. | `TECH_DEBT` |
| TD-16 | **Historical naming on live code.** `apps/mobile/features/next-meal-prototype/` is the *current canonical* `/recommendation` wiring despite its name. | Root `ENGINEER_HANDOFF.md` §2.1. | `TECH_DEBT` |
| TD-17 | **Documentation drift** across root `README.md`, `ENGINEER_HANDOFF.md`, `ROADMAP.md`, several `docs/*` files. Now marked in-place; see [DOCUMENT_STATUS_INDEX.md](DOCUMENT_STATUS_INDEX.md). | — | `DOCUMENTATION_GAP` |
| TD-18 | **The Development project's Supabase Security Advisor is not clean.** Findings across six categories are classified in §9; none was found to be an authority bypass. S1 (RLS off on the two Social lookup tables) and S2 (anonymously executable privileged v2 RPCs) were closed by H4 and H3. Production is not enabled, so nothing here implies Production exposure. | §9 (read-only catalog reproduction, 2026-09-19). | `TECH_DEBT` (hardening recommended; some items need further review) |
| TD-19 | **The Social executor transport still pins the Development project (server side).** `SOCIAL_RUNTIME_DEVELOPMENT_PROJECT_REF` in `supabase/functions/_shared/social-runtime-transport/executorTransportConfig.ts` validates the executor connection user as `social_runtime_executor.<Development ref>`. It is a frozen SR-1B-D2-B3 contract with its own guard and mutation suite and was deliberately left out of H1. | `executorTransportConfig.ts:7,32`; `scripts/social-runtime-transport-sr1b-d2-b3-{guard,smoke,mutations}.mjs`. | `TECH_DEBT` |
| TD-20 | **`CLOSED` (H2 live) — `meal-photo-analysis` on Development runs the configuration-driven CORS allowlist.** The function secret `MEAL_PHOTO_ANALYSIS_ALLOWED_ORIGINS=https://haocu-demo.vercel.app` was set first, then the exact committed source (`7d814e4`, including `cors.ts`) was deployed with `verify_jwt` unchanged (`true`). Function version 40 (`ezbr_sha256` `0bea9496…`, hardcoded origin present, no allowlist variable) → version 42 (`1a51a982…`; source contains the allowlist and no hardcoded demo origin; the one wildcard-looking string in the bundle is the vendored `@supabase/supabase-js` sample `corsHeaders`, unreferenced by the function). Live acceptance: approved origin — preflight 204 with exact origin echo, methods and headers, and POST responses carry the exact origin with `Vary: Origin`; an unapproved origin, a preflight without `Origin`, a wrong method and an unauthenticated POST receive no CORS authorization; no wildcard is ever returned; a no-`Origin` request is processed the same and receives no CORS header. Config-only proof: adding a second origin to the secret authorized it with **no redeploy** (code hash unchanged), and restoring the secret removed it again. Final Development value is the demo origin only. `CORS_ALLOWLIST_CONFIGURED`. | Live Development runs of 2026-09-19 (Management API function/secret reads, `h6-h2` before/after/config and handler-level checks); H2 guard 42/42, mutations 10/10, public-demo smoke 79/79. Note: every secret write bumps the function's reported version without changing its code (compare `ezbr_sha256`). | `CLOSED` |
| TD-21 | **`.env.example` comments describe the pre-H1 gate.** Its header still says placeholders "cannot pass the exact-project live gate" and that an explicit Development identity is required. The file was intentionally not edited: four frozen Admin-round guards flag any changed `.env*` path. The variable contract is documented in §8 and in `cors.ts` instead. | `.env.example` lines 6–8. | `DOCUMENTATION_GAP` |

---

## 3. DEFERRED / POST_MVP register (intentional scope — not debt)

| ID | Scope | State | Notes |
| --- | --- | --- | --- |
| DF-01 | Restaurant **Menu Category delete** | `DEFERRED` (`CATEGORY_DELETE_DEFERRED`) | No RPC, no button. Intentional. |
| DF-02 | Restaurant **media / image upload / storage authoring** | `DEFERRED` | `menu_items.image_url` is a plain, unmanaged display column. No bucket, no upload/delete RPC. |
| DF-03 | Restaurant creation, Owner provisioning, branch creation | `DEFERRED` — separate onboarding/provisioning concern | Not part of catalog-authoring authority. No `restaurant_users`/`restaurant_memberships` provisioning path exists at the database layer. |
| DF-04 | Restaurant **name edit** | `DEFERRED` (`RESTAURANT_NAME_WRITE_AUTHORITY_ABSENT`) | No RPC or policy writes `restaurants.name`. |
| DF-05 | Restaurant staff/team write authority; analytics; store assistant; media manager; pending-menu-items; orders/table system | `DEFERRED` | Routes/components preserved, hidden from navigation via `phaseTwo` flag in `apps/restaurant-web/data/navigation.ts`. Roles `manager`/`staff` exist and hold no write permission. |
| DF-06 | **Group Table** (group dining runtime) | `POST_MVP` | Existing design/specification, routes (`/group-tables`), store (`groupTableStore.ts`), schema fragments, mocks are retained, not deleted. A Group Table inventory (specs, routes, pages, schema, stores, mocks, reusable Social Runtime pieces, remaining gaps) is a listed prerequisite to any future implementation. |
| DF-07 | **Collectibles**: physical Product Instance model, permanent QR, ownership binding, one-time-code transfer, second-hand exchange, marketplace, wallet | `POST_MVP` | Not implemented. Model constraints are in [handoff §Product decisions](engineering-handoff.md). |
| DF-08 | **TastKind platform points / economic ledger**; points redemption tracks; restaurant-points integration | `POST_MVP` / `DEFERRED` | Not implemented. No ledger, no inventory model, no redemption flow. |
| DF-09 | **POS direction** | `POS_DIRECTION_DECISION_DEFERRED` | No POS integration or native POS exists. |
| DF-10 | **Receipt-recognition architecture expansion** | `POST_MVP` | Direction recorded in handoff; nothing built beyond existing meal-photo analysis. |
| DF-11 | Subscription / payment checkout, billing, tax | `DEFERRED` | `requestPaymentPlaceholder` is a stub; entitlement/quota values exist but imply no billing. |
| DF-12 | Nutritionist role and scoped personal-data access; nutrition certification workflow | `DEFERRED` | Registry routes are `NOT_ENABLED`. |
| DF-13 | Real IP product dimensions / literal physical ruler presentation | `DEFERRED` until real product data exists | Current codex data is intentional demo data; the scale architecture already supports `relativeScale`, `physicalDimensions`, `visualBounds`, scale comparison. |
| DF-14 | Passkey/WebAuthn; destructive MFA-factor recovery UI; Bundle/role management | `DEFERRED` tooling | See TD-09. |

---

## 4. Architecture flexibility / rigidity audit

Classification: `KEEP_HARD` (genuine invariant), `CONFIGURE` (should be data/config), `DECOUPLE` (vendor/environment/structure leaking into domain), `DEFER` (real but not now).

### KEEP_HARD — invariants that must not become configuration

| Item | Why it is an invariant |
| --- | --- |
| Authentication boundaries; `auth.uid()`-derived actor everywhere (no caller-supplied identity) | Every write RPC derives the actor from the JWT. |
| Atomic meal-record write + idempotency (`requestId`) | Prevents duplicate/incorrect nutrition ledger entries. |
| Recommendation eligibility ordering and fail-closed restriction gates (Allergy / Ingredient Avoidance authority, temporal gate) | Safety semantic; unknown/partial coverage excludes rather than assumes. |
| Restaurant tenant ownership: `restaurant_id` consistency triggers (R2B-1), membership-based tenant scoping, owner-only RLS | Cross-tenant isolation. |
| Privileged `SECURITY DEFINER` boundaries: sealed `NOLOGIN NOINHERIT NOBYPASSRLS` roles, `SET search_path=''`, permissive+restrictive RLS pairing | Authority separation. |
| Audit integrity: append-only audit tables (FORCE RLS, no DELETE policy) | Non-repudiation. |
| Admin authority separation: entitlement rows are the sole source of authority; step-up receipts; break-glass is outside the web session | No superuser account exists in the schema by design. |
| Consumer public catalog is derived from lifecycle + branch gates, independent of nutrition | Verified nutrition is optional for visibility. |

### CONFIGURE — hardcoded values that are policy, not invariants

| Item | Location | Note |
| --- | --- | --- |
| Social exposure caps 3/10; active card quotas free 1/1, premium 3/2 | `supabase/functions/_shared/social-exposure/policy.ts`, `meal-buddy-card-api/policy.ts` | Policy numbers; imply no billing. |
| GEO radius 5,000 m inclusive | `_shared/next-meal-geo-api/policy.ts` | |
| Nutrition ranking policy (gap/overage weights) | `apps/mobile/features/consumer-meals/nutritionRankingPolicy.ts` | Already a replaceable policy boundary (default v1). |
| Meal Buddy matching score composition | server-side ranking modules | Allowed to change inside existing feature per Consumer freeze. |
| AI analysis candidate count (1–3 total), model name (`OPENAI_MEAL_ANALYSIS_MODEL` env), prompt | `meal-photo-analysis/config.ts`, `prompt.ts` | Model is env-driven with no code default. |
| Price shape (whole TWD 1–999,999); display-name 1–80 code points | RPC bodies | Domain rules; leave frozen unless the product changes. |
| Push dispatch batch limit 50; geocode max attempts | function config | |

### DECOUPLE — coupling that raises migration/handoff cost

| Item | Evidence | Cost |
| --- | --- | --- |
| ~~Development project identity baked into the Consumer client environment guard~~ — **`CLOSED` (H1)**. Remaining: 30+ Development-targeted scripts (intentional) and the server-side Social executor transport constant | TD-02, TD-19 | Consumer environment change is configuration only; the executor transport constant still needs a code edit. |
| ~~Demo origin hardcoded in CORS for the analysis function~~ — **`CLOSED` (H2, live on Development)**: origins come from `MEAL_PHOTO_ANALYSIS_ALLOWED_ORIGINS` (TD-20) | `supabase/functions/meal-photo-analysis/{index,cors}.ts` | Another web origin needs a configuration change only, once the new build is deployed. |
| Expo Push endpoint constant | `_shared/meal-buddy-push-api/provider.ts` (`EXPO_PUSH_ENDPOINT`) | A provider port (`MealBuddyPushProvider`) exists; the concrete provider is one file. Low cost. |
| Admin/Restaurant web auth built on `@supabase/ssr` cookie handling + Next middleware | both `middleware.ts` files | Next major upgrade touches both. |
| Repo-root `.env.local` vs. Expo project root split | `scripts/start-mobile.mjs` forwards `EXPO_PUBLIC_*` into the Expo child process | Environment surprise: Expo run directly from `apps/mobile` sees no env and silently falls back to mock sources. |
| Direct SQL over Management API used as the deployment channel | TD-01 | Not replaceable without re-baselining migration history. |

### DEFER — genuine but not now

Extract large route files (TD-14); introduce i18n framework (TD-15); unify Supabase client versions (TD-12); consolidate 682 scripts into a smaller, maintained suite (TD-04).

---

## 5. Dependency modernization audit

Installed versions measured from `node_modules` on 2026-09-19; "latest" is the npm registry `latest` tag on the same date. **Nothing was upgraded.**

| Dependency | Installed | Registry latest | Class | Notes |
| --- | --- | --- | --- | --- |
| Expo SDK | 54.0.34 | 57.0.24 | `MIGRATION_REQUIRED` | Three SDK majors behind. React Native, expo-router, expo-notifications, reanimated and the other `expo-*` modules move with the SDK. |
| React Native | 0.81.5 | 0.87.1 | `MIGRATION_REQUIRED` (bundled with Expo SDK) | |
| expo-router | 6.0.23 | 57.0.22 | `MIGRATION_REQUIRED` (bundled with Expo SDK) | Routing is file-based under `apps/mobile/app`. |
| React (mobile) | 19.1.0 | 19.3.0 | `MIGRATION_REQUIRED` (pinned by Expo SDK) | |
| Next.js | 14.2.35 (both web apps) | 16.3.5 | `MIGRATION_REQUIRED` | Two majors behind. Both apps rely on `middleware.ts` for auth gating and `@supabase/ssr`. |
| React (web) | 18.3.1 | 19.3.0 | `MIGRATION_REQUIRED` (with Next) | Mobile and web are on different majors today (TD-12). |
| Tailwind CSS | 3.4.19 (web only) | 4.3.3 | `MIGRATION_REQUIRED` | v4 changes configuration/engine; web apps only. |
| TypeScript | 5.9.3 root / ~5.9.2 mobile | 7.0.2 | `FREEZE_FOR_NOW` | Toolchain major; compatibility depends on the Expo/Next migrations above. |
| `@supabase/supabase-js` | 2.110.2 (mobile), 2.110.6 (web) | 2.116.0 | `SAFE_UPDATE` | Same major. Web pins are exact. |
| `@supabase/ssr` | 0.12.3 | 0.12.7 | `SAFE_UPDATE` | Pre-1.0 package; minor versions can break — same minor here. |
| `pg` | 8.23.0 | 8.23.0 | current | Used by Admin broker and local harnesses. |
| Node (development machine) | v24.15.0 | — | `ARCHITECTURE_OPPORTUNITY` | No `engines`, `packageManager` or `.nvmrc`; the intended runtime is not declared. |
| Expo start workaround | — | — | `ARCHITECTURE_OPPORTUNITY` | `scripts/start-mobile.mjs` disables Expo dependency validation to avoid a historical Expo CLI `Body is unusable` startup bug; re-evaluate against the SDK actually in use. |
| i18n | none (single zh-TW module) | — | `ARCHITECTURE_OPPORTUNITY` | TD-15. |
| Lint / CI | none | — | `ARCHITECTURE_OPPORTUNITY` | TD-04. |
| Edge runtime | Supabase Edge Functions (Deno) | — | `FREEZE_FOR_NOW` | 15 functions; runtime version is platform-managed. |
| OpenAI model | env-selected | — | `SAFE_UPDATE` | Model is configuration; the provider port isolates the vendor. |

---

## 6. Vendor / platform coupling

**Core platform coupling (Supabase).** Supabase is the database, Auth, Storage, Realtime, Edge Function host and RPC/REST surface. The authority model is PostgreSQL-native (roles, RLS, `SECURITY DEFINER`, sealed roles). Replacing Supabase would mean re-hosting PostgreSQL 17 with the same role/RLS model, replacing Supabase Auth (JWT `sub` is read from `request.jwt.claim.sub`/`request.jwt.claims`), Storage, Realtime and Edge Functions. This is deep coupling by design, not incidental.

**Replaceable adapters already present.** Repository/adapter/factory boundaries exist and are documented here without any requirement that they be preserved:
- Consumer runtime composition and repository ports (`apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts`; `repositories/`, `adapters/`).
- Restaurant runtime service factory: `TASTKIND_RESTAURANT_DATA_SOURCE = mock | supabase | disabled` (`apps/restaurant-web/services/restaurant-runtime-service-factory.ts`).
- AI provider port `MealPhotoAnalysisProvider` (OpenAI adapter `openaiProvider.ts`; a mock provider exists).
- Push provider port `MealBuddyPushProvider` (Expo adapter).
- Geocoding provider port `RestaurantGeocodeProvider` (mock only).
- Social runtime transport (`social-runtime-transport/`, Deno-postgres executor transport).

**Direct vendor calls with material replacement cost.**
- Expo Push service (`https://exp.host/--/api/v2/push/send`), token from `EXPO_ACCESS_TOKEN`.
- OpenAI multimodal API via `OPENAI_API_KEY`; no owned model, no training pipeline.
- Supabase Management API (`https://api.supabase.com/v1/projects/{ref}/database/query`) used by acceptance/seed scripts and as the actual migration-application channel (TD-01).
- Supabase Auth Admin API used by seed/fixture scripts with the service-role key.
- Vercel: the public Expo Web demo (`haocu-demo.vercel.app`, project Root Directory `apps/mobile`, SPA rewrite in `apps/mobile/vercel.json`). Deployment configuration for `restaurant-web`/`admin-web` is **not recorded in the repository**.

**Service-role usage is limited and named.** Analysis persistence (Edge Function), Restaurant URL mutation v2 (`apps/restaurant-web/auth/supabase-service-server.ts`, service-role-only RPC by design), and acceptance/seed scripts. No Consumer or Social browser path uses `service_role`.

**Hardcoded environment references.** The Consumer client guard and the analysis-function CORS list are configuration-driven since H1/H2. Remaining: the Development project ref in Development-targeted scripts (intentional) and in the Social executor transport (TD-19).

**Secrets handling.** Only environment variable *names* appear in the repository. Names include `TASTKIND_SUPABASE_*`, `EXPO_PUBLIC_TASTKIND_CONSUMER_*`, `TASTKIND_P3H_BROKER_DATABASE_URL`, `TASTKIND_BREAK_GLASS_{DEVELOPMENT,PRODUCTION}_DATABASE_URL`, `OPENAI_API_KEY`, `EXPO_ACCESS_TOKEN`, `MEAL_BUDDY_PUSH_DISPATCH_SECRET`, `RESTAURANT_GEOCODE_DISPATCH_SECRET`, `SOCIAL_RUNTIME_EXECUTOR_SUPAVISOR_TRANSACTION_URL`.

---

## 7. Admin NON-AUTHORITY inventory (input to the next phase)

The next major implementation phase is **Admin remaining NON-AUTHORITY operational functionality**. Admin Authority (§1.2) is closed and is not part of it. The Admin surface must keep three domains conceptually separate — **Restaurant operational administration**, **Platform administration**, and **Engineering / maintenance functions** — with route hierarchy, navigation hierarchy, source feature roots and permission domains kept aligned, and with authority never resting on a hidden UI element alone (see `docs/admin-information-architecture-ra-3-ia-p1.md`, semantic boundaries; still valid for its intent although its counts are stale — TD-07). This is a product/IA requirement, not a code-structure requirement.

### 7.1 Facts

- Executable IA registry: `apps/admin-web/auth/admin-route-registry.ts` — 98 entries: **8 `LIVE`, 17 `DEMO`, 73 `NOT_ENABLED`**. Re-verified at `5018a19` (A0): counts unchanged; 97 entries have a page, `/admin/break-glass` is a registry-only reservation with no page file. Navigation is filtered by current permissions (`admin-ia-navigation.ts`).
- 119 `page.tsx` files: 97 under `/admin/**` (registry-driven wrappers `createAdminRegistryPage(id)` except the management pages), 22 legacy root pages (TD-06).
- 10 API route handlers: `/api/admin/management/staff/{authority,mutations}`, `/api/admin/step-up/{clear,enroll,enroll/verify,factors,status,verify}`, `/api/platform-admin/audit`, `/api/platform-admin/restaurant-branches/[branchId]/status`.
- Authenticated gate: `/admin/**` middleware (`getClaims()`); every `/api/admin` mutation independently re-checks permission.

### 7.2 `LIVE` (real data, real authority) — 8

| Route | Capability |
| --- | --- |
| `/admin/restaurants/[restaurantId]/branches/[branchId]/status` | Governed branch lifecycle status change (RA-1C). **Real UI live on `/admin` since ADMIN-A** (`AdminBranchStatusWorkspace` hosting `PlatformAdminBranchStatus`, backed by `/api/platform-admin/restaurant-branches/[branchId]/status`); legacy `/restaurant-review` retained until ADMIN-E. |
| `/admin/audit/platform-memberships` | Platform Admin membership lifecycle audit read (RA-1B). **Real UI live on `/admin` since ADMIN-A** (`AdminMembershipAudit`, backed by `/api/platform-admin/audit`); legacy `/audit-trail` retained until ADMIN-E. Eight `/admin` routes now render real data. |
| `/admin/management`, `/staff`, `/staff/[staffAccountId]`, `/permissions`, `/settings`, `/security-log` | Platform Management (Authority stack — closed). |

### 7.3 `DEMO` (badge only — the mock UI lives on the legacy root successor, not on the `/admin` page) — 17

`/admin`, `/admin/operations`, `/admin/operations/ads`, `/admin/operations/sponsored`, `/admin/restaurants`, `/admin/restaurants/{verification,reviews,menu-management}` and `menu-management/{pending,duplicates,aliases,data-quality}`, `/admin/social`, `/admin/social/policies`, `/admin/nutrition`, `/admin/nutrition/certification/pending`, `/admin/nutrition/self-cooked-quality`.

### 7.4 `NOT_ENABLED` (route exists as a placeholder; no backend capability) — 73, by workspace

| Workspace | Count | Examples |
| --- | --- | --- |
| Nutrition & Content Quality (`/admin/nutrition/**`) | 21 | certification history/re-review/remote-review/discrepancy-reports, assignments, standards, my-work, members |
| Restaurant Operations (`/admin/restaurants/**`) | 18 | restaurant/branch detail, about/contact/hours/geo, menus/items/nutrition/allergens/ingredients/certification |
| Business Development (`/admin/business-development/**`) | 9 | prospects, pipeline, contacts, contracts, renewals, follow-ups, assignments, history |
| Engineering & Maintenance (`/admin/engineering/**`) | 8 | health, versions, jobs, push, geo, feature-modes, repairs |
| Platform Operations (`/admin/operations/**`) | 5 | campaigns, promotions, placements, performance, communications |
| Member Support (`/admin/members/**`) | 5 | member detail, consents, access-history, cases |
| Audit & Security (`/admin/audit/**`) | 3 | audit home, operations, data-access |
| Others | 4 | `/admin/login` (functional despite label), `/admin/break-glass` (hidden reservation), `/admin/management/roles`, `/admin/social/reports` |

The Business Development workspace (9 routes) is present in the registry but is **not** in the Admin IA document's nine-workspace sitemap. There is no BD/prospect/contract/activation schema in the database.

### 7.5 Gaps by kind

- **Real-data wiring.** Only the 8 `LIVE` routes read/write the database. Every operational domain other than branch status (Restaurant lifecycle/verification/review, Member Support, Social safety/reports, Nutrition review, Data Quality, Operations/ads/campaigns, Engineering diagnostics, BD) has no governed backend.
- **CRUD/operational gaps.** No Admin-side read model for restaurants/menus/items (Restaurant Owner authoring exists; Admin visibility over it does not); no restaurant verification workflow; no moderation queue; no member case handling.
- **Dashboard/reporting.** `/admin` is `DEMO`; no aggregate reporting sources exist.
- **Engineering workspace.** All 8 routes `NOT_ENABLED`; sanitized health/version/migration posture would need read models (TD-01 makes remote migration posture non-derivable from the history table today).
- **Duplicate / obsolete routes.** 22 legacy root pages (TD-06) duplicate registry routes; 4 restaurant-web legacy roots already redirect.
- **IA/navigation inconsistencies.** TD-07.
- **Rule for the next phase (product).** No new permission may be granted through UI presence alone; new operations need their own governed backend authority consistent with the sealed-role pattern. Admin Authority itself is not reopened.

---

### 7.6 A0 scope closure (2026-09-19, baseline `5018a19`)

**Surface counts (120 surfaces = 98 registry routes + 22 legacy roots).** `LIVE` 8 (6 with real `/admin` UI; 2 authority-only, UI still on legacy roots) · `DEMO` 17 (all scaffold pages) · `NOT_ENABLED` 73 (71 scaffold placeholders + `/admin/login` functional + `/admin/break-glass` no page) · `LEGACY` 22 (15 one-to-one duplicates of registry routes, 3 split into several successors: `/tags`, `/menu-review`, `/restaurant-review`; 1 replace: `/consents`; 3 defer: `/esg`, `/exercise-governance`, `/data-access`) · `DEAD` 0. Only `/audit-trail` and `/restaurant-review` are HYBRID (real authority read plus mock); the other 20 legacy roots are MOCK (`@haocu/shared` mock exports or `adminRestaurantMockAdapter`). Every legacy root is outside the middleware and is linked from the legacy `AdminShell` navigation.

**Findings that shape scope.**
1. *Permission gap (AE-1).* Every operational route requires a `PLANNED` read permission that has no database authority: `resolveAdminRouteRequirement` maps `PLANNED`-only routes to base-Admin (`admin_context.read`). Real cross-restaurant data behind such a route would be readable by every base Admin. Making per-domain read keys `CURRENT` means catalog rows plus the application vocabulary (`CURRENT_ADMIN_PERMISSION_KEYS` has 10 keys). That is an authority extension; its direction is now resolved (§7.8, AE-1) and it is realized by ADMIN-AE1.
2. *Restaurant read-model gap confirmed.* Baseline tables (`restaurants`, `restaurant_branches`, `menus`, `menu_items`, `branch_menu_items`, `menu_item_nutrition`) carry lifecycle status and nutrition status, but RLS exposes only `active`/`published` rows to clients and the ten `restaurant_internal_*_v1/v2` readers are Owner-membership-scoped. The only Admin reader is the single-branch status preview (`staff_admin_restaurant_branch_status_v1(restaurant_id, branch_id)`): no list, search, or discovery. Ownership counts, operational status roll-ups and draft/archived visibility have no Admin path.
3. *Missing data models.* No table exists for menu-item aliases, pending menu items, data-quality issues, duplicate candidates, verification cases, review queues, social reports/moderation, member support cases, analytics events, campaigns/promotions/ads, BD/prospects/contracts, Activation Code, Strategic Accounts, nutritionist assignment/certification. Social tables that exist (`meal_buddy_*`, `social_*`) are private-user data whose Admin visibility is a product decision.
4. `social_interest_catalog[_label]` (RLS-hardened in H4) is public-class lookup data and the one Social source that needs no privacy decision.

### 7.7 Admin MVP scope (closed) and slice order

Route-level detail for all 98 registry routes and 22 legacy roots: **`docs/admin-operational-surface-inventory.md`** (canonical; do not rediscover).

| Slice | Scope | Backend | Class | Prerequisite |
| --- | --- | --- | --- | --- |
| ADMIN-A | **DONE, ACCEPTED (`ADMIN_A_ACCEPTANCE_PASS`, authenticated Development live acceptance 44/44 — see inventory §1a)** — the two live UIs now render on `restaurant-branch-status` and `audit-platform-memberships` (REWIRE_TO_EXISTING_BACKEND; no backend/authority change; legacy roots retained) | Exists (RA-1B/1C, API routes) | SMALL | none |
| ADMIN-AE1 | **DONE, ACCEPTED (`ADMIN_AE1_ACCEPTANCE_PASS`; inventory §5)** — activated only the operational read keys the MVP routes need (§7.8 AE-1) through the existing catalog/entitlement/route-requirement machinery; prove a base Admin without grants cannot read | Narrow authority successor activation | MEDIUM | ADMIN-A |
| ADMIN-B | **B1 DONE, ACCEPTED (`ADMIN_B1_ACCEPTANCE_PASS`; inventory §5a) — 14 read-only contracts live on Development; B2/B3 (UI over them) remain.** Restaurant operational read model + 15 read-only routes: `restaurants`, `restaurant-detail/-about/-contact`, `-branches`, `-branch-detail/-hours/-contact/-geo/-menu-items`, `-menus`, `-menu-detail`, `-menu-items`, `-menu-item-detail`, `-item-nutrition` (drafts/archived, nutrition status, lifecycle, owner-membership counts) | NEW non-authority read RPCs (sealed-role pattern) | LARGE | ADMIN-AE1 |
| ADMIN-C | Derived read-only queues: `menu-management`, `-pending`, `-data-quality`, `nutrition-certification-pending` (read of `pending_review`), `restaurant-item-allergens`, `restaurant-item-certification` (status facts only) — 6 routes | Derived from B | MEDIUM | ADMIN-B |
| ADMIN-D | `social-policies` read-only from `social_interest_catalog[_label]`; `/admin` dashboard counts | Small NEW read RPCs | SMALL | ADMIN-B |
| ADMIN-E | Legacy cleanup per §7.8 dispositions | none | SMALL | A–D |

Sequence: **ADMIN-A → ADMIN-AE1 → ADMIN-B → ADMIN-C → ADMIN-D → ADMIN-E**. Ordering rule: shared read model → derived queues → DEMO→REAL → legacy cleanup last. ADMIN-A is unblocked. (Correction to the first A0 note: ADMIN-B is 15 routes, ADMIN-C is 6; `restaurant-item-ingredients` has no source table and is deferred.) Slice counts over the 98 registry routes: A 2, B 15, C 6, D 2, DEFERRED 73.

### 7.8 Planner decisions (A0 closure) and deferred scope

- **AE-1 — `AE-1_DIRECTION_RESOLVED`; implementation DONE in ADMIN-AE1 (2026-09-20, Development-accepted; production not enabled).** CURRENT permission keys 10 -> 26 (catalogue 11 -> 27 rows), the exact 15 route keys plus `admin.dashboard.counts.read` (privileged lane only, granted nothing by default); the dashboard hub stays base-Admin and ADMIN-D gates the counts data on the new key. Cross-tenant operational data for specific operational roles must be protected by explicit `CURRENT` read permissions via the existing permission catalog + entitlement + route-requirement architecture. **No base-Admin (`admin_context.read`) fallback** for these reads. **No blanket activation**: only the keys the accepted MVP routes require become `CURRENT` (least operational privilege); the other 65 `PLANNED` keys stay `PLANNED`. **No Authority redesign**: Primary, step-up, break-glass semantics untouched. Classification `NARROW_AUTHORITY_SUCCESSOR_ACTIVATION`. ADMIN-AE1 will enumerate the exact keys (the inventory §5 lists the candidates), verify which exist as PLANNED, activate/add only those, and prove base Admin without grants is denied.
- **BD workspace — DEFERRED** for the current Admin MVP (`BD_WORKSPACE_NEXT_PHASE_SCOPE_DECISION_REQUIRED` closed). All 9 routes are preserved as future scope. Not implemented: Activation Code, Strategic Accounts, BD attribution, commission mechanics, BD schema. Company operating decisions stay in `governance/`. BD is not a blocker.
- **Legacy roots.** The 15 one-to-one duplicates: `RETIRE_AFTER_SUCCESSOR` in ADMIN-E once canonical successors are live and validated (not deleted now). The split-successor pages `/tags`, `/menu-review`, `/restaurant-review`: `KEEP_UNTIL_SUCCESSORS_COMPLETE`. `/consents`: `REPLACE / REDIRECT_CANDIDATE`. `/esg`, `/exercise-governance`, `/data-access`: deferred until an explicit successor decision. Where a duplicate's own successor is deferred, retirement waits for that successor.
- **Restaurant pricing and recurring dish-quota policy:** not in the current Admin MVP; relevant only if subscription/commercial tooling is later explicitly scoped; not a blocker.
- **Deferred families (no data model or new authority):** Business Development, Operations/marketing, Member Support (private-user visibility is a product decision), Social reports/moderation and Meal Buddy private-data ops, alias/duplicate/verification/review queues, Nutritionist workflow (POST_MVP; certification *writes* need new authority), Audit operations/data-access, Engineering (TD-01), Analytics (`NO_DATA_MODEL`), `management-roles` and `break-glass` (authority-frozen).
- Nothing is retired or redirected before ADMIN-E.

---

## 8. Environment facts

- Repository: npm workspaces monorepo — `apps/mobile` (Expo/React Native + Expo Web), `apps/restaurant-web` (Next.js 14), `apps/admin-web` (Next.js 14), `packages/shared`, `packages/services`, `supabase/` (135 migrations, 15 Edge Functions), `scripts/`.
- Database: PostgreSQL 17.x on Supabase (Development project `tastkind-development`, ref `msbgnnoorsoefuiwluye`). Local migration proofs have been run against a disposable PostgreSQL 17 cluster.
- Environments: Development exists and is live-accepted for the closed capabilities. **Production does not exist as an enabled environment** (TD-03).
- Configuration: repo-root `.env.local` (empty placeholders for some values; app-specific values live in `apps/restaurant-web/.env.local`); `.env.example` documents names. `scripts/start-mobile.mjs` forwards root values into Expo.
- **Consumer runtime configuration (H1).** `EXPO_PUBLIC_TASTKIND_ENVIRONMENT=development` (release-mode gate), `EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL` and `EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY` (or the legacy `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`). The URL must be an https origin (http for loopback only). Anything absent or malformed disables the live client; nothing falls back to another project. The values are public-safe browser configuration (publishable key only).
- **`meal-photo-analysis` browser-origin allowlist (H2).** Function secret/config `MEAL_PHOTO_ANALYSIS_ALLOWED_ORIGINS`: comma/whitespace-separated exact origins (`https://host[:port]`, or `http` for loopback; no path, query, userinfo or wildcard; entries are lower-cased and a trailing slash is stripped). It is configuration, not a secret. Missing, empty or wholly invalid ⇒ **no** browser origin is authorized (non-browser callers are unaffected; the gateway JWT check and the handler's own authentication remain the access control). Read on every request. Intended Development value: `https://haocu-demo.vercel.app`. **Status on Development: set to the demo origin and deployed (TD-20 closed).**
- Public demo: Expo Web on Vercel, real Development-backed Auth/Storage/analysis.
- No CI service is configured in the repository.

## 9. CURRENT_SECURITY_ADVISOR_STATE (Development `tastkind-development`, read on 2026-09-19; targeted delta re-read after the H3/H4 apply)

**Development's Security Advisor is not currently clean.** This section summarises by category; it does not reproduce raw linter rows. It concerns the Development project only — Production is not enabled.

*Method and limits.* The Management API advisor endpoint returned HTTP 403 for the available access token, so the advisor was not read directly. The same lint categories were reproduced with read-only catalog queries (no database change). Counts below are from those queries; advisor severities are the standard ones for each lint. The leaked-password-protection item is a Supabase Auth setting that could not be read (auth-config endpoint 403) and rests on an earlier spot-check by the project owner's reviewer. PostgREST's exposed-schema list could not be read either.

| # | Category (advisor severity) | Count | Interpretation | Evidence | Unresolved |
| --- | --- | --- | --- | --- | --- |
| S1 | **`CLOSED` (H4)** — RLS disabled in public (ERROR) | was 2 tables (now 0): `social_interest_catalog`, `social_interest_catalog_label` (~100 rows each) | `INTENTIONAL_PUBLIC_READ_MODEL` for authenticated read of a data-driven public interest catalog (table comments: SR-2C-R1 lookup, `tag_key` is the public identity); `HARDENING_RECOMMENDED` because RLS is off. Not an authority bypass. | Owner `postgres`; no policies, no triggers. `authenticated` holds SELECT; `anon` has no SELECT. **Neither `anon` nor `authenticated` holds INSERT/UPDATE/DELETE** (table or column level). Both hold residual `REFERENCES`, `TRIGGER`, `TRUNCATE` (default-privilege residue) which the REST API cannot exercise. | Whether to enable RLS with a read policy and drop the residual privileges. |
| S2 | **`CLOSED` (H3)** — Anonymous-executable SECURITY DEFINER functions (WARN) | was 10 in `public` (now 0): the `staff_management_*_v2` wrappers (grant/revoke console admission, permission delegation, privileged permission; link/suspend/reactivate/revoke staff account). Plus 3 in `_internal` schemas (S6). | `INTENTIONAL_AND_GUARDED` as to exploitability; **externally callable posture is PUBLIC EXECUTE** (default ACL `=X`), so `anon` and `authenticated` can invoke them and denial happens inside the function. `HARDENING_RECOMMENDED`: restrict EXECUTE to `authenticated`. | Each wrapper's first action is `staff_step_up_validate_receipt_v1`, which requires JWT `sub` and `session_id` UUIDs, `aal = 'aal2'`, a receipt id and 64-hex proof hash, the correct operation class and a live, actor-bound receipt; an anonymous call has no claims and returns `step_up_required` before any mutation. The ten protected mutating `_v1` functions grant EXECUTE to neither `anon` nor `authenticated`; only permission-gated read RPCs (`list_staff`, `permission_catalog`, `receipt_use_log`, …) are `authenticated`-executable. Frozen evidence: `scripts/staff-authority-p3-p6-p3h-guard.mjs` (revoke from public/anon/authenticated on the `_v1` set), `…-p3h-postgres.mjs` (role-membership checks), P3H live rehearsal recorded in the Admin section of the handoff. | An anonymous call was **not** executed against Development (would be a write path); denial is established from source, catalog ACLs and frozen tests. |
| S3 | Authenticated-executable SECURITY DEFINER functions (WARN) | 111 in `public` (includes the 10 in S2) | `INTENTIONAL_AND_GUARDED` — this is the RPC surface; each write RPC derives the actor from the JWT and checks its own permission. | Frozen per-phase guards/mutation/live acceptance. | Not re-audited function by function in this patch. |
| S4 | Security Definer View (ERROR) | 26 views in `public` (owner-run, no `security_invoker`) | Split: **7** anon+authenticated public-safe projections (`consumer_public_restaurant_catalog_v1–v4`, `…about_v1`, `…social_links_v1`, `restaurant_public_published_nutrition_v1`) = `INTENTIONAL_PUBLIC_READ_MODEL` (N4 / 2U contracts). **12** authenticated-only candidate/facts/vocabulary views (allergen and avoidance facts/coverage, private-restriction dictionaries, taste dictionaries/facts/state, next-meal candidates v1/v2) = `INTENTIONAL_AND_GUARDED` per frozen REC-B/C/D contracts. **7** with no client SELECT (`consumer_meal_record_owner_view`, `consumer_public_profiles`, `current_published_menu_item_nutrition`, `published_branch_menu_items_view`, `published_menus_view`, `restaurant_consumer_aggregate_metrics`, `restaurant_public_view`) = `TECH_DEBT` (legacy; no client access). | None of the 20 `consumer_*` views references `auth.uid()`/a JWT claim (they are not per-user projections); the client-privilege split is from `has_table_privilege`. `security_barrier` is set on the client-readable views. | The 12 authenticated-only views were classified from their frozen contracts and names, **not re-read view by view**: `NEEDS_FURTHER_SECURITY_REVIEW` (low). |
| S5 | Function search path mutable (WARN) | 190: 188 are `btree_gist` extension functions installed in `public`; 2 are app-owned — `public.consumer_set_updated_at` (SECURITY INVOKER trigger, only `now()`) and `social_internal.meal_buddy_card_expires_at` (IMMUTABLE SQL, SECURITY INVOKER, built-ins only) | `TECH_DEBT` / `HARDENING_RECOMMENDED` (low). Neither app-owned function is SECURITY DEFINER, so there is no privilege-escalation path. | Function definitions read from the catalog. | Set explicit `search_path` on the 2 app functions. |
| S6 | Other lint categories reproduced | Extension in public: `btree_gist` (WARN). RLS enabled with no policy (INFO): `consumer_data_change_logs`, `legacy_consumer_entity_mappings` (default-deny to client roles). Anonymous-executable SECURITY DEFINER outside `public`: `geo_internal.branch_geocode_invalidate`, `geo_internal.restaurant_city_geocode_invalidate`, `restaurant_internal.consumer_branch_current_temporal_state_v1`. | `HARDENING_RECOMMENDED` (extension), `INTENTIONAL_AND_GUARDED` (default-deny tables), `NEEDS_FURTHER_SECURITY_REVIEW` (the 3 `_internal` functions: whether those schemas are exposed through the REST API was not readable). | Catalog queries. | API schema-exposure configuration. |
| S7 | Leaked-password protection disabled (WARN) | 1 setting | `TECH_DEBT` / `HARDENING_RECOMMENDED` (Auth setting). | Observed by the project reviewer's spot-check on 2026-09-19; **not independently verified**. | Verify in the Auth settings; plan availability not verified. |

**Verdict:** no finding demonstrates an authority bypass inconsistent with the frozen contracts → `SECURITY_SUCCESSOR_REPAIR_REQUIRED = NO`. Open review items: S4 (12 authenticated-only views), S6 (`_internal` API exposure). Remaining hardening candidates: S5, S6-extension, S7.

### 9.1 Targeted delta from the pre-Admin hardening (H3, H4)

| Finding | Before | After (Development, catalog re-read) | Closed by |
| --- | --- | --- | --- |
| RLS disabled in `public` (S1) | 2 tables (`social_interest_catalog`, `social_interest_catalog_label`) | **0** — RLS enabled; five permissive SELECT policies (authenticated on both tables plus the three sealed readers on the catalog); `anon` holds no privilege; `authenticated` holds SELECT only (no INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES/MAINTAIN) | `20260919030000_social_interest_lookup_rls_acl_hardening_h4.sql` |
| Anonymous-executable SECURITY DEFINER functions in `public` (S2) | 10 (`PUBLIC` EXECUTE `=X` on the ten `staff_management_*_v2`) | **0** — ACL is exactly `{owner, authenticated}`; PUBLIC, `anon`, `service_role`, `authenticator` have no EXECUTE; function bodies byte-identical | `20260919020000_staff_management_v2_outer_acl_hardening_h3.sql` |
| Root cause of S2 | The P3H migration's `revoke … from public` / `grant … to authenticated` on these functions ran as `postgres`, a non-owner holding only an INHERIT-FALSE membership in the sealed owner role, and was silently ignored | H3 performs the change as the sealed owner (`set local role staff_step_up_gate_authority`) and its epilogue verifies the ACL from the catalog | — |

Unchanged by this phase (still open, see rows above): S3 (111 authenticated-executable definer functions — the RPC surface), S4 (26 definer views), S5 (190 mutable-`search_path` functions), S6 (`btree_gist` in `public`; two RLS-on-no-policy tables; three anonymous-executable definer functions in `_internal` schemas), S7 (leaked-password protection).

Live evidence (Development, synthetic fixtures, cleaned up): anonymous and `service_role` calls to the ten v2 RPCs fail at the privilege boundary (42501); an authenticated AAL2 actor without a receipt is rejected inside the gate on all ten; AAL1 with a valid receipt, an unauthorized user with their own receipt, a cross-authority attempt, a wrong proof and a superseded receipt are all rejected; a valid AAL2 + live step-up privileged mutation still succeeds with exactly one receipt-use evidence row. Anonymous reads of the two lookup tables fail (401/42501); authenticated reads see all 100 rows of each; client INSERT/UPDATE/DELETE fail on both; the three sealed readers still read all 100 catalog rows; the Social interest-settings RPC still works end to end.

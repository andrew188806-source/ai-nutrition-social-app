# TastKind／好廚 — authoritative MVP engineer handoff

## 1. Takeover boundary and commit lineage

Current audited runtime baseline: **`9d68eab2b0833c3a20d35727cff42fd1a403e24b`** — `Repair live Recommendation write composition`, on `main`. This handoff-document commit is its documentation-only successor, changing only `README.md` and `ENGINEER_HANDOFF.md`. It introduces no product, schema, function, or deployment change.

| Commit | Kind | Location | Meaning |
| --- | --- | --- | --- |
| `0bedb4159fff885509beaac4494e4e74a4a2f146` | runtime | **pushed** (`origin/main`) | `Fix public demo SPA routing` — public-demo runtime baseline |
| `dce9c566c73c63b66b2fedc6a1291131304eb840` | documentation only | local | `Finalize MVP engineer handoff documentation` |
| `9d68eab2b0833c3a20d35727cff42fd1a403e24b` | runtime | local | `Repair live Recommendation write composition` — **current audited runtime baseline** |
| this commit | documentation only | local | `Finalize post-audit MVP handoff` |

`origin/main` remains `0bedb415…`. The two local successors and this document commit are **not** pushed; the owner performs the final push manually.

The declared MVP mainline is complete. Recorded closure dispositions are `GEO_FINAL_CLOSURE_NO_CODE_REQUIRED`, `MVP_FINAL_AUDIT_PASS / HANDOFF_ARTIFACT_RECOMMENDED`, and — for the Recommendation composition repair — an independent review returning `PASS_WITH_REVIEW_ITEMS`. No hidden mandatory product/runtime phase remains before professional engineer handoff at this audited baseline.

This document states current takeover status; source and frozen phase contracts supply detailed authority. Historical roadmap/phase documents are useful evidence, not instructions to restart completed phases. Completion is bounded to the declared MVP and Development acceptance, not Production certification, security certification, or physical-device acceptance.

## 2. Repository surfaces and entry points

| Surface | Current responsibility / source entry |
| --- | --- |
| Expo Mobile / Web | `apps/mobile/app` routes; [consumer composition](apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts) binds authenticated capabilities, repositories, and lifecycle isolation. |
| Shared authority | `packages/shared/src/domain` contains domain contracts/engines; `packages/services` contains service boundaries and remaining placeholders, not a blanket live implementation. |
| Supabase database | `supabase/migrations`: 91 migrations at the audited runtime baseline, unchanged by the Recommendation repair. Private authority, RLS, role-limited operations, and approved projections/RPCs are separate from public DTOs. Preserve frozen migration bytes. |
| Edge Functions | `supabase/functions`: analysis, Social candidates/profile/Taste, Meal Buddy cards/discovery/relationships/chat/push, and GEO. `_shared` carries server-side contracts, opaque references, composition, and executor transport. |
| Restaurant Web | `apps/restaurant-web`: partially MVP-active, incomplete but non-blocking. [Runtime service factory](apps/restaurant-web/services/restaurant-runtime-service-factory.ts) selects mock/disabled or owner-RPC live reads and explicitly marks unsupported console surfaces. |
| Admin Web | `apps/admin-web`: scaffold/future backend; rendered screens are not evidence of live admin authority. |
| Public Vercel demo | [haocu-demo.vercel.app](https://haocu-demo.vercel.app/), Expo Web, Root Directory `apps/mobile`; [SPA config](apps/mobile/vercel.json). |
| Validation / frozen design | `scripts`, `docs`, and the named commits above. Check each harness's scope and side effects before use. |

Consumer routes include `/meal-photo`, `/analysis`, `/today-intake`, `/meal-log`, `/recommendation`, `/restaurants`, and `/meal-buddies`. Relationship/chat UI belongs to the Meal Buddy surface. Legacy local demo stores and group-table presentation remain; do not mistake them for the live repository authority or create a second canonical write path around them.

### 2.1 Canonical Recommendation entry point — read before touching Recommendation

`apps/mobile/features/next-meal-prototype/` carries **historical naming** but is the **current canonical `/recommendation` wiring**. It is not disposable prototype code.

- Route: [apps/mobile/app/recommendation.tsx](apps/mobile/app/recommendation.tsx) constructs the provider at module scope.
- Live client composition: `next-meal-prototype/canonicalNextMealPrototypeComposition.ts`.
- Service/provider bridge: `next-meal-prototype/canonicalNextMealPrototypeProvider.ts`.
- Underlying live authority: [supabaseConsumerNextMealRecommendationRepository.ts](apps/mobile/features/consumer-meals/adapters/supabaseConsumerNextMealRecommendationRepository.ts), built by `consumer-meals/factories.ts`.

New Recommendation work must **extend that governed composition**. Do not introduce a second Recommendation authority because of the directory name.

## 3. Active end-to-end graph

```text
Auth/Profile → Consumer meal runtime → AI upload/analysis/finalization
  → Recommendation → correction/selection
      ├─ explicit canonical meal action → Today Intake / meal record
      └─ separate explicit Meal Buddy handoff → creation → Social discovery
           → invite → accept → relationship → chat → realtime/push
           → unfriend

Explicit foreground location → shared actor/session location provider
      ├─ Recommendation GEO
      └─ Meal Buddy GEO

Public Vercel Expo Web → tastkind-development Auth → private Storage
  → meal-photo-analysis v40 → server OpenAI → validated response/render
```

AI output requires user confirmation/finalization; merely receiving an analysis is not an automatic canonical meal write. Recommendation selection exposes separate meal-record and Meal Buddy actions; viewing/selecting a candidate is not permission to perform both. See [recommendation route](apps/mobile/app/recommendation.tsx), `consumer-runtime/consumerMealIdentificationFinalizationRuntime.ts`, and `consumer-runtime/consumerMealWriteRuntime.ts` under the Mobile features directory.

The live Meal Buddy chain includes Meal Context, candidate discovery, profile/interests, Social participation/block/privacy, invite/accept, authorized relationships/chat, realtime backend, push backend/provider, and unfriend. General/manual creation and gatherings still have local/demo paths. Feature defaults deliberately do not enable every implemented capability; the accepted public AI route is not a blanket claim that every Social/Restaurant UI path was publicly exercised.

## 4. Actor, privacy, and security boundaries

- User-facing server operations derive the actor from the verified JWT; caller-supplied actor IDs, query parameters, or opaque-reference claims are not identity authority. Requests are checked against current ownership and operation authorization.
- Candidate, card, relationship, and chat opaque references are scoped to the relevant actor/purpose/lifetime where applicable. Possession of a reference is not permission to act for another user.
- Private/internal schemas, RLS, ownership, sealed writers, and approved role-limited executor/RPC paths separate canonical data from client access. Do not replace those boundaries with a broad service-role client.
- Social participation, block/privacy eligibility, private evidence rules, entitlement/exposure, and final public projection remain separate stages. Relationship/chat operations enforce their authorization; unfriend is a server-authorized lifecycle operation, not just a UI deletion.
- Public Interests are the approved Social display/interest authority. Private Taste evidence, Allergy settings, and Ingredient Avoidance settings must not leak into public interests or Social candidate DTOs. The two restriction domains remain separate from Taste and from one another.
- Coordinates, `branch_id`, and raw distance meters are not public Social DTO fields. Private selected-card branch context is server-only, not a client branch selector.
- Photo upload is private and actor-scoped. The server authenticates, validates the canonical object reference, revalidates image bytes, and validates provider output. The browser never receives OpenAI/admin/service-role secrets and never calls OpenAI directly.
- Operational push/geocode dispatch endpoints use their own server dispatch-secret authorization rather than pretending to be user-JWT operations. Reference keys, executor connection credentials, dispatch secrets, and provider tokens remain server-only.

Source anchors: [analysis handler](supabase/functions/meal-photo-analysis/handler.ts), [Meal Buddy discovery handler](supabase/functions/meal-buddy-candidate-list/handler.ts), `_shared/meal-buddy-relationship-api`, `_shared/meal-buddy-chat-api`, `_shared/social-runtime-transport`, and corresponding frozen migrations. These boundaries are implemented contracts, not a substitute for the future production security review.

## 5. Recommendation authority

```text
GEO → REC-C Allergy eligibility → REC-D Ingredient Avoidance eligibility
    → REC-A Nutrition → REC-B Taste
```

[Live recommendation repository](apps/mobile/features/consumer-meals/adapters/supabaseConsumerNextMealRecommendationRepository.ts) preserves this order. Only survivors reach subsequent stages; excluded candidates cannot re-enter via Taste lanes, interleave, output filling, or action handoff.

REC-C uses governed Allergy settings and candidate allergen facts/coverage. REC-D uses separate private Ingredient Avoidance settings (`我不吃的食物`) and branch-offer candidate content authority, with exact v1 keys `pork`, `beef`, `coriander`. These are not allergens or religious/halal claims. Neither restriction domain contributes a bonus, penalty, score, lane, or ranking weight to Nutrition or Taste.

Unavailable or unresolved governed restriction authority fails closed; missing readers must never be treated as empty/no-active settings. Neutral state requires an explicit successful canonical read. Candidate facts and unknown/partial/complete coverage remain domain-specific. Taste evidence, normalization, profile privacy, and ranking retain their own frozen authority.

The `9d68eab2` repair changed no stage, DTO, ranking formula, fallback, or eligibility rule. It changed only how the canonical caller constructs its Auth client and its read-side service.

### 5.1 Recommendation under a write-enabled Consumer runtime

Historically, two independent gates rejected write-enabled flags, so the canonical `/recommendation` route could not coexist with a write-enabled live Consumer runtime:

1. Raw Auth/live flags reached the historical Phase-1D Supabase client-construction gate, which refuses while `supabaseWritesEnabled` is true.
2. `createConsumerNextMealRecommendationService` reached the historical Today-Intake read-only assertions, which also refuse write-enabled flags.

Either one alone was sufficient to fail construction. With writes disabled the downstream canonical selected-meal write was unavailable instead. Both points are now repaired:

- **Successor Auth construction.** The canonical Recommendation composition and the Recommendation feedback composition construct through the existing governed successor live-client adapter, `consumer-auth/liveClientCompositionFlags.ts` (`deriveLiveSupabaseClientFlags`). That adapter clears the obsolete Phase-1D gate **in the client-construction flags only** and preserves every other issue verbatim.
- **Caller-only read-capability projection.** `canonicalNextMealPrototypeProvider.ts` derives a module-local read projection for the historical read-era service construction.

Do **not** globally weaken, invert, or delete the Phase-1D historical guard or the strict historical factories. They remain compatibility boundaries that keep any caller which has not opted in failing closed. The repair reconciles at the call site; it does not relax the shared authority.

### 5.2 What the read-capability projection is — and is not

The projection (`recommendationReadFlags()` in `canonicalNextMealPrototypeProvider.ts`) **is**:

- derived from the actual runtime flags returned by `getConsumerMealRuntimeFlags()`;
- module-local and not exported — its only consumer is the Recommendation service construction on the same line;
- a copy: it does not mutate global runtime state, and the live capability configuration is unchanged;
- a narrowing of historical read-era construction flags (the three write booleans plus the two write sources), and a filter of exactly the two historical read-era conflict statements;
- **stricter** than the previous call: it refuses unless Auth is live, Auth is enabled, and both meal-record and daily-nutrition sources are `supabase-live`;
- fail-closed preserving: invalid values, project/environment checks, missing read opt-ins, missing write opt-ins, unapproved write sources, and non-development live writes all remain errors.

The projection **is not**:

- a grant of write capability to anything;
- a global runtime rewrite or a new authority;
- reachable by other features — no other caller can obtain it or use it to bypass write opt-ins.

Actual write authority is untouched. Canonical meal writes still depend on the real global write flag, the explicit meal-record write opt-in, and the canonical atomic meal-write authority, all read from the unmodified runtime flags through the ordinary Consumer runtime.

### 5.3 Focused integration gate

```sh
node scripts/recommendation-live-write-composition-smoke.mjs
```

Result at this baseline: **39/39 PASS**.

It is a fail-fast integration gate: it loads the **real** production composition, provider, repository, service, eligibility and ranking modules and replaces only platform/transport/network boundaries (`@supabase/supabase-js`, `react-native`, async-storage, `expo-crypto`, `expo-file-system`) with deterministic fakes. Network, Storage, Realtime, native file access, and any unlisted table/RPC are denied and asserted absent. It performs no real network, database, or repository file writes, and it extracts the route/provider callbacks from their own source by AST node rather than reimplementing them.

Regression modes revert each repair edit in the in-memory compiler input only:

```sh
node scripts/recommendation-live-write-composition-smoke.mjs --mutation=raw_auth
node scripts/recommendation-live-write-composition-smoke.mjs --mutation=raw_read
node scripts/recommendation-live-write-composition-smoke.mjs --mutation=raw_feedback
```

All three **must fail**. Each reproduces one historical rejection point; `raw_feedback` reproduces the literal Phase-1D refusal message. Because assertions are fail-fast, a run reports the number of assertions completed — it cannot express a partial failure.

### 5.4 Same-runtime proof recorded by that gate

Under one live environment:

```text
canonical Recommendation constructs
  → selected recommendation flows through the existing route/provider callback
  → canonical meal RPC executes with the selected branch/menu identity
  → Today Intake reads the new meal back on the same runtime
```

while the main Consumer runtime simultaneously reports writes enabled and its capability flags unmodified. With writes disabled: Recommendation read/ranking still works, and the identical action refuses the write. The historical raw factories still reject write-enabled flags, and no unrelated write capability (for example planned meals) is granted.

## 6. GEO and Meal Buddy discovery authority

Completed GEO phases: GEO-1A, GEO-1B, GEO-1C-P0, GEO-1C, GEO-1D-P0, and GEO-1D. No further GEO product phase is required for this handoff.

```text
Social eligibility → deterministic selected card / Meal Context
  → private exact selected-card→branch binding
  → canonical GEO 5000m inclusive narrowing
  → existing Social/Taste ranking → entitlement/exposure → public projection
```

- [Shared location provider](apps/mobile/features/consumer-location/ConsumerLocationProvider.tsx) reuses foreground acquisition only after explicit action. Location stays in memory, isolated by actor/session generation; stale requests cannot publish across users. No background tracking, watch/history, or startup prompt.
- Location is optional. Denied, unsupported, or services-disabled states keep non-GEO Recommendation/Social usable; no mandatory location requirement is introduced. The current device port enables acquisition only on iOS/Android; Web reports unsupported and retains the non-GEO path.
- The canonical shared GEO primitive owns distance and the 5000-meter inclusive radius: exactly 5000m is eligible. No duplicate distance authority, radius widening, distance ranking score, or distance tie-break.
- Valid zero-nearby is an applied honest empty result, not infrastructure failure. Successful exclusions stay excluded; no fallback/refill may repopulate that empty pool. Actual infrastructure failure has a distinct high-level non-GEO fallback and must not be relabeled as a successful GEO result.
- Meal Buddy GEO reads the branch binding of the already-selected exact card, not another card or any branch of its restaurant. No restaurant-wide/nearest-branch inference, speculative backfill, alternate-card fishing, or person/card dedupe change. Historical unbound cards remain valid in non-GEO discovery but are excluded when GEO applies.
- [Meal Buddy server composition](supabase/functions/_shared/meal-buddy-candidate-api/compose.ts) narrows before final Social/Taste ranking and exposure. GEO row order/raw distance never becomes Social ranking authority. Context/ranking, exposure caps, and public projection remain the frozen downstream authorities.

## 7. Public demo authority and evidence

Public URL: [https://haocu-demo.vercel.app/](https://haocu-demo.vercel.app/). Backend: `tastkind-development`, public project identity `msbgnnoorsoefuiwluye`. This identity is not a credential. The deployment intentionally uses Development; Production was not used.

**The Vercel deployment scope named "Production" is not TastKind Supabase Production.** The demo's Vercel production deployment deliberately points at the Development project. The exact Development project pin in [consumer environment validation](apps/mobile/features/consumer-auth/supabaseConsumerEnvironment.ts) is a deliberate demo-scoped decision, enforced in source before SDK construction. Future commercial Production must be separately authorized, configured, reviewed and deployed — do **not** simply replace the Development URL and assume Production readiness.

Accepted path: real Development Supabase login → browser-safe image materialization → real private actor-scoped Storage upload → real `meal-photo-analysis` **v40** → real server-side OpenAI → validated response → rendered AI result. This is not mock Auth, upload, or analysis. Exact demo-origin CORS, no direct browser OpenAI call, no server-secret leakage, and zero Production requests were accepted.

SPA direct/refresh access to `/meal-photo`, `/analysis`, and `/meal-buddies` is accepted. Vercel reads the fallback in `apps/mobile/vercel.json` because its Root Directory is `apps/mobile`; the repository-root `vercel.json` is not that deployment's configuration authority.

| Runtime commit | Accepted change |
| --- | --- |
| `a8ade613917908baee5a682f33f77aac8de3bbf6` | Fix Expo web meal analysis demo flow |
| `1c0453b366ae29f3c530e628a876fd9c952663b8` | Activate Development AI for public demo |
| `0bedb4159fff885509beaac4494e4e74a4a2f146` | Fix public demo SPA routing |
| `9d68eab2b0833c3a20d35727cff42fd1a403e24b` | Repair live Recommendation write composition |

High-value evidence carried forward from the owner's confirmed acceptance/final audit:

| Evidence | Result / limit |
| --- | --- |
| GEO-1D Development acceptance | 112/112 A–Q PASS |
| Real-AI Development acceptance | 64/64 live PASS |
| Public Web real-AI chain | Login/upload/function/OpenAI/render PASS |
| Recommendation live-write composition | 39/39 PASS; three mutation modes fail as required |
| TypeScript final audit | Root / Mobile / Restaurant / Admin PASS |
| Database source at runtime baseline | 91 migrations; not a claim that the Development migration ledger is drift-free |
| Production | Untouched; zero requests in the accepted public Web round |

The documentation round does not rerun live acceptance, deploy functions, modify Development/Vercel, or access Production. Physical Push delivery/tap and handset GPS/OS permission/settings acceptance are not included in the above passes.

## 8. Environment inventory and safe operation

[.env.example](.env.example) is an inventory with placeholders and mock/disabled defaults, not a live credential file or an instruction to deploy. Copy only the keys needed by a given app or server into its private configuration channel. Never upload the entire example as Expo/Vercel public configuration. Browser-public publishable credentials are not server secrets, but no live value is committed here. **The Recommendation repair added no environment variable.**

For the accepted photo-demo activation, the nine public inputs have this contract (the example keeps activation disabled):

| Public key | Explicit accepted activation requirement |
| --- | --- |
| `EXPO_PUBLIC_TASTKIND_ENVIRONMENT` | `development` |
| `EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE` | `supabase-live` |
| `EXPO_PUBLIC_TASTKIND_CONSUMER_PROFILE_SOURCE` | `supabase-live` |
| `EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED` | `true` |
| `EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED` | `true` for the explicitly enabled photo path; not blanket write authority |
| `EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL` | Exact authorized Development project URL, checked by source |
| `EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY` | Privately provisioned browser-public credential for that Development project |
| `EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_PHOTO_UPLOAD_SOURCE` | `supabase-live` |
| `EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_PHOTO_ANALYSIS_SOURCE` | `supabase-live` |

[Consumer environment validation](apps/mobile/features/consumer-auth/supabaseConsumerEnvironment.ts) refuses wrong/missing project or environment before SDK construction; there is no redirect to Production or mock-success fallback.

**Expo Web environment inlining.** The canonical Recommendation composition now obtains its Supabase environment through that static Expo-public environment authority, which uses direct `process.env.EXPO_PUBLIC_*` property reads suitable for Web build-time inlining. This is **not** a claim that every historical environment reader has been migrated to that shape. Where a module still reads the environment dynamically, changing a hosted variable does not change an already-built bundle, and on Web such a reader may observe an empty environment.

Other selectors cover meal reads/writes and their separate live opt-ins, Today Intake, planned meals, correction/finalization, recommendation/feedback, catalog, favorites/ratings, and Social/Meal Buddy candidates. Consult their `featureFlags.ts` and composition before enabling; source vocabularies differ (`supabase` versus `supabase-live`, for example). Meal Buddy live candidates deliberately have no mock source. Restriction settings and Taste authority are not arbitrary new environment toggles.

Mechanical source inventory at the runtime baseline: **56 active supported configuration keys**, all represented in `.env.example`, plus **10 preserved legacy/test entries** = **66 assignment keys**, with **0 intended missing keys**. The 56 comprise 34 Mobile public keys (31 `EXPO_PUBLIC_TASTKIND_*` plus two Supabase aliases and the demo-tools flag), one non-public environment alias, three Restaurant server settings, and 18 Edge/server settings. Enumeration inspected TS/JS property/index reads and environment-reader calls, resolving named environment constants, across `apps`, `packages`, `lib`, and `supabase/functions`; comments were not treated as active reads.

The ten preserved entries are six opt-in Phase 1C smoke keys, two legacy `NEXT_PUBLIC_SUPABASE_*` names, and `TASTKIND_SUPABASE_READONLY_FALLBACK_TO_MOCK` / `TASTKIND_SUPABASE_TRANSPORT`. The latter four have no active runtime read in this inventory and do not activate an Admin backend or a live fallback.

Intentionally outside the configurable inventory: framework-owned `NODE_ENV`; test/harness-only keys under `scripts` beyond the six retained legacy smoke entries; and the ten ambient PostgreSQL names `PGAPPNAME`, `PGBACKOFF`, `PGDEBUG`, `PGFETCH_TYPES`, `PGKEEP_ALIVE`, `PGMAX_LIFETIME`, `PGMAX_PIPELINE`, `PGPUBLICATIONS`, `PGTARGETSESSIONATTRS`, `PGTARGET_SESSION_ATTRS`.

**Ambient PostgreSQL variables — scope correction.** `supabase/functions/_shared/social-runtime-transport/executorTransportConfig.ts` **defines** `SOCIAL_RUNTIME_POSTGRES_AMBIENT_ENV_NAMES` and `assertNoAmbientPgEnvironment`, which refuse any non-empty ambient value and report names only. At this baseline the **only caller** of that assertion is the Development live acceptance harness, `scripts/social-runtime-transport-sr1b-d2-b3-development-live.ts`. The deployed Deno transport, `denoPostgresExecutorTransport.ts`, loads its transport configuration but does not invoke that assertion. Read this as: the **acceptance harness** checks and refuses ambient PostgreSQL variables; do **not** treat that harness evidence as proof that the deployed runtime transport itself enforces the same refusal. The sealed Development Supavisor transaction URL remains the explicit connection setting. A production engineer wiring a new environment should verify this behaviour against the deployed path rather than assuming it.

Server-only analysis config includes the dedicated analysis admin credential, OpenAI provider/model/timeout, and enabled/provider switches. No generic service-role fallback is supported for that admin credential. Opaque-reference keys must be independently provisioned as required by their contracts, not reused as public keys or each other's authority. Push dispatch and Expo provider credentials remain server-only. Geocoding dispatch currently supports a mock provider and disabled mode; external operational geocoder integration/curation is not implied by the config names.

### 8.1 Recommendation feedback

Recommendation feedback carried the **same historical raw Auth construction defect** as the canonical Recommendation composition, and now uses the same governed successor construction semantics.

Its own feedback source selector remains independently required: enabling Recommendation does **not** enable feedback. `consumerRecommendationFeedbackComposition.ts` computes its `flags`/`source` from `getConsumerRecommendationFeedbackRuntimeFlags` separately; only the Auth construction flags were reconciled, and no write capability was expanded.

Non-blocking: that module still retains a legacy dynamic environment reader for its own selector path. If browser feedback is activated later, review Web static environment inlining for it before relying on a hosted variable.

## 9. Local validation and takeover procedure

With existing dependencies, from the repository root:

```sh
npm run typecheck
npm --workspace @haocu/mobile run typecheck
npm --workspace @haocu/restaurant-web run typecheck
npm --workspace @haocu/admin-web run typecheck
node scripts/recommendation-live-write-composition-smoke.mjs
git diff --check
git status --short
```

Use `npm.cmd` on Windows Command Prompt as needed. App typechecks disable incremental output; root is no-emit. The Recommendation integration gate performs no network, database, or repository file writes. No dependency installation, runtime build, migration apply, or live acceptance is needed for this documentation-only successor. Do not regenerate tracked caches or run artifact-emitting historical suites as incidental cleanup.

For subsequent engineering work, first inspect the exact checkout and relevant frozen contract, distinguish known baseline guard failures from candidate regressions, and establish a scoped manifest. Keep secrets and live test identities out of logs. Environment changes, migrations, deployment, and Production access require their own explicit rollout authority; this handoff grants none. The user performs the final push manually.

## 10. Accepted debt and follow-up register

These are explicit handoff items, not hidden mandatory MVP phases:

| Category | Accepted debt / required follow-up |
| --- | --- |
| Device / environment | Physical Push handset delivery/tap; physical GEO GPS and OS permission/settings validation; Development migration ledger drift. Backend/provider and simulated/local acceptance do not certify handset behavior. |
| Tooling / historical | Stale predecessor guards; stale/dead guard references; Codex Windows checkpoint filename-too-long noise; phase-2p guard artifact emission; tracked tsbuildinfo and old caches where applicable. Preserve baseline evidence rather than silently suppressing old failures. |
| Data / curation | Real Taste curation coverage, Meal Context mappings, operational geocoding/provider curation. Contract correctness is not universal data completeness. |
| Post-MVP | Group tables/gatherings; general/manual Meal Buddy live completion; Admin backend; remaining Restaurant write/media/settings surfaces; future 飲食方式 authority. Restaurant remains partially MVP-active and non-blocking, Admin scaffold/future. |
| Non-blocking Web picker rough edge | A third-party unsupported/non-image override can leave the picker request visually stuck, while failing closed with no upload/analysis egress. Investigate as UX/device follow-up without weakening validation. |

### 10.1 Non-blocking review items from the independent Recommendation review

1. `navigateToDemoResult` in `apps/mobile/app/meal-photo.tsx` remains a mildly historical internal identifier, although its comments now correctly describe the real upload-and-analysis chain. Renaming is optional cleanup.
2. Recommendation feedback still has a legacy dynamic environment-reader shape for its own selector path — re-evaluate Web static inlining if browser feedback is enabled (see §8.1).
3. The narrow Phase-2R guard exception in `scripts/consumer-meal-records-phase-2r-guard.mjs` deliberately matches the exact disabled planned-meal write property assignment. Future formatting or refactoring may require updating the guard; it fails loud rather than masking an enabled write.
4. Recommendation construction errors are still intentionally collapsed into the existing fail-closed provider error surface. Richer diagnostics can be considered post-handoff.

### 10.2 Professional-engineer Production checklist

The following are professional-engineer follow-up. They are **not** hidden unfinished MVP runtime phases, and none of them is implied to be complete:

- Production project/environment provisioning
- Deployment and environment matrix
- Secret provisioning
- Secret rotation
- Rate limiting
- Abuse controls
- OpenAI/provider cost controls
- Provider quotas
- Observability
- Logging
- Alerts
- Log/telemetry retention policy
- Backup
- Restore
- Rollback
- Production CORS/domain policy
- Production security review
- Operational runbooks
- Legal/privacy operational review where applicable

## 11. RA-1A — Platform Admin authorization foundation (local, not applied)

RA-1A is the first Admin round after the MVP handoff. It creates the authorization foundation an
Admin console must pass through and **grants no console capability**: no restaurant approval, no
catalog write, no support surface, no moderation action, no private-data projection.

- Migration: `supabase/migrations/20260904010000_platform_admin_authority.sql` (the 92nd).
  **Not applied to Development or Production.** No function was deployed, no remote configuration or
  secret changed, and no Platform Admin has been provisioned.
- Private schema `admin_internal` with four tables — role catalogue, closed permission vocabulary,
  membership, and an append-only audit log with no UPDATE or DELETE policy for any role.
- Two sealed `NOLOGIN NOINHERIT NOBYPASSRLS` roles: `platform_admin_context_reader` owns the three
  client-callable read functions, `platform_admin_write_authority` owns the tables and the
  provisioning functions and is granted to no client role. No `SUPERUSER`, `CREATEDB`, `CREATEROLE`,
  `REPLICATION` or `BYPASSRLS` anywhere.
- The client boundary — `public.platform_admin_current_context_v1()`,
  `platform_admin_has_permission_v1()`, `platform_admin_audit_log_v1()` — takes **no actor
  parameter**; the actor comes only from the verified request subject. Default `PUBLIC` execution is
  revoked; only `authenticated` may execute.
- **Role graph.** `authenticated` receives `EXECUTE` on reader-owned functions and is **never a
  member** of either sealed role; the same holds for `anon`, `authenticator` and `service_role`. The
  migration's only role-membership grants are two transient `postgres` bootstraps, both revoked
  before it commits, so no client can `SET ROLE` to a sealed role or inherit its column privileges.
  `NOINHERIT` is defence in depth, not the protection.
- Provisioning and revocation live in `admin_internal`, are granted to **no role**, and write their
  audit row in the same statement flow as the membership change, including on refusal. There is no
  client-callable make-me-admin path.
- Platform Admin is **not** Restaurant Owner, **not** Consumer, **not** a future Nutritionist, and
  **not** a break-glass authority; the `role_key` CHECK admits `platform_admin` only.
- Server-only contract module: `apps/admin-web/server/platformAdminAuthority.ts`. It holds no
  transport and reads no environment, and fails closed — an unrecognised role or permission is
  `unavailable`, never a silently narrowed admin, and authority failure is never reported as
  "not an admin".
- **Statement order is load-bearing.** Every function's `REVOKE`/`GRANT` runs *before* its
  `ALTER FUNCTION … OWNER TO`. A privilege statement issued after ownership has moved to a sealed
  role is not an error — PostgreSQL warns and changes nothing — so the whole block would silently
  no-op and leave `PUBLIC` holding `EXECUTE` on all five functions. Guard, smoke and mutations pin
  the order; live Development is what found it.
- Validation: `npm run test:platform-admin-ra-1a`, `…-smoke`, `…-mutations`. Two Development-only,
  separately gated utilities complete the round: `…-development-acceptance` (read-only) and
  `…-development-reset` (drops RA-1A objects only, after proving the installation is pristine —
  acceptance infrastructure, never a runtime path). Full detail and the explicit follow-up list are
  in [docs/platform-admin-authority-ra-1a.md](docs/platform-admin-authority-ra-1a.md).

RA-1A Development Acceptance, provisioning the first Platform Admin, and RA-1B (the Admin read API)
are separate rounds and are not started.

Handoff conclusion: the audited declared MVP is ready for professional takeover at `9d68eab2b0833c3a20d35727cff42fd1a403e24b`. Production hardening/deployment and the bounded follow-ups above remain engineering work; this artifact makes no Production or security certification claim.

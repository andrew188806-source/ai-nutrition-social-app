# TastKind／好廚 — authoritative MVP engineer handoff

## 1. Takeover boundary

Audited runtime baseline: `0bedb4159fff885509beaac4494e4e74a4a2f146` — `Fix public demo SPA routing`, on `main`. The handoff-document commit is its documentation-only successor, changing only `README.md`, `ENGINEER_HANDOFF.md`, and `.env.example`. It introduces no product, schema, function, or deployment change.

The declared MVP mainline is complete. Recorded closure dispositions are `GEO_FINAL_CLOSURE_NO_CODE_REQUIRED` and `MVP_FINAL_AUDIT_PASS / HANDOFF_ARTIFACT_RECOMMENDED`. No hidden mandatory product/runtime phase remains before professional engineer handoff at this audited baseline.

This document states current takeover status; source and frozen phase contracts supply detailed authority. Historical roadmap/phase documents are useful evidence, not instructions to restart completed phases. Completion is bounded to the declared MVP and Development acceptance, not Production certification, security certification, or physical-device acceptance.

## 2. Repository surfaces and entry points

| Surface | Current responsibility / source entry |
| --- | --- |
| Expo Mobile / Web | `apps/mobile/app` routes; [consumer composition](apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts) binds authenticated capabilities, repositories, and lifecycle isolation. |
| Shared authority | `packages/shared/src/domain` contains domain contracts/engines; `packages/services` contains service boundaries and remaining placeholders, not a blanket live implementation. |
| Supabase database | `supabase/migrations`: 91 migrations at the audited runtime baseline. Private authority, RLS, role-limited operations, and approved projections/RPCs are separate from public DTOs. Preserve frozen migration bytes. |
| Edge Functions | `supabase/functions`: analysis, Social candidates/profile/Taste, Meal Buddy cards/discovery/relationships/chat/push, and GEO. `_shared` carries server-side contracts, opaque references, composition, and executor transport. |
| Restaurant Web | `apps/restaurant-web`: partially MVP-active, incomplete but non-blocking. [Runtime service factory](apps/restaurant-web/services/restaurant-runtime-service-factory.ts) selects mock/disabled or owner-RPC live reads and explicitly marks unsupported console surfaces. |
| Admin Web | `apps/admin-web`: scaffold/future backend; rendered screens are not evidence of live admin authority. |
| Public Vercel demo | [haocu-demo.vercel.app](https://haocu-demo.vercel.app/), Expo Web, Root Directory `apps/mobile`; [SPA config](apps/mobile/vercel.json). |
| Validation / frozen design | `scripts`, `docs`, and the named commits below. Check each harness's scope and side effects before use. |

Consumer routes include `/meal-photo`, `/analysis`, `/today-intake`, `/meal-log`, `/recommendation`, `/restaurants`, and `/meal-buddies`. Relationship/chat UI belongs to the Meal Buddy surface. Legacy local demo stores and group-table presentation remain; do not mistake them for the live repository authority or create a second canonical write path around them.

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

Accepted path: real Development Supabase login → browser-safe image materialization → real private actor-scoped Storage upload → real `meal-photo-analysis` **v40** → real server-side OpenAI → validated response → rendered AI result. This is not mock Auth, upload, or analysis. Exact demo-origin CORS, no direct browser OpenAI call, no server-secret leakage, and zero Production requests were accepted.

SPA direct/refresh access to `/meal-photo`, `/analysis`, and `/meal-buddies` is accepted. Vercel reads the fallback in `apps/mobile/vercel.json` because its Root Directory is `apps/mobile`; the repository-root `vercel.json` is not that deployment's configuration authority.

| Runtime commit | Accepted change |
| --- | --- |
| `a8ade613917908baee5a682f33f77aac8de3bbf6` | Fix Expo web meal analysis demo flow |
| `1c0453b366ae29f3c530e628a876fd9c952663b8` | Activate Development AI for public demo |
| `0bedb4159fff885509beaac4494e4e74a4a2f146` | Fix public demo SPA routing |

High-value evidence carried forward from the owner's confirmed acceptance/final audit:

| Evidence | Result / limit |
| --- | --- |
| GEO-1D Development acceptance | 112/112 A–Q PASS |
| Real-AI Development acceptance | 64/64 live PASS |
| Public Web real-AI chain | Login/upload/function/OpenAI/render PASS |
| TypeScript final audit | Root / Mobile / Restaurant / Admin PASS |
| Database source at runtime baseline | 91 migrations; not a claim that the Development migration ledger is drift-free |
| Production | Untouched; zero requests in the accepted public Web round |

The documentation round does not rerun live acceptance, deploy functions, modify Development/Vercel, or access Production. It reruns the four local TypeScript scopes and documentation/env/secret/manifest checks. Physical Push delivery/tap and handset GPS/OS permission/settings acceptance are not included in the above passes.

## 8. Environment inventory and safe operation

[.env.example](.env.example) is an inventory with placeholders and mock/disabled defaults, not a live credential file or an instruction to deploy. Copy only the keys needed by a given app or server into its private configuration channel. Never upload the entire example as Expo/Vercel public configuration. Browser-public publishable credentials are not server secrets, but no live value is committed here.

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

[Consumer environment validation](apps/mobile/features/consumer-auth/supabaseConsumerEnvironment.ts) refuses wrong/missing project or environment before SDK construction; there is no redirect to Production or mock-success fallback. The photo activation readers use static Expo `process.env.EXPO_PUBLIC_*` accesses for Web build-time inlining. This is not evidence that every historical selector is statically inlined or that changing a hosted variable changes an already-built bundle.

Other selectors cover meal reads/writes and their separate live opt-ins, Today Intake, planned meals, correction/finalization, recommendation/feedback, catalog, favorites/ratings, and Social/Meal Buddy candidates. Consult their `featureFlags.ts` and composition before enabling; source vocabularies differ (`supabase` versus `supabase-live`, for example). Meal Buddy live candidates deliberately have no mock source. Restriction settings and Taste authority are not arbitrary new environment toggles.

Mechanical source inventory at the runtime baseline: **56 active supported configuration keys**, all represented in `.env.example`, plus **10 preserved legacy/test entries** = **66 assignment keys**, with **0 intended missing keys**. The 56 comprise 34 Mobile public keys (31 `EXPO_PUBLIC_TASTKIND_*` plus two Supabase aliases and the demo-tools flag), one non-public environment alias, three Restaurant server settings, and 18 Edge/server settings. Enumeration inspected TS/JS property/index reads and environment-reader calls, resolving named environment constants, across `apps`, `packages`, `lib`, and `supabase/functions`; comments were not treated as active reads.

The ten preserved entries are six opt-in Phase 1C smoke keys, two legacy `NEXT_PUBLIC_SUPABASE_*` names, and `TASTKIND_SUPABASE_READONLY_FALLBACK_TO_MOCK` / `TASTKIND_SUPABASE_TRANSPORT`. The latter four have no active runtime read in this inventory and do not activate an Admin backend or a live fallback.

Intentionally outside the configurable inventory: framework-owned `NODE_ENV`; test/harness-only keys under `scripts` beyond the six retained legacy smoke entries; and the ten ambient PostgreSQL names `PGAPPNAME`, `PGBACKOFF`, `PGDEBUG`, `PGFETCH_TYPES`, `PGKEEP_ALIVE`, `PGMAX_LIFETIME`, `PGMAX_PIPELINE`, `PGPUBLICATIONS`, `PGTARGETSESSIONATTRS`, `PGTARGET_SESSION_ATTRS`. The server transport reads those ambient names only to reject non-empty values, not as supported tuning authority. Its sealed Development Supavisor transaction URL is the explicit connection setting.

Server-only analysis config includes the dedicated analysis admin credential, OpenAI provider/model/timeout, and enabled/provider switches. No generic service-role fallback is supported for that admin credential. Opaque-reference keys must be independently provisioned as required by their contracts, not reused as public keys or each other's authority. Push dispatch and Expo provider credentials remain server-only. Geocoding dispatch currently supports a mock provider and disabled mode; external operational geocoder integration/curation is not implied by the config names.

## 9. Local validation and takeover procedure

With existing dependencies, from the repository root:

```sh
npm run typecheck
npm --workspace @haocu/mobile run typecheck
npm --workspace @haocu/restaurant-web run typecheck
npm --workspace @haocu/admin-web run typecheck
git diff --check
git status --short
```

Use `npm.cmd` on Windows Command Prompt as needed. App typechecks disable incremental output; root is no-emit. No dependency installation, runtime build, migration apply, or live acceptance is needed for this documentation-only successor. Do not regenerate tracked caches or run artifact-emitting historical suites as incidental cleanup.

For subsequent engineering work, first inspect the exact checkout and relevant frozen contract, distinguish known baseline guard failures from candidate regressions, and establish a scoped manifest. Keep secrets and live test identities out of logs. Environment changes, migrations, deployment, and Production access require their own explicit rollout authority; this handoff grants none. The user performs the final push manually.

## 10. Accepted debt and follow-up register

These are explicit handoff items, not hidden mandatory MVP phases:

| Category | Accepted debt / required follow-up |
| --- | --- |
| Device / environment | Physical Push handset delivery/tap; physical GEO GPS and OS permission/settings validation; Development migration ledger drift. Backend/provider and simulated/local acceptance do not certify handset behavior. |
| Tooling / historical | Stale predecessor guards; stale/dead guard references; Codex Windows checkpoint filename-too-long noise; phase-2p guard artifact emission; tracked tsbuildinfo and old caches where applicable. Preserve baseline evidence rather than silently suppressing old failures. |
| Data / curation | Real Taste curation coverage, Meal Context mappings, operational geocoding/provider curation. Contract correctness is not universal data completeness. |
| Post-MVP | Group tables/gatherings; general/manual Meal Buddy live completion; Admin backend; remaining Restaurant write/media/settings surfaces; future 飲食方式 authority. Restaurant remains partially MVP-active and non-blocking, Admin scaffold/future. |
| Professional engineer review | Production deployment strategy, environment matrix, secret provisioning/rotation, observability, operations/runbooks, production security review, and asset/ZIP cleanup. Do not infer Production readiness from a Development-backed public demo. |
| Non-blocking Web picker rough edge | A third-party unsupported/non-image override can leave the picker request visually stuck, while failing closed with no upload/analysis egress. This is not an MVP blocker; investigate as UX/device follow-up without weakening validation. |

Handoff conclusion: the audited declared MVP is ready for professional takeover. Production hardening/deployment and the bounded follow-ups above remain engineering work; this artifact makes no Production or security certification claim.

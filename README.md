# TastKind／好廚 — AI nutrition, recommendations, and Meal Buddy Social

TastKind／好廚 is an AI nutrition, meal recommendation, and Meal Buddy Social MVP. The declared MVP mainline is complete for professional engineer handoff; it is no longer a mock-only frontend. Live capabilities remain explicitly configured and actor-scoped, and demo/local branches still exist where noted below.

## Audited baseline and handoff

The audited runtime baseline immediately before this documentation-only successor is `0bedb4159fff885509beaac4494e4e74a4a2f146` (`Fix public demo SPA routing`). This handoff-document commit succeeds that baseline without changing runtime, migrations, or deployment configuration.

Start with [ENGINEER_HANDOFF.md](ENGINEER_HANDOFF.md), the authoritative current takeover document. Frozen phase documents and source remain the detailed authority for individual contracts; older mock-only descriptions and outstanding-phase language are not the current MVP status.

## Implemented MVP surfaces

- Consumer Auth/Profile and meal data runtime; private AI meal-photo upload, server analysis, user-confirmed finalization, Today Intake/canonical meal writes, and recommendation correction/selection.
- Recommendation GEO, REC-C Allergy eligibility, REC-D Ingredient Avoidance eligibility, REC-A Nutrition ranking, and REC-B Taste ranking. Allergy and Ingredient Avoidance have separate private governed settings and candidate evidence; neither is a ranking input.
- Meal Buddy creation from recommendation, Meal Context, Social discovery, participation/block/privacy, profile/interests, invite/accept, relationship, chat, realtime backend, push backend/provider, and unfriend.
- Meal Buddy GEO using private exact selected-card→branch authority and the shared foreground/session location provider.
- Public Expo Web demo with real Development-backed Auth, private Storage, meal-photo analysis, and server-side OpenAI.

Recommendation authority order:

```text
GEO → REC-C Allergy eligibility → REC-D Ingredient Avoidance eligibility
    → REC-A Nutrition → REC-B Taste
```

Excluded candidates cannot re-enter later stages. Eligibility does not become Nutrition or Taste score authority.

Meal Buddy discovery authority order:

```text
Social eligibility → deterministic selected card / Meal Context
  → exact private selected-card branch binding → GEO 5000m inclusive narrowing
  → existing Social/Taste ranking → entitlement/exposure → public projection
```

GEO is optional and foreground-only: no startup/background acquisition, distance score, distance tie-break, radius widening, or public Social coordinates/branch IDs/raw distances. Exactly 5000m is eligible; valid zero-nearby remains an honest empty result. Denied, unsupported, or services-disabled location leaves the non-GEO path usable. Physical handset Push delivery/tap and GPS/OS permission acceptance remain follow-up, not claimed passes.

## Public demo and environment posture

[Open the public demo](https://haocu-demo.vercel.app/). It intentionally uses **tastkind-development**, not Production. The accepted Web path is real Supabase login → browser-safe image materialization → private actor-scoped Storage upload → `meal-photo-analysis` v40 → server-side OpenAI → validated response → rendered result. The browser does not call OpenAI or receive server secrets.

Exact-origin CORS and SPA direct/refresh routing for `/meal-photo`, `/analysis`, and `/meal-buddies` are accepted. Vercel's Root Directory is `apps/mobile`, so its SPA fallback comes from `apps/mobile/vercel.json`, not the repository-root file.

Development is the accepted live backend for these demo/runtime rounds. Production received zero acceptance requests and remains untouched. This MVP freeze does **not** certify Production rollout or security; deployment strategy and hardening remain professional-engineer follow-up.

## Partial, scaffold, and post-MVP scope

- Group tables/gatherings and general/manual Meal Buddy completion still have demo/local paths; they are not the recommendation-backed live creation authority.
- Restaurant Web is partially MVP-active, with owner-scoped live reads; remaining write/media/settings and other deferred console surfaces are incomplete but non-blocking.
- Admin Web is a scaffold/future backend surface.
- Future 飲食方式 authority is not implemented by Allergy, Ingredient Avoidance, or Taste.

No hidden mandatory product/runtime phase remains before professional engineer handoff at this audited baseline. Accepted debt and its boundaries are recorded in the handoff document.

## Repository and local checks

| Surface | Location |
| --- | --- |
| Expo Mobile / Web and consumer feature composition | `apps/mobile` |
| Restaurant Web / Admin Web | `apps/restaurant-web` / `apps/admin-web` |
| Shared domain contracts and service boundaries | `packages/shared` / `packages/services` |
| Database authority / Edge Functions | `supabase/migrations` / `supabase/functions` |
| Frozen contracts and focused validation | `docs` / `scripts` |

[.env.example](.env.example) is a safe, non-live inventory, not a deployment recipe. Keep server-only values out of Expo/public environment settings. A feature selector is not permission to bypass its Auth, ownership, write opt-ins, or environment gates.

From the repository root with the existing dependencies:

```sh
npm run typecheck
npm --workspace @haocu/mobile run typecheck
npm --workspace @haocu/restaurant-web run typecheck
npm --workspace @haocu/admin-web run typecheck
```

On Windows Command Prompt use `npm.cmd` if required. `npm run demo` / `npm run mobile` are local launchers; they do not prove live activation. See the handoff before running historical guards or any live acceptance/deployment command.

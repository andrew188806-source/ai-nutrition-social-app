# Consumer Runtime Integration Phase 1D - Development Live Profile Read

Date: 2026-07-12
Status: Implementation complete. Guard complete. Development live verification pending until an opted-in smoke reads an existing development profile row. Phase 2 not started.

## Scope

Phase 1D adds a development-only authenticated Consumer Profile read path for the current signed-in user. It uses the Phase 1C Auth session lifecycle, reads only the approved profile table, maps the row into the canonical `ConsumerProfile` type, and fails closed on missing session, expired session, not-found rows, mapping failures, configuration failures, or transport failures.

Phase 1D does not wire Mobile UI, execute SQL, create migrations, seed data, bootstrap profiles, write profiles, read meal records, read recommendations, change social data, change Restaurant Web, or change Admin Web.

## Defaults

Default runtime remains mock and disabled:

- `AUTH_SOURCE=mock`
- `PROFILE_SOURCE=mock`
- `AUTH_ENABLED=false`
- `WRITES_ENABLED=false`

The only accepted development live profile read combination is:

- `AUTH_SOURCE=supabase-live`
- `AUTH_ENABLED=true`
- `PROFILE_SOURCE=supabase-live`
- `WRITES_ENABLED=false`

Invalid combinations fail closed with typed configuration errors. There is no mock fallback from a broken live profile configuration.

## Architecture

Phase 1D keeps Supabase SDK access inside the Mobile Consumer Auth/Profile boundary:

- `supabaseProfileContracts.ts` defines the profile table allowlist, selected columns, row shape, and minimal PostgREST-like client contract.
- `supabaseProfileMappers.ts` maps raw snake_case rows into canonical `ConsumerProfile` objects and rejects malformed rows.
- `adapters/supabaseConsumerProfileRepository.ts` implements `getCurrentProfile()` by reading the authenticated session from `ConsumerAuthPort` and querying the profile row owned by that session user.
- `consumerProfileService.ts` exposes the app-facing current-profile service boundary.
- `factories.ts` creates the live repository only with explicit live Auth flags, an Auth port, and a profile-capable client.

## Ownership Boundary

The live profile read path is current-user only:

- successful API: `getCurrentProfile()`.
- query owner: current authenticated canonical session `userId`.
- table allowlist: `consumer_profiles`.
- filter: `user_id = session.user.userId`.
- arbitrary user-id lookup: rejected by the live repository compatibility method.

No UI, route, or service caller is given an arbitrary `getProfileByUserId(userId)` style live API.

## Typed Error Behavior

Phase 1D adds profile-specific typed errors:

- `profile_session_missing`
- `profile_session_expired`
- `profile_unauthorized`
- `profile_not_found`
- `profile_mapping_failed`
- `profile_transport_failed`
- `profile_configuration_invalid`
- `profile_source_unavailable`

`profile_not_found` is terminal for Phase 1D. The runtime must not auto-create, bootstrap, insert, upsert, update, or silently fall back to mock data.

## Guards

`npm run test:consumer-phase1d` verifies:

- default mock flags remain unchanged.
- approved live profile flags are accepted.
- invalid flag combinations fail closed.
- SDK imports and `createClient` remain limited to `supabaseSdkLoader.ts`.
- Mobile UI, Restaurant Web, and Admin Web do not import Consumer Auth/Profile.
- database reads are limited to the approved Phase 1D profile adapter.
- the only approved profile table is `consumer_profiles`.
- no profile writes, RPC, Storage, Realtime, direct fetch, secret, or privileged key is introduced.
- fake transport verifies current-session ownership, canonical mapping, not-found, missing session, expired session, unauthorized, mapping failure, transport failure, read-disabled, and arbitrary lookup rejection.

The guard does not read real Supabase credentials, create a real Supabase client, or make network requests.

## Development Live Smoke

Development live profile smoke is available through:

`npm run test:consumer-phase1d-live-smoke`

The script is opt-in only. It requires local, uncommitted environment values:

- `TASTKIND_CONSUMER_PHASE1D_LIVE_PROFILE_SMOKE=true`
- `EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE=supabase-live`
- `EXPO_PUBLIC_TASTKIND_CONSUMER_PROFILE_SOURCE=supabase-live`
- `EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED=true`
- `EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED=false`
- development Supabase public URL and publishable/anon key
- smoke test email/password

The script signs in through the Phase 1C Auth adapter, reads the authenticated user's current profile through the Phase 1D repository, and signs out. It does not print URL, key, email, password, access token, refresh token, user ID, or session values. If the profile row is missing, it reports a blocked `profile_not_found` result and does not write or bootstrap.

## Not Done

- Mobile UI wiring.
- Navigation wiring.
- Consumer Profile write/bootstrap.
- Consumer private profile reads.
- Consumer preferences, taste profile, meal, recommendation, social, order, payment, or sharing reads.
- SQL, migration, seed, RLS verification.
- Supabase Storage, Realtime, anonymous Auth, password reset.
- Restaurant Web or Admin runtime changes.
- Production credentials or production readiness.

## Result

Consumer Runtime Integration Phase 1D is implementation-complete and guard-verified for the development live current-profile read architecture. It is not frozen until an opted-in live smoke successfully reads an existing development `consumer_profiles` row. Phase 2 has not started.

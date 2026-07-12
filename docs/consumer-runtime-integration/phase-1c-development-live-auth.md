# Consumer Runtime Integration Phase 1C - Development Live Auth

Date: 2026-07-12
Status: Implementation complete. Guard complete. Development live verification complete. Phase 1D not started.

Note: this document records the Phase 1C freeze state. Phase 1D was started later by explicit approval and is documented in `docs/consumer-runtime-integration/phase-1d-development-live-profile-read.md`.

## Scope

Phase 1C enables the Mobile Consumer Auth transport architecture for development-only Supabase email Auth. It does not wire UI, activate Consumer Profile live reads/writes, execute database queries, execute SQL, create migrations, seed data, enable anonymous Auth, enable password reset, or start Phase 1D.

## Defaults

Default runtime remains mock and disabled:

- `AUTH_SOURCE=mock`
- `PROFILE_SOURCE=mock`
- `AUTH_ENABLED=false`
- `WRITES_ENABLED=false`

The only accepted live Auth combination is:

- `AUTH_SOURCE=supabase-live`
- `AUTH_ENABLED=true`
- `PROFILE_SOURCE=mock` or `supabase-disabled`
- `WRITES_ENABLED=false`

All other combinations fail closed with typed configuration or operation errors.

## Architecture Summary

Phase 1C keeps the existing repository/service boundary and opens only the Auth transport path:

- `featureFlags.ts` validates mock/default and development live Auth flag combinations.
- `supabaseConsumerClientFactory.ts` creates a Supabase client only when flags, public env, storage, and SDK loader are all present.
- `supabaseSdkLoader.ts` is the only file importing `@supabase/supabase-js`, `react-native-url-polyfill`, `createClient`, and `processLock`.
- `factories.ts` returns `MockConsumerAuthAdapter`, `SupabaseDisabledConsumerAuthAdapter`, or `SupabaseConsumerAuthAdapter` without silently falling back from broken live configuration.
- `supabaseConsumerAuthAdapter.ts` maps email sign-in, email sign-up, sign-out, session restore, session refresh, and auth observer events through typed results.
- `asyncStorageConsumerAuthStorage.ts` is the React Native AsyncStorage boundary for development live Auth.
- `appStateRefreshLifecycle.ts` and `reactNativeAppStateSource.ts` isolate AppState refresh lifecycle behavior.
- `sessionStateStore.ts` exposes restore, sign-in, sign-up, refresh, sign-out, and observer state handling without importing Supabase SDK.

## Email Sign-Up

Supabase sign-up can return either an authenticated session or no session when email confirmation is required. Phase 1C maps a no-session sign-up response to `email_confirmation_required` rather than treating it as a successful signed-in state.

## Guard

`npm run test:consumer-phase1c` verifies:

- mock/default flags remain unchanged.
- development live Auth flags are accepted only in the approved combination.
- invalid flags fail closed.
- live factory requires env, storage, and SDK loader.
- fake SDK loader creates a live auth adapter without loading the official SDK.
- sign-in, sign-up, sign-out, restore, refresh, auth observer, unsubscribe, and AppState lifecycle mapping work against fake transport.
- password reset remains disabled.
- profile live runtime remains disabled.
- SDK imports and `createClient` remain limited to `supabaseSdkLoader.ts`.
- UI, Restaurant Web, and Admin do not import Consumer Auth.
- no service-role/secret key, database query/write, storage upload, explicit network call, SQL, migration, or seed is introduced.

The guard does not read real Supabase credentials, create a real Supabase client, or make network requests.

## Development Live Smoke

Development live smoke verification is available through:

`npm run test:consumer-phase1c-live-smoke`

The script is opt-in only. It requires local, uncommitted environment values:

- `TASTKIND_CONSUMER_PHASE1C_LIVE_SMOKE=true`
- `EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE=supabase-live`
- `EXPO_PUBLIC_TASTKIND_CONSUMER_PROFILE_SOURCE=mock`
- `EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED=true`
- `EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED=false`
- development Supabase public URL and publishable/anon key
- smoke test email/password

Optional email sign-up smoke requires a separate explicit opt-in:

- `TASTKIND_CONSUMER_PHASE1C_SMOKE_SIGN_UP_ENABLED=true`
- sign-up smoke email/password

The script verifies email sign-in, get/restore session, refresh session, auth observer, sign-out, optional sign-up, and AppState lifecycle using only publishable/anon credentials. It does not print URL, key, email, password, access token, refresh token, user ID, or session values.

Development live smoke result:

- Email sign-in passed.
- Session restore passed.
- Session refresh passed.
- Auth observer saw the sign-in event.
- Sign-out passed.
- Restore after sign-out passed.
- Observer unsubscribe passed.
- AppState lifecycle passed.
- Optional email sign-up was skipped because explicit sign-up opt-in was not enabled.
- Sign-up mapping and `email_confirmation_required` behavior are covered by `npm run test:consumer-phase1c`.
- `credentialsPrinted=false`
- `tokenPrinted=false`
- `sessionPrinted=false`
- `databaseReadOrWriteUsed=false`
- `sqlExecuted=false`
- `migrationCreated=false`
- `seedExecuted=false`

## Not Done

- Mobile UI wiring.
- Navigation wiring.
- Consumer Profile live read/write.
- Profile bootstrap write.
- Consumer database reads/writes.
- SQL, migration, seed, RLS verification.
- Supabase Storage, Realtime, anonymous Auth, password reset.
- Meal, recommendation, social, orders, payments runtime changes.
- Restaurant Web or Admin runtime changes.
- Production credentials or production deployment.

## Result

Consumer Runtime Integration Phase 1C is implementation-complete, guard-verified, and development-live-smoke verified. It is a Phase 1C freeze candidate. It is not a production Auth activation and does not authorize Phase 1D.

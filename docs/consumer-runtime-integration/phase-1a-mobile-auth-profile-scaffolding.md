# Consumer Runtime Integration Phase 1A - Mobile Auth / Profile Scaffolding

Date: 2026-07-12
Status: Complete as scaffold only. Not live-auth integrated. Not RLS verified. Not production-ready.

## 1. Scope

Phase 1A creates a provider-independent Mobile Consumer Auth and Consumer Profile runtime boundary. It is architecture scaffolding, mock behavior, disabled Supabase contracts, fake-client tests, and guard checks only.

It does not change Mobile UI, navigation, copy, social logic, meal logic, Restaurant runtime, Admin runtime, SQL, migrations, seeds, or live Supabase state.

## 2. Frozen Schema Authority

The scaffolding follows the Consumer Schema Phase 1.2 frozen candidate:

- `docs/consumer-schema-freeze-manifest.md`
- `docs/consumer-schema-decision-register.md`
- `docs/consumer-schema-runtime-handoff.md`
- `docs/supabase-consumer-schema-drafts/001_consumer_enums_and_helpers.sql` through `015_consumer_validation_queries.sql`

Phase 1A does not modify the frozen SQL drafts.

## 3. Existing Mobile Auth Inventory

Current Mobile still uses demo/local sources for visible behavior:

- demo plan toggle: `apps/mobile/features/demo-user-plan/demoUserPlanStore.ts`
- Community Profile display resolver and demo profiles: `apps/mobile/features/display-resolvers/communityProfileDisplayResolver.ts`, `apps/mobile/features/meal-buddy-card/mealBuddyFlowMock.ts`
- storage helper: `apps/mobile/lib/storage.ts`
- social/meal-buddy stores remain unchanged.

No existing UI screen was switched to the new scaffold.

## 4. Auth Canonical Model

Created canonical runtime types in `apps/mobile/features/consumer-auth/types.ts`:

- `ConsumerAuthUser`
- `ConsumerAuthSession`
- `ConsumerAuthState`
- `ConsumerAuthProvider`
- `ConsumerAuthError`
- `ConsumerAuthResult`

The canonical auth user includes `userId`, provider, anonymous flag, email verification status, creation time, and optional last sign-in time. It does not store passwords, password hashes, refresh tokens, service credentials, raw provider objects, or provider-specific metadata.

## 5. Profile Canonical Model

Created Consumer Profile runtime types:

- `ConsumerProfile`
- `ConsumerPrivateProfile`
- `ConsumerProfileBootstrapInput`
- `ConsumerProfileBootstrapResult`
- `ConsumerProfileUpdateInput`
- `ConsumerAccountLifecycleStatus`

`ConsumerProfile` is intentionally limited to account/profile display and preference scaffolding: user/profile IDs, display name, optional avatar reference, locale, timezone, units, lifecycle status, onboarding state, and timestamps.

Sensitive areas such as birthday, health goals, nutrition goals, allergies, dietary restrictions, location, meal history, ratings, and favorites remain out of the public profile scaffold.

## 6. Auth Port

Created `ConsumerAuthPort` in `apps/mobile/features/consumer-auth/ports.ts` with:

- `getCurrentSession()`
- `observeAuthState()`
- `signIn()`
- `signUp()`
- `signOut()`
- `refreshSession()`
- `sendPasswordReset()`
- `restoreSession()`

Implementations must clean up observers and must not leak provider-specific objects outside the adapter boundary.

## 7. Profile Repository

Created `ConsumerProfileRepository` with:

- `getProfile(userId)`
- `getPrivateProfile(userId)`
- `bootstrapProfile(input)`
- `updateProfile(userId, input)`
- `markOnboardingComplete(userId)`
- `getAccountLifecycleStatus(userId)`

`userId` is the ownership key. The repository does not use social IDs, chat IDs, table IDs, or username strings as identity.

## 8. Mock Adapter

Created:

- `MockConsumerAuthAdapter`
- `MockConsumerProfileRepository`
- `MemoryConsumerAuthStorage`

Mock behavior supports signed-out state, mock sign-in, mock sign-up, sign-out, session restore, auth observer cleanup, disabled account simulation, expired session simulation, idempotent profile bootstrap, and storage cleanup.

Mock data is artificial and is not connected to live Supabase.

## 9. Supabase-Disabled Skeleton

Created:

- `SupabaseDisabledConsumerAuthAdapter`
- `SupabaseDisabledConsumerProfileRepository`

These classes implement the contracts but do not import Supabase SDKs, do not create clients, do not call REST, and do not perform reads or writes. Live operations return typed disabled/not-enabled errors.

This gives Phase 1B a contract without creating network behavior in Phase 1A.

## 10. Feature Flags

Created `getConsumerRuntimeFlags()` with these environment names:

- `EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE`
- `EXPO_PUBLIC_TASTKIND_CONSUMER_PROFILE_SOURCE`
- `EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES`

Supported source values:

- `mock`
- `supabase-disabled`
- `supabase-live`

Defaults are mock. Unknown values fail closed to `supabase-disabled`. `supabase-live` records a Phase 1A issue and still resolves to disabled adapters through the factory. Writes remain disabled.

## 11. Factory Selection

Created:

- `createConsumerAuthPort()`
- `createConsumerProfileRepository()`
- `createConsumerAuthScaffold()`
- `assertConsumerRuntimeFlags()`

Mock mode returns mock adapters. Supabase-disabled mode returns disabled skeletons. Supabase-live is intentionally mapped to disabled skeletons for Phase 1A.

The factory does not mix mock auth with Supabase profile repository unless a caller manually wires it in a test.

## 12. Session State Boundary

Created `ConsumerAuthStateStore` as a non-UI state boundary. It supports subscribe, start, stop, restore, sign-in, and sign-out against the auth port.

UI screens do not import it yet. Route guards and hooks remain future work.

## 13. Storage Strategy

Created storage boundary types:

- `ConsumerAuthStorage`
- `MemoryConsumerAuthStorage`
- `consumerAuthStorageKeys`

Phase 1A does not store live access tokens in app storage. Mock session storage is isolated under a mock key.

## 14. Bootstrap Flow

Created `ConsumerProfileBootstrapService`.

Flow:

1. Read current auth session.
2. Return authentication-required if missing.
3. Use session `userId` as the only owner key.
4. Reject mismatched requested userId.
5. Check lifecycle status and fail closed for disabled/deletion/anonymization states.
6. Return existing profile if present.
7. Bootstrap mock profile in mock mode when allowed.
8. Block Supabase profile writes with `ConsumerProfileWriteNotEnabledError` when writes are disabled.

## 15. Error Model

Created typed errors:

- `ConsumerAuthenticationRequiredError`
- `ConsumerAuthProviderNotConfiguredError`
- `ConsumerAuthOperationNotEnabledError`
- `ConsumerProfileNotFoundError`
- `ConsumerProfileWriteNotEnabledError`
- `ConsumerProfileMappingError`
- `ConsumerSessionExpiredError`
- `ConsumerAccountDisabledError`
- `ConsumerAuthConfigurationError`

Errors do not include tokens, keys, full URLs, passwords, raw provider responses, or secrets.

## 16. Tests

Created `scripts/consumer-auth-phase-1a-guard.mjs` and root script:

`npm run test:consumer-phase1a`

The guard verifies:

- required files exist.
- source has no Supabase SDK import.
- source has no client creation.
- source has no `fetch` or `XMLHttpRequest`.
- source has no service-role/secret-key strings.
- UI app/components do not import the Consumer auth scaffold.
- `package-lock.json` is unchanged.
- fake-client auth/profile flows pass.

Fake-client coverage includes signed-out initial state, mock sign-in, sign-out, session restore, observer cleanup, profile lookup, idempotent bootstrap, mismatched userId rejection, disabled lifecycle fail-closed behavior, missing session error, Supabase-disabled profile write blocking, unknown flag fail-closed behavior, and factory selection.

## 17. Files Modified

- `apps/mobile/features/consumer-auth/*`
- `scripts/consumer-auth-phase-1a-guard.mjs`
- `apps/mobile/tsconfig.json`
- `package.json`
- `docs/consumer-runtime-integration/phase-1a-mobile-auth-profile-scaffolding.md`
- `docs/consumer-schema-runtime-handoff.md`
- `docs/consumer-schema-freeze-manifest.md`
- `docs/tastkind-canonical-data-integration-status.md`

## 18. UI Changes

None.

## 19. Runtime Behavior Changes

No existing Mobile runtime flow was switched to this scaffold. Existing demo behavior remains unchanged.

## 20. Network Requests

None from the Consumer Auth/Profile scaffold. Supabase-disabled adapters do not import SDKs, create clients, call REST, or use fetch.

## 21. Writes

No Consumer Supabase writes. No SQL. No migration. No seed.

## 22. Credentials

No project URL, publishable key, secret key, service-role key, token, password, or provider raw session is stored or printed by this scaffold.

## 23. SQL / Migration / Seed

None executed and none created.

## 24. Known Limitations

- No live Supabase Auth transport exists.
- No Supabase profile read/write exists.
- No route guard is wired to UI.
- No onboarding UI is connected.
- No Consumer RLS verification exists.
- No production auth/session storage policy exists.
- Mock profile scaffold is separate from current social/community demo profile data.

## 25. Next Phase Recommendation

Next allowed phase: `Consumer Runtime Integration Phase 1B - Supabase Auth Transport Preparation`.

Phase 1B should remain disabled-by-default and should prepare provider mapping, fake Supabase client tests, and auth transport contracts before any live sign-in/sign-up/sign-out request is allowed.
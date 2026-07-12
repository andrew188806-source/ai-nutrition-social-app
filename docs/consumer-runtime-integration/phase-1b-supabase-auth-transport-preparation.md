# Consumer Runtime Integration Phase 1B - Supabase Auth Transport Preparation

Date: 2026-07-12
Status: Complete. Official SDK dependencies are installed and the SDK-backed lazy-loader boundary is wired, but live Auth/Profile runtime remains disabled by default.

## 1. Scope

Phase 1B prepares the Mobile Consumer Auth transport boundary for a future Supabase JavaScript Auth adapter. This phase is not live Auth activation.

It does not perform sign-up, sign-in, sign-out, password reset, session refresh, Supabase network requests, Consumer Profile live reads/writes, SQL, migration, seed, RLS activation, Auth provider setup, email setup, OAuth setup, UI changes, MealRecord runtime, Admin Consumer governance, social, orders, or payments.

## 2. Phase 1A Baseline

Phase 1A remains intact:

- canonical Consumer Auth/Profile runtime types.
- `ConsumerAuthPort`.
- `ConsumerProfileRepository`.
- mock Auth/Profile adapters.
- Supabase-disabled skeleton.
- feature flags, factories, session boundary, and profile bootstrap service.

Phase 1B adds SDK-independent provider contracts and mapping preparation without replacing Phase 1A behavior.

## 3. Dependency Inventory

Current Mobile dependency inventory:

| Dependency | Status | Notes |
| --- | --- | --- |
| Expo | present: `^54.0.0` | current Mobile runtime |
| React Native | present: `0.81.5` | current Mobile runtime |
| `@react-native-async-storage/async-storage` | present: `2.2.0` | existing storage dependency |
| `@supabase/supabase-js` | installed: `2.110.2` (`^2.110.2`) | official SDK dependency, allowed only in `supabaseSdkLoader.ts` |
| `react-native-url-polyfill` | installed: `3.0.0` (`^3.0.0`) | allowed only in `supabaseSdkLoader.ts` |
| `expo-secure-store` | not installed | deferred production storage decision |
| `react-native-get-random-values` | not installed | not added in Phase 1B |

## 4. Dependency Installation Result

Dependency command:

`npm.cmd install --workspace @haocu/mobile @supabase/supabase-js react-native-url-polyfill`

Result:

- dependency installation was completed manually by the user with npm.
- `apps/mobile/package.json` and root `package-lock.json` are consistent.
- installed versions are `@supabase/supabase-js@2.110.2` and `react-native-url-polyfill@3.0.0`.
- Expo remains `^54.0.0` / installed `54.0.34`; React Native remains `0.81.5`.
- Phase 1B is marked `Supabase Auth Transport Preparation Complete`.

No fallback Auth REST client was created.

## 5. Auth Transport Decision

Accepted decision: future Consumer Auth transport should use official `@supabase/supabase-js`, not a hand-rolled GoTrue REST Auth client.

Reason:

- session persistence.
- refresh-token rotation.
- auth state events.
- session restoration.
- provider error normalization.
- React Native lifecycle handling.
- future OAuth/provider support.

The official SDK import is wired only through `apps/mobile/features/consumer-auth/supabaseSdkLoader.ts`. The loader is lazy: importing the module does not create a Supabase client, and tests do not invoke it with real credentials.

## 6. Environment Contract

Future Mobile Consumer Supabase env names:

- `EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL`
- `EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE`
- `EXPO_PUBLIC_TASTKIND_CONSUMER_PROFILE_SOURCE`
- `EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED`
- `EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED`

Defaults remain:

- `AUTH_SOURCE=mock`
- `PROFILE_SOURCE=mock`
- `AUTH_ENABLED=false`
- `WRITES_ENABLED=false`

Unknown values fail closed. Mobile must not read Restaurant Web `.env.local`, development project credentials, service-role keys, or secret keys.

## 7. Client Factory

Created SDK-independent preparation file:

- `apps/mobile/features/consumer-auth/supabaseConsumerClientFactory.ts`

The factory:

- is lazy.
- requires explicit env and storage.
- accepts an injected SDK loader for future tests/runtime.
- does not import `@supabase/supabase-js` outside the approved lazy loader.
- does not create any client in mock/disabled mode.
- fails closed when SDK loader or config is missing.

## 8. Client Options

Prepared future option shape:

- `persistSession: true`
- `autoRefreshToken: true`
- `detectSessionInUrl: false`
- platform storage adapter placeholder

No access token, refresh token, provider token, raw session, or client object is exposed to canonical UI/session state.

## 9. Storage Strategy

Phase 1B keeps the Phase 1A memory/mock storage boundary.

Storage decision:

- fake tests use memory storage.
- development live Auth should use an explicit adapter in a later phase.
- production requires a SecureStore/encrypted-storage decision before activation.
- sign-out must clear only auth storage keys, not meal/preference/social app data.

No SecureStore dependency was added.

## 10. AppState Lifecycle

Created:

- `apps/mobile/features/consumer-auth/appStateRefreshLifecycle.ts`

It maps future app lifecycle behavior:

- active -> `startAutoRefresh`.
- background/inactive/unknown -> `stopAutoRefresh`.
- repeated initialize does not duplicate listeners.
- dispose removes listener and stops refresh.

Tests use a fake AppState source and fake auth client only.

## 11. Provider Contracts

Created:

- `apps/mobile/features/consumer-auth/supabaseAuthContracts.ts`

Contracts include:

- `SupabaseAuthUserLike`
- `SupabaseSessionLike`
- `SupabaseAuthResponseLike`
- `SupabaseAuthErrorLike`
- `SupabaseAuthEventLike`
- `SupabaseAuthSubscriptionLike`
- `SupabaseAuthClientLike`

These contracts are adapter-local and intentionally keep SDK imports inside the approved lazy-loader boundary.

## 12. User Mapping

Created mapping:

- `mapSupabaseUserToConsumerAuthUser()`

Mapping rules:

- Supabase `id` -> canonical `userId`.
- provider metadata -> supported provider or fail closed.
- `is_anonymous` -> `isAnonymous`.
- `email_confirmed_at` -> `emailVerified`.
- `created_at` -> `createdAt`.
- `last_sign_in_at` -> `lastSignedInAt`.
- missing ID, unknown provider, or malformed timestamp -> typed mapping error.

## 13. Session Mapping

Created mapping:

- `mapSupabaseSessionToConsumerAuthSession()`

Rules:

- session user is required.
- `expires_at` and `expires_in` normalize to `expiresAt`.
- expired session maps to `ConsumerSessionExpiredError`.
- access token, refresh token, provider token, and provider refresh token are never copied into canonical session output.

## 14. Auth Event Mapping

Created mapping for:

- `INITIAL_SESSION`
- `SIGNED_IN`
- `SIGNED_OUT`
- `TOKEN_REFRESHED`
- `USER_UPDATED`
- `PASSWORD_RECOVERY`

Unknown events fail closed with typed configuration error.

## 15. Error Mapping

Created provider error mapper for:

- invalid credentials.
- email not confirmed.
- user already registered.
- weak password.
- rate limited.
- session expired.
- network/provider unavailable.
- malformed/unknown provider response.

Provider raw payload, token, URL, and credentials are not included in canonical errors.

## 16. Fake Client Tests

Created root script:

`npm run test:consumer-phase1b`

The guard runs fake-client-only tests covering:

- dependency inventory.
- installed SDK dependency state.
- provider user/session mapping.
- missing ID failure.
- unknown auth event fail-closed behavior.
- provider error mapping.
- disabled adapter fail-closed behavior.
- fake injected client getSession mapping.
- auth state observer and unsubscribe cleanup.
- AppState active/background refresh lifecycle.
- lazy factory refusal in mock mode.

## 17. No-Network Verification

The Phase 1B guard verifies Mobile Consumer Auth/Profile source has no:

- `@supabase/supabase-js` import outside `supabaseSdkLoader.ts`.
- real client creation call outside the lazy loader.
- `fetch`.
- `XMLHttpRequest`.
- WebSocket creation.
- service-role or secret-key source strings.

The guard also confirms UI app/components do not import `consumer-auth`.

## 18. Files Modified

- `apps/mobile/features/consumer-auth/supabaseAuthContracts.ts`
- `apps/mobile/features/consumer-auth/supabaseAuthMappers.ts`
- `apps/mobile/features/consumer-auth/supabaseConsumerClientFactory.ts`
- `apps/mobile/features/consumer-auth/appStateRefreshLifecycle.ts`
- `apps/mobile/features/consumer-auth/adapters/supabaseConsumerAuthAdapter.ts`
- `apps/mobile/features/consumer-auth/featureFlags.ts`
- `apps/mobile/features/consumer-auth/types.ts`
- `apps/mobile/features/consumer-auth/index.ts`
- `scripts/consumer-auth-phase-1b-guard.mjs`
- `scripts/consumer-auth-phase-1a-guard.mjs`
- `package.json`
- documentation status files

## 19. Dependencies Modified

None retained.

The dependency installation is complete and represented in `apps/mobile/package.json` plus root `package-lock.json`.

## 20. UI Changes

None.

## 21. Runtime Behavior Changes

No existing Mobile runtime behavior was switched. Mock remains the default.

## 22. Network Requests

No Consumer Auth/Profile network request was made by this phase.

Restaurant Phase 1C/1D GET-only guards remain separate Restaurant read-only verification and do not activate Consumer Auth.

## 23. Consumer Writes

None.

## 24. SQL / Migration / Seed

None executed and none created.

## 25. Credentials

No full Supabase URL, publishable key, secret key, service-role key, token, password, or raw provider session was printed or stored.

## 26. Known Limitations

- Official Supabase SDK is installed but not activated for live Auth.
- URL polyfill is installed but imported only in the approved lazy loader.
- Lazy client factory still cannot create a live client unless a later phase explicitly enables live Auth and supplies config.
- Live Auth operations remain disabled.
- Consumer Profile live reads/writes remain disabled.
- RLS remains unverified.
- Secure production token storage remains undecided.

## 27. Security Review Items

- Token storage strategy for Native/Web.
- SecureStore/encrypted storage decision.
- Refresh lifecycle behavior under app backgrounding.
- Error redaction and provider payload handling.
- Auth state listener cleanup under repeated initialization.
- Future OAuth redirect handling.

## 28. Next Phase Recommendation

Phase 1B is complete. Do not proceed to live Auth activation, Consumer Profile writes, RLS verification claims, or production readiness until a later approved phase.

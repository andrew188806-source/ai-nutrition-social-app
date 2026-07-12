# Supabase Runtime Integration Phase 1B: Dependency Normalization & Feature-Flag Runtime Wiring

Date: 2026-07-11
Status: Blocked by Package Lock Permission

## 1. Scope

Phase 1B was intended to normalize the Restaurant Web Supabase dependency and then wire the Restaurant Web read path through the feature-flagged repository factory.

Planned scope:

- Add `@supabase/supabase-js` to `@haocu/restaurant-web` through npm workspace conventions.
- Keep root `package-lock.json` consistent with package metadata.
- Keep default data source as `mock`.
- Wire Restaurant Web read services through the repository factory only after dependency normalization succeeds.
- Add fake-client rehearsal tests for `supabase-readonly` mode.

## 2. Phase 1A Baseline

Phase 1A remains the current completed runtime state:

- Restaurant Web feature flag config exists.
- Server-only Supabase readonly boundary exists.
- Supabase row types, mappers, and typed errors exist.
- Read-only repository interface exists.
- Mock and Supabase read repository scaffolds exist.
- Repository factory exists.
- Phase 1A guard exists and passes.
- Default data source remains `mock`.

## 3. Dependency Issue and Resolution

Dependency normalization did not complete.

Command attempted:

```text
npm.cmd install --workspace @haocu/restaurant-web @supabase/supabase-js --package-lock-only --ignore-scripts --no-audit --no-fund
```

Result:

```text
EPERM: operation not permitted, open 'D:\haocu app\ai-nutrition-social-mvp\package-lock.json'
```

The lockfile is not marked read-only and can be opened exclusively by PowerShell, but npm cannot write it in this environment. Because the lockfile could not be updated by npm, Phase 1B must stop before runtime wiring.

No manual lockfile edit was made. No corrupted lockfile was produced. The partial `@supabase/supabase-js` package.json write left by npm was removed so package.json and package-lock.json do not disagree.

## 4. npm / Node Versions

Observed local versions:

- npm: `11.12.1`
- Node.js: `v24.15.0`

## 5. Package and Lockfile Changes

Completed:

- `apps/restaurant-web/package.json` retains the Phase 1A `test:phase1a` script.

Not completed:

- `@supabase/supabase-js` was not added because root `package-lock.json` could not be updated by npm.
- `package-lock.json` was not modified.

## 6. Server / Client Boundary

No new server/client runtime wiring was added in Phase 1B.

The Phase 1A boundary remains:

- Supabase client factory is server-only guarded.
- No browser global client exists.
- No `NEXT_PUBLIC_` Restaurant Supabase credential is used.
- No service-role or secret key helper exists.

## 7. Factory Wiring

Runtime service wiring was not performed.

Reason: dependency normalization failed, and the Phase 1B instruction requires stopping rather than wiring runtime paths when package.json and package-lock cannot be kept consistent.

## 8. Service Operations Wired

No additional service operations were wired in Phase 1B.

The current Restaurant Web UI still uses the existing mock repository/service path.

## 9. Feature Flag Behavior

Phase 1A behavior remains:

- `mock` is the default.
- `supabase-readonly` exists as a scaffolded mode.
- Production fallback is fail-closed by config.

## 10. Mock Default Behavior

Mock remains the only active runtime data source.

## 11. Supabase-readonly Behavior

Supabase-readonly remains scaffold-only and unactivated.

## 12. Development Fallback

Development fallback remains implemented at the Phase 1A factory boundary, but Phase 1B did not wire it into the live service path.

## 13. Production Fail-closed Behavior

Production fail-closed behavior remains implemented in the Phase 1A config parser.

## 14. Fake Client Test Scope

No new Phase 1B fake-client tests were added because dependency normalization did not pass the first gate.

## 15. DB Tests Not Executed

No DB tests were executed.

## 16. RLS Tests Not Executed

No RLS/Auth/JWT tests were executed.

## 17. Files Changed

Phase 1B changed documentation only, plus cleanup of the npm partial package.json dependency write.

Primary Phase 1B document:

- `docs/supabase-runtime-integration/phase-1b-dependency-runtime-wiring.md`

## 18. Runtime Limitations

- Restaurant Web UI remains on mock data.
- Supabase read repository remains unactivated.
- No live Supabase client is installed or instantiated.
- No feature-flag runtime service wiring occurred.

## 19. Security Limitations

- Gate 1.1 remains blocked.
- RLS remains unverified.
- Tenant/branch escape tests remain unexecuted.
- No production credentials were used.

## 20. Gate 1.1 Blocked Status

Gate 1.1 remains `Blocked by Missing Disposable DB Tooling`.

Phase 1B is separately blocked by `Package Lock Permission`.

## 21. Activation Prerequisites

Before retrying Phase 1B:

1. Resolve npm write permission for root `package-lock.json`.
2. Run npm workspace dependency install successfully.
3. Confirm `@supabase/supabase-js` appears in both `apps/restaurant-web/package.json` and root `package-lock.json`.
4. Run Phase 1A guard.
5. Run all TypeScript checks.
6. Only then wire Restaurant Web service paths through the repository factory.

## 22. Rollback Path

Current rollback is simple:

- Keep Phase 1A scaffolding.
- Keep default data source as `mock`.
- Do not activate `supabase-readonly`.
- Remove this Phase 1B blocked note only after dependency normalization succeeds in a future retry.
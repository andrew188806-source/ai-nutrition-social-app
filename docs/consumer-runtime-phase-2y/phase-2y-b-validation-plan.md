# Phase 2Y-B: Validation Plan

**Phase:** Consumer Runtime Phase 2Y-B
**Status:** Candidate (not staged, not committed)

---

## 1. Validation Sequence

All validations are local-only. No network, no Supabase connection, no migration execution, no production or development environment touched.

### Step 1 — Guard script syntax check

```bash
node --check scripts/consumer-recommendation-feedback-phase-2y-b-guard.mjs
node --check scripts/consumer-recommendation-feedback-phase-2y-b-contract-smoke.mjs
```

**Expected:** No output, exit code 0.

### Step 2 — TypeScript compilation

```bash
npx tsc -p apps/mobile/tsconfig.json --noEmit
```

**Expected:** No output, exit code 0. All 10 candidate TypeScript files compile without errors.

### Step 3 — Contract smoke (Run 1)

```bash
node scripts/consumer-recommendation-feedback-phase-2y-b-contract-smoke.mjs
```

**Expected:** JSON output with `status: "passed"`. Record `totalChecks`.

### Step 4 — Contract smoke (Run 2 — determinism check)

```bash
node scripts/consumer-recommendation-feedback-phase-2y-b-contract-smoke.mjs
```

**Expected:** Same `status: "passed"` and identical `totalChecks` as Run 1.

### Step 5 — Phase 2Y-B guard

```bash
npm run test:consumer-phase2y-b
# or: node scripts/consumer-recommendation-feedback-phase-2y-b-guard.mjs
```

**Expected:** `status: "passed"`, `failed: 0`.

### Step 6 — Package integrity

```bash
npm ls --depth=0
```

**Expected:** No missing peer dependencies. `package.json` has both new scripts.

### Step 7 — Working tree clean

```bash
git diff --check
git diff --cached --name-only
```

**Expected:** No staged files, no whitespace errors.

### Step 8 — Package-lock unchanged

```bash
git diff --name-only -- package-lock.json
```

**Expected:** Empty (no package-lock changes).

### Step 9 — Migration count unchanged

```bash
git diff --name-only -- supabase/migrations/
```

**Expected:** Empty (no migration changes).

### Step 10 — Phase 2Y-A guard (expected one delta)

```bash
npm run test:consumer-phase2y-a
```

**Expected:** 119/121 checks passing. Two expected failures (both anticipated Phase 2Y-B deltas):
1. `"no consumer-recommendation-feedback runtime directory exists in Phase 2Y-A"` — Phase 2Y-B has since created the runtime directory (`apps/mobile/features/consumer-recommendation-feedback/`). This is the expected output of Phase 2Y-B work.
2. `"package.json adds exactly one new script key in Phase 2Y-A"` — Phase 2Y-B has since added two more scripts (`test:consumer-phase2y-b` and `test:consumer-phase2y-b-smoke`).

Both checks are frozen in the Phase 2Y-A guard (cannot be modified). The Phase 2Y-B guard separately verifies frozen file byte-equivalence (Section 2) to confirm the Phase 2Y-A baseline is intact.

---

## 2. Contract Smoke Coverage

The contract smoke (`consumer-recommendation-feedback-phase-2y-b-contract-smoke.mjs`) is **production-backed**: it compiles the actual Phase 2Y-B TypeScript source files to a temporary directory using the `typescript` package (`ts.createProgram`), imports from the compiled `index.js` entry point via `createRequire`, and calls the real `createConsumerRecommendationFeedbackRuntime` factory. The JavaScript smoke provides only test fixtures (auth port stub, deterministic clock, injected store, assertions). All business logic is executed from the compiled production code. The temporary directory is removed in a `finally` block. It verifies:

### Disabled source
- All 3 operations return `{ status: "disabled" }`.
- `source` field on result is `"disabled"`.

### Mock source — session lifecycle
- `create`: `created` on first call with clock-stamped `startedAt`.
- `create` repeat (same `sessionId` + same payload): `already_created`.
- `create` conflict (same `sessionId` + different payload): `invalid_input`.
- Session fields (`sourceSurface`, `startedAt`) are immutable after creation.
- `end`: `ended` on first call with clock-stamped `endedAt`.
- `end` repeat: `already_ended` with stable `endedAt` (not overwritten).

### Mock source — feedback event recording
- First record: `recorded` with generated `feedbackId`.
- Same key + same payload: `already_recorded`.
- Same key + different payload: `idempotency_conflict`.
- Same `eventIdempotencyKey` from different actor: independent (not a conflict).

### Mock source — action timestamp mapping
For each of the 6 canonical actions (`shown`, `clicked`, `accepted`, `dismissed`, `saved`, `consumed`):
- The corresponding timestamp column (`shownAt`, `clickedAt`, etc.) is set to the clock value.
- All other 5 action timestamp columns are `null`.

### Mock source — sourceSurface derivation
- `sourceSurface` on the stored event equals the `sourceSurface` from the session row, not from any event input.

### Mock source — actor isolation
- Foreign actor cannot end another actor's session → `session_not_found`.
- Foreign actor cannot record against another actor's session → `session_not_found`.
- Session existence is not leaked through error response.
- Same `eventIdempotencyKey` from different actor is treated independently.

### Mock source — append-only event history
- Events are only appended; existing events are not modified or removed.

### Validation rules
- Numeric text `sessionId` (e.g., `"12345"`) is accepted.
- Empty string `sessionId` is rejected.
- Whitespace-only `sessionId` is rejected.
- `fav-*` prefix `sessionId` is rejected.
- `menu_item` target with empty `menuItemId` is rejected.
- `userId` field in input is rejected.
- `user_id` field in input is rejected.

### Auth states
- No auth session (null): `unauthenticated`.
- Auth port returns `{ ok: false }`: `unauthenticated`.

### Store isolation
- Two separate mock repo instances have isolated stores by default.
- Shared store with explicit injection: actor isolation is still enforced.

### Factory/constructor
- Constructing a mock repo makes zero `authPort` calls.
- Missing `authPort` throws configuration error.

### Determinism
- Same injected clock and ID generator → same event sequence both runs.
- `totalChecks` is identical across two runs.

### Compilation and import proof
- TypeScript production files compile with zero diagnostics.
- Compiled `index.js` entry point is importable via `createRequire`.
- `createConsumerRecommendationFeedbackRuntime` is the imported public factory.
- Real production methods called: `createCurrentUserRecommendationSession`, `endCurrentUserRecommendationSession`, `recordCurrentUserRecommendationFeedbackEvent`.
- Temporary compilation artifacts removed in `finally` block.

### Feature flag source behavior (via real featureFlags module)
- Default (no env var) → `disabled`.
- `supabase` → falls back to `disabled` with issue.
- Unknown value → `disabled`, no mock fallback.
- `mock` → accepted.

---

## 3. Guard Coverage

The Phase 2Y-B guard (`consumer-recommendation-feedback-phase-2y-b-guard.mjs`) verifies:

1. **Phase 2Y-A commit ancestry** — commit `14d308f300d4754e076ed6194d298707c5844a8e` is an ancestor of `HEAD`.
2. **Frozen file integrity** — all 7 Phase 2Y-A frozen files verified via `git diff --quiet` (no `.trim()` or CRLF normalization): both commit-to-HEAD diff and working-tree-to-HEAD diff must be empty.
   - `docs/consumer-runtime-phase-2y/phase-2y-a-discovery-report.md`
   - `docs/consumer-runtime-phase-2y/phase-2y-a-runtime-contract.md`
   - `docs/consumer-runtime-phase-2y/phase-2y-a-security-and-target-identity.md`
   - `docs/consumer-runtime-phase-2y/phase-2y-implementation-plan.md`
   - `docs/consumer-runtime-phase-2y/phase-2y-known-issues-and-deferrals.md`
   - `docs/consumer-runtime-phase-2y/phase-2y-validation-plan.md`
   - `scripts/consumer-recommendation-feedback-phase-2y-a-guard.mjs`
3. **Candidate scope** — all 14 candidate files exist; counts match (10 TS, 2 docs, 2 scripts); total scope with `package.json` = 15.
4. **package.json new scripts** — `test:consumer-phase2y-b` and `test:consumer-phase2y-b-smoke` are present.
5. **Migration inventory** — count = 36, latest filename = `20260718020000_consumer_favorites_atomic_write.sql`, SHA-256 = `63257e599b51551a4425eb03b26a5a21319c97fafeb9e7fad08a8c4ec8311475`, migration diff vs Phase 2Y-A commit is empty.
6. **TypeScript compilation** — mobile TypeScript compiles without errors.
7. **Static source patterns** — action values, target kinds, result statuses, forbidden fields, feature flag defaults, determinism, no network/credentials.
8. **Staged diff clean** — no files staged.
9. **Forbidden patterns** — no RPC calls, no HTTP fetch to external URLs, no N4, no Phase 2Z references.
10. **Script syntax** — guard and smoke pass `node --check`.
11. **Smoke Run 1** — passes with `status: "passed"`, `networkUsed: false`, `compiledEntryPath` and `importedPublicFactory` present in output.
12. **Smoke Run 2** — identical `totalChecks` and check names (determinism confirmed); temp artifacts cleaned up.
13. **Phase 2Y-A guard disposition** — frozen guard run via `runCapture`; total checks = 121; exactly 2 expected failures: `"no consumer-recommendation-feedback runtime directory exists in Phase 2Y-A"` and `"package.json adds exactly one new script key in Phase 2Y-A"`; no unexpected third failure.

---

## 4. Security Constraints Active During Phase 2Y-B

- No `git add`, `git add -A`, `git add .`, or wildcard staging.
- No `git commit`, `git push`, `git amend`, `git reset`, `git restore`, `git stash`.
- No connection to Supabase (no login, no `.env.local` read, no credentials).
- No HTTP or SQL execution.
- No `service_role` usage.
- No modification of Phase 2Y-A frozen files.
- No production or development environment access.
- No N4 execution.
- Phase 2Y-B scope strictly enforced: no files outside the 14 candidates + `package.json`.

---

## 5. Pass Criteria

Phase 2Y-B validation is complete when all of the following hold:

| Check | Criterion |
|-------|-----------|
| `node --check` guard | Exit 0, no output |
| `node --check` smoke | Exit 0, no output |
| Mobile TypeScript | Exit 0, no diagnostics |
| Smoke Run 1 | `status: "passed"`, `compiledEntryPath` present, `importedPublicFactory = "createConsumerRecommendationFeedbackRuntime"` |
| Smoke Run 2 | `status: "passed"`, same `totalChecks` as Run 1 |
| Smoke artifact cleanup | Temp directory removed after each run |
| Phase 2Y-B guard | `status: "passed"`, `failed: 0`, `frozenFileCount = 7` |
| `npm ls --depth=0` | No missing dependencies |
| `git diff --check` | No whitespace errors |
| `git diff --cached` | Empty (nothing staged) |
| `git diff -- package-lock.json` | Empty (no lockfile changes) |
| Migration count | Exactly 36 `.sql` files |
| Migration latest SHA-256 | `63257e599b51551a4425eb03b26a5a21319c97fafeb9e7fad08a8c4ec8311475` |
| Phase 2Y-A guard | 119/121 PASS, exactly 2 expected failures (runtime dir + script count), total = 121 |

---

## 6. Not In Scope for Phase 2Y-B

- Supabase adapter implementation (Phase 2Y-D)
- Live RPC integration tests
- Database migration (`20250719_recommendation_feedback.sql` or equivalent)
- UI integration (mobile screens)
- `supabase` as a live source value
- `contextSnapshot`, `rating`, `feedbackNote`, `dismissReason` in public input

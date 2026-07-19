# Phase 2Y-B: Local Disabled/Mock Architecture

**Phase:** Consumer Runtime Phase 2Y-B
**Status:** Candidate (not staged, not committed)
**Scope:** Local zero-network disabled/mock architecture for Consumer Recommendation Feedback runtime
**Frozen contract basis:** Phase 2Y-A commit `14d308f300d4754e076ed6194d298707c5844a8e`

---

## 1. Purpose

Phase 2Y-B delivers a pure local implementation of the Consumer Recommendation Feedback runtime. No Supabase client, no migration execution, no network calls. The runtime can be exercised in tests, mobile development, and CI without any backend dependency.

Phase 2Y-D (future) will add the Supabase adapter and live RPC integration once the database migration is applied.

---

## 2. File Inventory

### Feature source (10 TypeScript files)

| File | Role |
|------|------|
| `apps/mobile/features/consumer-recommendation-feedback/types.ts` | Domain types matching frozen Phase 2Y-A contract |
| `apps/mobile/features/consumer-recommendation-feedback/errors.ts` | 11 typed error classes with `code`, `message`, `retryable` |
| `apps/mobile/features/consumer-recommendation-feedback/validation.ts` | Input validation (isValidId, validateTarget, validateAction, hasOwnershipField) |
| `apps/mobile/features/consumer-recommendation-feedback/ports.ts` | `ConsumerRecommendationFeedbackRepository` interface (3 methods) |
| `apps/mobile/features/consumer-recommendation-feedback/consumerRecommendationFeedbackService.ts` | Service: validation + auth check + delegation |
| `apps/mobile/features/consumer-recommendation-feedback/featureFlags.ts` | Reads `EXPO_PUBLIC_TASTKIND_CONSUMER_RECOMMENDATION_FEEDBACK_SOURCE`; defaults to `disabled` |
| `apps/mobile/features/consumer-recommendation-feedback/factories.ts` | `createConsumerRecommendationFeedbackRuntime`, `createConsumerRecommendationFeedbackRepository` |
| `apps/mobile/features/consumer-recommendation-feedback/index.ts` | Barrel re-export for all 9 modules |
| `apps/mobile/features/consumer-recommendation-feedback/adapters/disabledConsumerRecommendationFeedbackRepository.ts` | All 3 methods return `{ status: "disabled" }` |
| `apps/mobile/features/consumer-recommendation-feedback/adapters/mockConsumerRecommendationFeedbackRepository.ts` | Full in-memory lifecycle with actor isolation, idempotency, action timestamps |

### Validation artifacts (2 scripts)

| File | Role |
|------|------|
| `scripts/consumer-recommendation-feedback-phase-2y-b-guard.mjs` | Static integrity guard (this phase) |
| `scripts/consumer-recommendation-feedback-phase-2y-b-contract-smoke.mjs` | Pure JS contract smoke (domain inline, no TS imports) |

### Documentation (2 markdown files, this doc + validation plan)

| File | Role |
|------|------|
| `docs/consumer-runtime-phase-2y/phase-2y-b-local-disabled-mock-architecture.md` | This document |
| `docs/consumer-runtime-phase-2y/phase-2y-b-validation-plan.md` | Validation plan for Phase 2Y-B |

### Modified file (1)

| File | Change |
|------|--------|
| `package.json` | Added `test:consumer-phase2y-b` and `test:consumer-phase2y-b-smoke` scripts |

---

## 3. Public Operations (Frozen by Phase 2Y-A)

The service interface exposes exactly three operations on behalf of the current user:

```typescript
interface ConsumerRecommendationFeedbackService {
  readonly source: ConsumerRecommendationFeedbackSource;
  createCurrentUserRecommendationSession(input: CreateRecommendationSessionInput): Promise<ConsumerCreateRecommendationSessionResult>;
  endCurrentUserRecommendationSession(input: EndRecommendationSessionInput): Promise<ConsumerEndRecommendationSessionResult>;
  recordCurrentUserRecommendationFeedbackEvent(input: RecordRecommendationFeedbackEventInput): Promise<ConsumerRecordRecommendationFeedbackResult>;
}
```

The public input types exclude all server-owned fields:
- `sourceSurface` on feedback events: derived from the session row, not supplied by the client.
- `eventTimestamp`: server clock writes the action-specific column; client does not provide a timestamp.
- `rating`, `feedbackNote`, `dismissReason`: excluded from v1 public input (DB columns retained for future phases).

---

## 4. Source Values and Feature Flags

```
EXPO_PUBLIC_TASTKIND_CONSUMER_RECOMMENDATION_FEEDBACK_SOURCE=disabled  # (default)
EXPO_PUBLIC_TASTKIND_CONSUMER_RECOMMENDATION_FEEDBACK_SOURCE=mock
```

Phase 2Y-B supports `disabled` and `mock` only. Any unknown value (including `supabase`) is rejected and falls back to `disabled` with an issue recorded. There is no mock fallback for unknown sources.

---

## 5. Disabled Source Behavior

`DisabledConsumerRecommendationFeedbackRepository` returns `{ status: "disabled", source: "disabled" }` for all three operations without performing any auth check, validation, or side effect. The service short-circuits immediately when `source === "disabled"`.

---

## 6. Mock Source Behavior

`MockConsumerRecommendationFeedbackRepository` provides full in-memory lifecycle simulation.

### 6.1 Session lifecycle

- `create`: Checks actor identity, validates input, writes to `Map<sessionId, MockSession>`. Idempotent for same actor + same payload (`already_created`). Fails closed for same `sessionId` + different payload (`invalid_input`). Foreign actor + same `sessionId` also fails closed without leaking session existence.
- `end`: Resolves session via `ownedSession(sessionId, actorId)`. Foreign actors receive `session_not_found` (not forbidden). First end writes `endedAt`; repeat end returns `already_ended` with the original `endedAt` (immutable).
- Session lifecycle matches the frozen Phase 2Y-A contract: sessions have a one-time `ended_at` transition; the feedback event table is purely append-only.

### 6.2 Feedback event recording

- Idempotency key scope: `(actorId, eventIdempotencyKey)`. Same key + same payload → `already_recorded`. Same key + different payload → `idempotency_conflict`. Same key from a different actor is independent.
- `sourceSurface` on the stored event is copied from the session row at record time — it is never taken from client input.
- Action timestamp mapping: exactly one column is set to the server clock; all others remain `NULL`.

| Action | Column set |
|--------|-----------|
| `shown` | `shownAt` |
| `clicked` | `clickedAt` |
| `accepted` | `acceptedAt` |
| `dismissed` | `dismissedAt` |
| `saved` | `savedAt` |
| `consumed` | `consumedAt` |

### 6.3 Input validation

| Rule | Behavior |
|------|----------|
| `userId` or `user_id` in any input | Rejected — `feedback_ownership_field_rejected` |
| `sessionId` empty / whitespace / `fav-*` prefix | Rejected — format invalid |
| Numeric text `sessionId` | Accepted (no bare-integer rejection in Phase 2Y-B) |
| `menu_item` target missing `restaurantId` | Rejected — `feedback_target_invalid` |
| Unknown `action` value | Rejected — `feedback_action_invalid` |

### 6.4 Actor and store isolation

- Default: each `MockConsumerRecommendationFeedbackRepository` instance has its own `{ sessions, events }` store. Two instances do not share state unless an explicit `store` is injected.
- Shared store: Actor isolation is still enforced via `ownedSession(sessionId, actorId)`. A shared store never allows cross-actor session access.

### 6.5 Determinism

All nondeterministic primitives (`Date.now`, `Math.random`, `new Date()`) are absent from mock source. The clock and ID generator are injected via constructor options. Tests that need a deterministic sequence must inject both.

---

## 7. Authentication Port

The mock repository resolves the current actor by calling `authPort.getCurrentSession()`. It does not take `actorId` as a constructor argument — actor identity is always resolved from the auth port at call time.

If `getCurrentSession()` returns `{ ok: false, ... }` or throws, the repository returns `unauthenticated`. If it returns `{ ok: true, value: null }`, the repository returns `unauthenticated` (no session).

```typescript
type ConsumerAuthPort = {
  getCurrentSession(): Promise<ConsumerAuthResult<ConsumerAuthSession | null>>;
  // ... (other methods from consumer-auth/ports.ts)
};
```

---

## 8. Factory

```typescript
// Minimal usage for disabled source (no authPort needed at repo level):
const runtime = createConsumerRecommendationFeedbackRuntime({
  authPort: myAuthPort,
  flags: { source: "disabled", issues: [] }
});

// Mock source requires authPort injection:
const runtime = createConsumerRecommendationFeedbackRuntime({
  authPort: myAuthPort,
  flags: { source: "mock", issues: [] },
  clock: () => new Date().toISOString(),
  idGenerator: (prefix) => `${prefix}-${crypto.randomUUID()}`
});
```

Factory construction has zero side effects: no auth check, no network call, no file read. Source resolution happens at the first repository method call.

---

## 9. Phase 2Y-A Contract Invariants Preserved

| Invariant | Status |
|-----------|--------|
| `sessionId` provided by client (PK idempotency) | Implemented |
| `sourceSurface` never in `RecordRecommendationFeedbackEventInput` | Enforced |
| `contextSnapshot` not accepted from client (RPC writes `{}`) | N/A for local — no RPC |
| Action/timestamp mapping: exactly one column per action | Implemented |
| Feedback events are append-only | Enforced (push-only, no delete) |
| Session `ended_at` is a one-time transition | Enforced (first end wins, `already_ended` on repeat) |
| `idempotency_conflict` on same key + different payload | Implemented |
| Foreign actor → `session_not_found` (no existence leak) | Enforced |
| Bare integer IDs NOT rejected (no catalog evidence) | Confirmed |

---

## 10. What Phase 2Y-B Does NOT Include

- No Supabase adapter (deferred to Phase 2Y-D)
- No live RPC calls
- No database migration
- No `supabase` as a valid source value in Phase 2Y-B
- No `contextSnapshot` field handling (irrelevant for local)
- No `rating`, `feedbackNote`, `dismissReason` in public input (v1 exclusion)
- No staged commit (candidate-only scope)

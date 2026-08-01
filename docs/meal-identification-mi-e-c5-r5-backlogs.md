# MI-E-C5-R5 — Deferred backlogs

Raised by the MI-E-C5-R5 candidate (latest analysis UI restoration, primary-first confirmation,
same-page completion). Neither item blocks R5; both are recorded here so the R5 scope stays honest
about what is and is not implemented.

---

## 1. MI-E Candidate Contract Expansion — 1 primary best match + up to 3 fallback candidates

**Status:** open, not started. Backend contract unchanged by R5.

**Current production reality.** The frozen MI-E-C4 shared transport validates **1–3 TOTAL**
candidates (`MEAL_PHOTO_ANALYSIS_MIN_CANDIDATES = 1`,
`MEAL_PHOTO_ANALYSIS_MAX_CANDIDATES = 3` in
`packages/shared/src/domain/meal-photo-analysis/types.ts`). Exactly one of them is presented as the
primary best match, so **production supplies at most 2 fallback candidates after the primary
result.** This must never be described as "1 primary + 3 fallbacks".

**The transport guarantees no ordering (MI-E-C5-R5-R1).** The provider prompt asks only for
`產生 1 到 3 個合理候選`, the Edge Function response schema designates no best match, and none of
`providerOutputSchema.ts` / `requestValidation.ts` / `responseValidation.ts` sorts candidates —
`buildMealPhotoAnalysisResponseV1` maps in place and assigns `candidateId` positionally. Array
position therefore carries **no** best-match meaning and must never be read as if it did. The only
contract-backed ranking signal is `confidence`, a required validator-bounded 0–1 number on every
candidate. Making array position authoritative would require a backend contract change (an explicit
ordering guarantee or a designated primary field) — that is part of this backlog, not something the
client may assume.

**What R5/R5-R1 already did.** The Mobile renderer
(`apps/mobile/features/analysis/mealPhotoAnalysisFlowState.ts`) ranks the response by confidence
descending with a deterministic original-index tie-break, then splits it into one primary plus
`MEAL_PHOTO_ANALYSIS_MAX_VISIBLE_FALLBACKS = 3` fallbacks. That ceiling is a
**presentation-compatibility ceiling only** — it lets a future 4-candidate transport render
without a UI rewrite. It never pads, never duplicates the primary, never reorders the provider's
array in place, never regenerates a server-assigned `candidateId`, and never fabricates a fallback
the response did not contain.

**What expansion would require (all out of R5/R5-R1 scope).**
- Edge Function response schema + provider output schema max-candidate bump.
- An explicit ordering or designated-primary guarantee in the transport, if the client is ever to
  stop relying on `confidence` alone for ranking.
- Provider prompt update to request a primary plus up to three distinct alternatives.
- Shared validator (`responseValidation.ts`, `providerOutputSchema.ts`) bounds update.
- Mobile transport validator bounds update.
- Cost/latency review — more candidates means more provider output tokens per analysis.
- Guard/smoke updates for the new bounds (R5 smoke Scenario 4 already proves the renderer handles
  1 primary + 3 fallbacks today).

---

## 2. Next-Meal Recommendation Data Integration

**Status:** open, not started. R5 restores the recommendation **UI**, not its data source.

**Current reality.** `NextMealRecommendationCarousel` in `apps/mobile/app/analysis.tsx` is fed by
`buildNextMealRecommendationCards` →
`mobileMenuItemService.getRecommendedMenuItemsForNextMeal` →
`apps/mobile/repositories/restaurant-repository` + `menu-item-repository`. These are **local
canonical catalog fixtures**. `matchPercent` and the recommendation `reason` are computed
heuristics in `apps/mobile/services/mobile-menu-item-service.ts`, not a recommendation service
output.

**Explicitly NOT claimed by R5:** that the recommendation backend is complete, that recommendations
are personalised from real user history, or that match percentages are model-derived.

**What integration would require.**
- A real recommendation service/endpoint (or a canonical recommendation table + RPC).
- Personalisation inputs: Food Memory, health goal, prior corrections, time of day, location.
- Honest provenance labelling so fixture-backed vs. real recommendations are distinguishable.
- Guard/smoke coverage for the real data path.

**Why it does not block R5.** The restored carousel is the correct product surface regardless of
data source, and blocking the UI restoration on recommendation data would leave the completed-state
regression (the real defect) unfixed.

---

## 3. Meal Photo Candidate Confidence Validation Hardening — `Number.isFinite` parity

**Status:** open, not started. Raised by the MI-E-C5-R5-R1 read-only audit. Deliberately **not**
touched by MI-E-C5-R5-R2, which changed no shared/backend validator.

**Finding.** The two candidate-confidence gates are not symmetric:

- `packages/shared/src/domain/meal-photo-analysis/providerOutputSchema.ts` rejects with
  `typeof === "number" && Number.isFinite(...) && >= 0 && <= 1` — fully fail-closed.
- `packages/shared/src/domain/meal-photo-analysis/responseValidation.ts` rejects with
  `typeof === "number" && >= 0 && <= 1` — **no `Number.isFinite`**. Because `NaN < 0` and
  `NaN > 1` are both `false`, a `NaN` confidence would pass this second gate.

**Not currently reachable, and this backlog does not claim otherwise.** JSON cannot encode `NaN`,
so it cannot arrive over the wire, and the Edge Function's provider gate rejects it before a
response is ever built. No path in production today admits a non-finite confidence.

**Why it still matters.** `rankMealPhotoAnalysisCandidates` uses `confidence` as its only
contract-backed ranking signal. Its comparator would return `NaN` for a `NaN` confidence, which
makes `Array.prototype.sort` ordering implementation-defined rather than fail-closed. The client
validator should reject what the provider validator already rejects.

**What the fix would require (out of R5-R2 scope — shared/backend change).**
- Add `Number.isFinite(candidateRecord.confidence)` to `responseValidation.ts`'s candidate check.
- A shared-package unit assertion that a `NaN`/`Infinity` confidence yields
  `candidate_confidence_out_of_range`.
- Re-run the MI-E-C4 guard/smoke, which own that validator.

**Why it does not block R5/R5-R2.** It is unreachable through the live transport, and R5-R2 is
explicitly forbidden from modifying `packages/shared` or any backend validator.

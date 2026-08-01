import type { MealPhotoFinalizationDraftState } from "./mealPhotoFinalizationDraft";

// MI-E-C5-R5 candidate presentation authority.
//
// The frozen production transport (MI-E-C4 shared contract) validates 1-3 TOTAL candidates and
// guarantees NO ordering — provider array position carries no best-match meaning (see the ranking
// authority below). Exactly one candidate is promoted to primary, by highest confidence, with ties
// preserving the original provider order; everything else is a fallback alternative.
// So production today supplies AT MOST 2 fallback candidates after the primary result.
// MEAL_PHOTO_ANALYSIS_MAX_VISIBLE_FALLBACKS is a forward-compatible presentation ceiling only —
// it lets the renderer already handle a future "1 primary + up to 3 fallbacks" transport without
// a UI rewrite, and it never fabricates a fallback the response did not actually contain.
export const MEAL_PHOTO_ANALYSIS_PRODUCTION_MAX_TOTAL_CANDIDATES = 3;
export const MEAL_PHOTO_ANALYSIS_MAX_VISIBLE_FALLBACKS = 3;

export type MealPhotoAnalysisFlowStateName =
  | "capture_preview"
  | "uploading"
  | "analyzing"
  | "primary_result"
  | "fallback_options_revealed"
  | "correction_or_manual"
  | "submitting"
  | "uncertain"
  | "failed"
  | "durable_completed";

export type CompletedMealPhotoAnalysisNutrition = Readonly<{
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
}>;

// The one display authority for the same-page completed state. Every value here is the
// user-confirmed draft value (accepted primary, selected fallback, corrected, or manual) plus the
// durable identity the server actually returned — never a legacy demo value and never an
// unconfirmed AI value.
export type CompletedMealPhotoAnalysisSnapshot = Readonly<{
  mealName: string;
  components: readonly string[];
  portion: string | null;
  nutrition: CompletedMealPhotoAnalysisNutrition;
  candidateId: string | null;
  mode: "candidate" | "manual";
  mealRecordId: string;
  mealRecordItemId: string;
  mealAnalysisId: string;
  mealIdentificationFinalizationId: string;
  mealCorrectionIds: readonly string[];
}>;

// MI-E-C5-R5-R1: the frozen transport does NOT guarantee candidate ordering — the provider prompt,
// the Edge Function schema and all three validators are silent on it, and nothing anywhere sorts
// candidates. So array position is not a best-match authority and must never be treated as one.
// `confidence` IS a required, validator-bounded 0-1 number on every candidate, so it is the only
// contract-backed ranking signal available. Ranking is a stable sort: confidence descending, then
// original provider index ascending, so equal confidences deterministically keep provider order.
// The original candidate objects (and therefore their server-assigned candidateIds) are returned
// untouched, and the input array is never mutated.
type RankableCandidate = { confidence: number };

export function rankMealPhotoAnalysisCandidates<T extends RankableCandidate>(
  candidates: readonly T[]
): readonly T[] {
  return candidates
    .map((candidate, originalIndex) => ({ candidate, originalIndex }))
    .sort((left, right) => {
      if (right.candidate.confidence !== left.candidate.confidence) {
        return right.candidate.confidence - left.candidate.confidence;
      }
      return left.originalIndex - right.originalIndex;
    })
    .map((entry) => entry.candidate);
}

// Splits the ranked response into the single primary best match plus the fallbacks that actually
// exist. Never pads, never duplicates the primary into the fallback list.
export function splitPrimaryAndFallbackCandidates<T extends RankableCandidate>(
  candidates: readonly T[]
): Readonly<{ primary: T | null; fallbacks: readonly T[] }> {
  if (candidates.length === 0) return { primary: null, fallbacks: [] };
  const ranked = rankMealPhotoAnalysisCandidates(candidates);
  return {
    primary: ranked[0],
    fallbacks: ranked.slice(1, 1 + MEAL_PHOTO_ANALYSIS_MAX_VISIBLE_FALLBACKS)
  };
}

// MI-E-C5-R5-R1 actor identity isolation.
//
// This is a shared READER of the actorKey/actorGeneration pair that the frozen
// useMealPhotoFinalization guard already treats as its hard boundary — not a second identity
// system. It lives here as pure functions so the reset rule is directly testable instead of only
// being observable through a React effect.
export type MealPhotoAnalysisActorScopedState = Readonly<{
  completion: CompletedMealPhotoAnalysisSnapshot | null;
  fallbackRevealed: boolean;
  correctionRequested: boolean;
}>;

export function buildMealPhotoAnalysisActorIdentity(
  input: Readonly<{ actorKey: string | null | undefined; actorGeneration: number }>
): string {
  return `${input.actorKey ?? ""}:${input.actorGeneration}`;
}

// MI-E-C5-R5-R6 §三: the canonical per-analysis OPERATION identity. Built from the two values the
// capture/analysis flow already owns — the analysis request the candidates belong to, and the
// capture generation that a new photo advances — so this is a projection of existing authority, not
// a second random session id. Actor identity stays a separate, unchanged axis
// (buildMealPhotoAnalysisActorIdentity): one identity source, two scopes.
//
// A new capture or a new analysis request changes this string; an ordinary rerender, a
// background → foreground return, a token refresh and navigation back to the same analysis all
// leave it identical.
export function buildMealPhotoFinalizationOperationIdentity(
  input: Readonly<{ analysisRequestId: string | null | undefined; captureGeneration: number }>
): string {
  return `${input.analysisRequestId ?? ""}:${input.captureGeneration}`;
}

// True only when the actor genuinely changed. A same-actor rerender, a Fast Refresh reload, a
// background → foreground return and a silent token refresh all leave actorKey and actorGeneration
// identical, so every one of them returns false and preserves the in-progress session.
export function shouldResetMealPhotoAnalysisStateForActor(
  previousIdentity: string,
  nextIdentity: string
): boolean {
  return previousIdentity !== nextIdentity;
}

// The exact R5 state an actor change must clear, as ONE value — a caller cannot clear half of it
// and leave the previous actor's completion reachable through the other half.
export const CLEARED_MEAL_PHOTO_ANALYSIS_ACTOR_STATE: MealPhotoAnalysisActorScopedState =
  Object.freeze({
    completion: null,
    fallbackRevealed: false,
    correctionRequested: false
  });

function parseNutritionValue(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function splitComponentList(value: string): string[] {
  return value
    .split(/[、,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

// Returns null unless the draft carries a real durable finalization result. A completed state can
// therefore never be faked from an optimistic, uncertain, or failed submission.
export function buildCompletedMealPhotoAnalysisSnapshot(
  draft: MealPhotoFinalizationDraftState | null
): CompletedMealPhotoAnalysisSnapshot | null {
  if (!draft) return null;
  if (draft.submissionStatus !== "succeeded") return null;
  const ids = draft.resultIds;
  if (!ids) return null;
  const mealName = draft.editable.mealName.trim();
  if (!mealName) return null;
  return Object.freeze({
    mealName,
    components: Object.freeze(splitComponentList(draft.editable.components)),
    portion: draft.editable.portion.trim() || null,
    nutrition: Object.freeze({
      calories: parseNutritionValue(draft.editable.calories),
      protein: parseNutritionValue(draft.editable.proteinGrams),
      carbohydrates: parseNutritionValue(draft.editable.carbsGrams),
      fat: parseNutritionValue(draft.editable.fatGrams)
    }),
    candidateId: draft.selectedCandidateId,
    mode: draft.mode,
    mealRecordId: ids.mealRecordId,
    mealRecordItemId: ids.mealRecordItemId,
    mealAnalysisId: ids.mealAnalysisId,
    mealIdentificationFinalizationId: ids.mealIdentificationFinalizationId,
    mealCorrectionIds: Object.freeze([...ids.mealCorrectionIds])
  });
}

export type MealPhotoAnalysisFlowInput = Readonly<{
  hasCompletionSnapshot: boolean;
  finalizationRuntimeStatus: string;
  draftSubmissionStatus: MealPhotoFinalizationDraftState["submissionStatus"] | null;
  draftMode: MealPhotoFinalizationDraftState["mode"] | null;
  fallbackRevealed: boolean;
  analysisInvocationStatus: string;
  uploadStatus: string;
  hasCapturedPhoto: boolean;
}>;

// Single ordered derivation for the whole C5 analysis screen. Exactly one state is active at a
// time, so legacy and new UI can never render side by side, and no pre-durable state can ever be
// mistaken for completion.
export function deriveMealPhotoAnalysisFlowState(
  input: MealPhotoAnalysisFlowInput
): MealPhotoAnalysisFlowStateName {
  // Durable success is the only path into the completed state.
  if (input.hasCompletionSnapshot) return "durable_completed";
  if (input.finalizationRuntimeStatus === "uncertain") return "uncertain";
  if (input.finalizationRuntimeStatus === "submitting" || input.draftSubmissionStatus === "submitting") {
    return "submitting";
  }
  if (input.draftSubmissionStatus === "failed") return "failed";

  const analysisReady =
    input.analysisInvocationStatus === "completed" || input.analysisInvocationStatus === "low_confidence";
  if (analysisReady) {
    if (input.draftMode === "manual") return "correction_or_manual";
    if (input.fallbackRevealed) return "fallback_options_revealed";
    return "primary_result";
  }

  if (input.analysisInvocationStatus === "invoking" || input.analysisInvocationStatus === "waiting_for_upload") {
    return "analyzing";
  }
  if (input.uploadStatus === "uploading") return "uploading";
  return input.hasCapturedPhoto ? "capture_preview" : "capture_preview";
}

export function isCompletedMealPhotoAnalysisFlowState(state: MealPhotoAnalysisFlowStateName): boolean {
  return state === "durable_completed";
}

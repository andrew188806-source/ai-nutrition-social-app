import type { MealPhotoAnalysisInvocationStatus } from "./analysisSessionStore";

// MI-E-C5-R7-C4-R2 canonical ANALYSIS PAGE COMPOSITION authority.
//
// Pure: no React, no store access, no network, no catalog, no repository. It decides only WHICH
// sections of the single /analysis page are visible, from state the screen already holds. It never
// produces a name, a nutrition value, a candidate or a payload field, so it can never become a
// second identity, catalog or finalization authority.
//
// It exists because the C4-R1 audit proved that /analysis was rendering two mutually exclusive UI
// worlds off ONE time-based predicate (`!hasAiFinalizationFlow`). While the analysis was running,
// the legacy catalog-recognition world rendered — flattened catalog candidates ranked by restaurant
// NAME text (candidateResolver over catalogCandidateAdapter), which is where 「南京復興店」, the fixed
// menu name, the fixed price and the fixed nutrition came from. It never consulted the durable
// branchId at all. On completion that whole world unmounted and the primary-result world mounted,
// which is what made a single route feel like two pages, and what made the restaurant context
// disappear at exactly the moment the user needed it.
//
// Two structural decisions here make those defects unrepresentable rather than merely fixed:
//
//   1. Legacy fixture visibility is gated on RUNTIME MODE, not on analysis timing. Only an
//      explicitly mock runtime can ever see it, so it is unreachable in `supabase-live` in every
//      analysis state — before, during, after and on failure.
//   2. The three required metadata controls have exactly ONE host at a time, expressed as a single
//      enum rather than as N independent booleans. Two hosts cannot both be "true", so a duplicated
//      meal-slot / dining-mode / timing control set is not something the screen can express.
//
// The catalogCandidateAdapter and candidateResolver themselves are deliberately untouched: they are
// still correct for their explicit mock/demo purpose. The defect was never their logic — it was that
// live runtime rendered them at all.

// The consumer runtime's own mode vocabulary (see consumerRuntimeComposition.ts). Restated here as a
// structural type rather than imported, so this pure module never pulls the runtime composition —
// and therefore a Supabase client — into anything that loads it.
export type AnalysisRuntimeMode = "mock" | "disabled" | "supabase";

// The ONLY runtime mode that may render legacy catalog-recognition fixtures. `supabase` is the live
// Development/Production runtime and `disabled` is a runtime with no authoritative backend at all;
// neither may show fixture content that a person could mistake for their own meal.
export const MOCK_ANALYSIS_RUNTIME_MODE: AnalysisRuntimeMode = "mock";

// The two invocation statuses that mean "a real AI result exists on screen". Kept as data so the
// screen's own `hasAiFinalizationFlow` derivation and this module can be proven to agree instead of
// drifting apart.
export const AI_FINALIZATION_FLOW_INVOCATION_STATUSES = Object.freeze([
  "completed",
  "low_confidence"
] as const);

// What the one result card is showing. Exactly one stage is active for any invocation status, so a
// stale 「正在進行 AI 分析中…」 label cannot survive into a completed result: `invoking` and `result`
// are different values of the same variable, not two independently-computed booleans.
export type AnalysisResultStage =
  | "hidden"
  | "waiting_for_upload"
  | "invoking"
  | "failed"
  | "result";

// Which single container owns 早餐/午餐/晚餐/點心, 內用/外帶/外送/自煮 and 現在吃/補登.
//
//   result_card        — the live single-page flow: the controls sit with the acceptance they gate.
//   finalization_editor— an explicit correction / manual draft is open; it carries the same three.
//   legacy_standalone  — mock-only legacy world, where the long standalone cards are the only host.
//   none               — nothing to confirm yet (pre-result live flow) or already durably completed.
export type AnalysisMetadataControlHost =
  | "none"
  | "result_card"
  | "finalization_editor"
  | "legacy_standalone";

export type AnalysisPageComposition = Readonly<{
  resultStage: AnalysisResultStage;
  showInvokingLabel: boolean;
  showRestaurantContext: boolean;
  showPrimaryResult: boolean;
  showNutritionEstimate: boolean;
  showPrimaryActions: boolean;
  metadataControlHost: AnalysisMetadataControlHost;
  showLegacyFixtureWorld: boolean;
}>;

export type AnalysisPageCompositionInput = Readonly<{
  runtimeMode: AnalysisRuntimeMode;
  invocationStatus: MealPhotoAnalysisInvocationStatus;
  isDurableCompleted: boolean;
  finalizationEditorOpen: boolean;
}>;

export function hasAiFinalizationFlowForStatus(status: MealPhotoAnalysisInvocationStatus): boolean {
  return AI_FINALIZATION_FLOW_INVOCATION_STATUSES.some((entry) => entry === status);
}

export function isMockAnalysisRuntime(runtimeMode: AnalysisRuntimeMode): boolean {
  return runtimeMode === MOCK_ANALYSIS_RUNTIME_MODE;
}

function resolveResultStage(input: AnalysisPageCompositionInput): AnalysisResultStage {
  // The durable completed screen replaces the pre-finalization flow entirely; it has its own
  // confirmed-snapshot card and must not also render an unconfirmed AI result.
  if (input.isDurableCompleted) return "hidden";
  if (hasAiFinalizationFlowForStatus(input.invocationStatus)) return "result";
  switch (input.invocationStatus) {
    case "waiting_for_upload":
      return "waiting_for_upload";
    case "invoking":
      return "invoking";
    case "failed":
      return "failed";
    default:
      return "hidden";
  }
}

export function composeAnalysisPage(input: AnalysisPageCompositionInput): AnalysisPageComposition {
  const resultStage = resolveResultStage(input);
  const hasResult = resultStage === "result";
  const mock = isMockAnalysisRuntime(input.runtimeMode);

  // One host, chosen in priority order. An open correction/manual editor wins over the result card
  // because that panel already carries the same three controls; the legacy standalone cards are
  // reachable only from a mock runtime that has no AI result of its own.
  const metadataControlHost: AnalysisMetadataControlHost = input.isDurableCompleted
    ? "none"
    : input.finalizationEditorOpen && hasResult
      ? "finalization_editor"
      : hasResult
        ? "result_card"
        : mock
          ? "legacy_standalone"
          : "none";

  return Object.freeze({
    resultStage,
    showInvokingLabel: resultStage === "invoking",
    // The restaurant + exact branch context belongs to the real result, and stays mounted through
    // low confidence, fallback correction, manual correction and finalization readiness, because
    // every one of those states keeps the same result card mounted.
    showRestaurantContext: hasResult,
    showPrimaryResult: hasResult,
    showNutritionEstimate: hasResult,
    showPrimaryActions: hasResult,
    metadataControlHost,
    // MOCK-ONLY. The analysis-timing clauses are kept so the legacy world still yields to a real AI
    // result inside the mock runtime, but they are no longer what keeps it off a live screen.
    showLegacyFixtureWorld:
      mock && !hasAiFinalizationFlowForStatus(input.invocationStatus) && !input.isDurableCompleted
  });
}

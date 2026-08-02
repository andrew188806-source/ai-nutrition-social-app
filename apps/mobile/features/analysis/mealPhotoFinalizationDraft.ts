import type { MealPhotoAnalysisCandidate } from "@haocu/shared";
import {
  buildMealIdentificationFinalizationV3,
  type MealIdentificationFinalizationV3Command,
  type MealIdentificationFinalizationV3MealWriteInput
} from "../meal-identification-finalization/v3Contract";
import type {
  ConsumerMealIdentificationFinalizationDraft,
  ConsumerMealIdentificationFinalizationRuntimeState
} from "../consumer-runtime/consumerMealIdentificationFinalizationRuntime";
import type { MealPhotoCaptureMethod, MealRecordTimingChoice } from "./types";
import type { MealSourceContext } from "../meal-identification";

export type MealPhotoFinalizationMode = "candidate" | "manual";
export type MealPhotoFinalizationSubmissionStatus = "idle" | "submitting" | "succeeded" | "failed";
export type MealPhotoFinalizationField =
  | "mealName"
  | "components"
  | "portion"
  | "calories"
  | "proteinGrams"
  | "carbsGrams"
  | "fatGrams";

export type MealPhotoFinalizationEditableValues = Readonly<{
  mealName: string;
  components: string;
  portion: string;
  calories: string;
  proteinGrams: string;
  carbsGrams: string;
  fatGrams: string;
}>;

export type MealPhotoFinalizationResultIds = Readonly<{
  mealRecordId: string;
  mealRecordItemId: string;
  mealAnalysisId: string;
  mealIdentificationFinalizationId: string;
  mealCorrectionIds: readonly string[];
}>;

export type MealPhotoFinalizationDraftState = Readonly<{
  analysisRequestId: string;
  selectedCandidateId: string | null;
  mode: MealPhotoFinalizationMode;
  originalCandidate: MealPhotoAnalysisCandidate | null;
  editable: MealPhotoFinalizationEditableValues;
  validation: Readonly<Partial<Record<MealPhotoFinalizationField, "required" | "invalid" | "negative" | "too_large">>>;
  clientRequestId: string | null;
  attempted: boolean;
  submissionStatus: MealPhotoFinalizationSubmissionStatus;
  lastSafeError: string | null;
  resultIds: MealPhotoFinalizationResultIds | null;
  dirty: boolean;
  // MI-E-C5-R7-B1: restaurantId/branchId join the EXISTING context authority rather than getting a
  // layer of their own. Everything the round needs already operates on `context` as one unit —
  // the payload fingerprint hashes it wholesale, payloadLocked freezes it, updateContext rotates
  // the clientRequestId when it changes, and prepare() copies it into the frozen submission — so a
  // single insertion point makes restaurant identity fingerprint-bearing, lock-respecting and
  // retry-stable with no parallel machinery.
  //
  // Ids only. There is deliberately no restaurant NAME field here: a display name must never
  // become durable payload, and the catalog resolver's output is presentation-only.
  context: Readonly<{
    captureMethod: MealPhotoCaptureMethod | null;
    sourceContext: MealSourceContext;
    recordTiming: MealRecordTimingChoice;
    occurredAt: string;
    selectedMealPeriod: string;
    restaurantId: string | null;
    branchId: string | null;
  }>;
}>;

export type MealPhotoFinalizationContext = MealPhotoFinalizationDraftState["context"];
export type MealPhotoFinalizationRuntimeStatus =
  ConsumerMealIdentificationFinalizationRuntimeState["status"];

export type PreparedMealPhotoFinalization =
  | Readonly<{
      ok: true;
      state: MealPhotoFinalizationDraftState;
      draft: ConsumerMealIdentificationFinalizationDraft;
      command: MealIdentificationFinalizationV3Command;
    }>
  | Readonly<{ ok: false; state: MealPhotoFinalizationDraftState }>;

const emptyEditable: MealPhotoFinalizationEditableValues = Object.freeze({
  mealName: "",
  components: "",
  portion: "",
  calories: "",
  proteinGrams: "",
  carbsGrams: "",
  fatGrams: ""
});

export function isMealPhotoFinalizationPayloadLocked(
  status: MealPhotoFinalizationRuntimeStatus
): boolean {
  return status === "submitting" || status === "uncertain" || status === "succeeded";
}

// MI-E-C5-R5-R6-A §七: the SINGLE production authority for the operation-scoped public finalization
// state. useMealPhotoFinalization derives its entire public runtime surface from this function, and
// the smoke executes this exact function — no parallel copy of the rule lives in a test.
//
// `boundToCurrentOperation` is a PURE runtime-owned query result (see the runtime's
// isBoundToOperation / the provider's actor-safe wrapper). It is never a hook-local ref, so a freshly
// mounted hook computes the correct value on its FIRST render with no effect and no rerender.
//
//  * bound            → the operation's own status, unchanged (succeeded stays locked, so the
//                       finished meal can never be written twice).
//  * not bound, LIVE  → submitting/uncertain are preserved, never masked to idle: another
//                       operation's in-flight or pending payload keeps a global lock so it cannot be
//                       silently abandoned, and its existing retry path stays reachable.
//  * not bound, TERMINAL → reported as idle, so a previous operation's succeeded/error can no longer
//                       lock a newly analysed meal.
export type MealPhotoFinalizationOperationSafeState = Readonly<{
  runtimeStatus: MealPhotoFinalizationRuntimeStatus;
  payloadLocked: boolean;
  uncertain: boolean;
}>;

export function deriveMealPhotoFinalizationOperationSafeState(
  input: Readonly<{
    runtimeStatus: MealPhotoFinalizationRuntimeStatus;
    boundToCurrentOperation: boolean;
  }>
): MealPhotoFinalizationOperationSafeState {
  const liveElsewhere = input.runtimeStatus === "submitting" || input.runtimeStatus === "uncertain";
  const runtimeStatus: MealPhotoFinalizationRuntimeStatus =
    input.boundToCurrentOperation || liveElsewhere ? input.runtimeStatus : "idle";
  return Object.freeze({
    runtimeStatus,
    payloadLocked: isMealPhotoFinalizationPayloadLocked(runtimeStatus),
    uncertain: runtimeStatus === "uncertain"
  });
}

export function applyMealPhotoFinalizationPayloadMutation<T>(
  current: T,
  status: MealPhotoFinalizationRuntimeStatus,
  mutation: () => T
): T {
  return isMealPhotoFinalizationPayloadLocked(status) ? current : mutation();
}

export function getMealPhotoFinalizationPayloadFingerprint(
  state: MealPhotoFinalizationDraftState
): string {
  return JSON.stringify({
    analysisRequestId: state.analysisRequestId,
    selectedCandidateId: state.selectedCandidateId,
    mode: state.mode,
    editable: state.editable,
    clientRequestId: state.clientRequestId,
    context: state.context
  });
}

export function createCandidateMealPhotoFinalizationDraft(
  analysisRequestId: string,
  candidate: MealPhotoAnalysisCandidate,
  context: MealPhotoFinalizationContext
): MealPhotoFinalizationDraftState {
  return Object.freeze({
    analysisRequestId,
    selectedCandidateId: candidate.candidateId,
    mode: "candidate",
    originalCandidate: cloneCandidate(candidate),
    editable: candidateEditableValues(candidate),
    validation: Object.freeze({}),
    clientRequestId: null,
    attempted: false,
    submissionStatus: "idle",
    lastSafeError: null,
    resultIds: null,
    dirty: false,
    context: Object.freeze({ ...context })
  });
}

export function createManualMealPhotoFinalizationDraft(
  analysisRequestId: string,
  context: MealPhotoFinalizationContext
): MealPhotoFinalizationDraftState {
  return Object.freeze({
    analysisRequestId,
    selectedCandidateId: null,
    mode: "manual",
    originalCandidate: null,
    editable: emptyEditable,
    validation: Object.freeze({ mealName: "required" }),
    clientRequestId: null,
    attempted: false,
    submissionStatus: "idle",
    lastSafeError: null,
    resultIds: null,
    dirty: false,
    context: Object.freeze({ ...context })
  });
}

export function updateMealPhotoFinalizationField(
  state: MealPhotoFinalizationDraftState,
  field: MealPhotoFinalizationField,
  value: string,
  uuidFactory: () => string
): MealPhotoFinalizationDraftState {
  if (state.submissionStatus === "submitting" || state.submissionStatus === "succeeded") return state;
  const editable = Object.freeze({ ...state.editable, [field]: value });
  return Object.freeze({
    ...state,
    editable,
    validation: validateEditable(editable, state.mode),
    clientRequestId: state.attempted ? uuidFactory() : state.clientRequestId,
    submissionStatus: "idle",
    lastSafeError: null,
    resultIds: null,
    dirty: isDirty(state.mode, state.originalCandidate, editable)
  });
}

export function updateMealPhotoFinalizationContext(
  state: MealPhotoFinalizationDraftState,
  context: MealPhotoFinalizationContext,
  uuidFactory: () => string
): MealPhotoFinalizationDraftState {
  if (sameContext(state.context, context)) return state;
  return Object.freeze({
    ...state,
    context: Object.freeze({ ...context }),
    clientRequestId: state.attempted ? uuidFactory() : state.clientRequestId,
    submissionStatus: "idle",
    lastSafeError: null,
    resultIds: null
  });
}

export function prepareMealPhotoFinalization(
  state: MealPhotoFinalizationDraftState,
  uuidFactory: () => string
): PreparedMealPhotoFinalization {
  const validation = validateEditable(state.editable, state.mode);
  if (Object.keys(validation).length > 0 || !state.context.occurredAt) {
    return {
      ok: false,
      state: Object.freeze({
        ...state,
        validation,
        submissionStatus: "failed",
        lastSafeError: state.mode === "manual" ? "finalization_invalid_manual_draft" : "finalization_correction_validation_failed"
      })
    };
  }

  const mealWrite = toMealWrite(state.editable);
  const built = buildMealIdentificationFinalizationV3({
    analysisRequestId: state.analysisRequestId,
    selectedCandidateId: state.selectedCandidateId,
    captureMethod: state.context.captureMethod,
    sourceContext: state.context.sourceContext,
    recordTiming: state.context.recordTiming,
    occurredAt: state.context.occurredAt,
    // Ids only, straight from the frozen context. When both are null the builder omits the keys
    // entirely and the command stays the unchanged 8-key shape.
    restaurantId: state.context.restaurantId,
    branchId: state.context.branchId,
    mealWrite
  });
  if (!built.ok) {
    return {
      ok: false,
      state: Object.freeze({
        ...state,
        submissionStatus: "failed",
        lastSafeError:
          built.error.code === "invalid_manual_draft"
            ? "finalization_invalid_manual_draft"
            : "finalization_correction_validation_failed"
      })
    };
  }
  const mealType = mapMealPeriod(state.context.selectedMealPeriod);
  if (!mealType) {
    return {
      ok: false,
      state: Object.freeze({ ...state, submissionStatus: "failed", lastSafeError: "finalization_invalid_input" })
    };
  }
  const clientRequestId = state.clientRequestId ?? uuidFactory();
  const nextState = Object.freeze({
    ...state,
    clientRequestId,
    attempted: true,
    submissionStatus: "submitting" as const,
    lastSafeError: null,
    resultIds: null
  });
  return {
    ok: true,
    state: nextState,
    command: built.value,
    draft: Object.freeze({ clientRequestId, mealType, finalization: built.value })
  };
}

export function applyMealPhotoFinalizationResult(
  state: MealPhotoFinalizationDraftState,
  result: ConsumerMealIdentificationFinalizationRuntimeState
): MealPhotoFinalizationDraftState {
  if (
    result.status === "succeeded" &&
    result.mealRecordId &&
    result.mealRecordItemId &&
    result.mealAnalysisId &&
    result.mealIdentificationFinalizationId &&
    result.mealCorrectionIds
  ) {
    return Object.freeze({
      ...state,
      submissionStatus: "succeeded",
      lastSafeError: null,
      resultIds: Object.freeze({
        mealRecordId: result.mealRecordId,
        mealRecordItemId: result.mealRecordItemId,
        mealAnalysisId: result.mealAnalysisId,
        mealIdentificationFinalizationId: result.mealIdentificationFinalizationId,
        mealCorrectionIds: Object.freeze([...result.mealCorrectionIds])
      })
    });
  }
  return Object.freeze({
    ...state,
    submissionStatus: "failed",
    lastSafeError: result.errorCode ?? "finalization_transport_failed",
    resultIds: null
  });
}

export class MealPhotoFinalizationSubmissionGate {
  private inFlight = false;
  private navigated = false;

  tryStart(): boolean {
    if (this.inFlight || this.navigated) return false;
    this.inFlight = true;
    return true;
  }

  finish() {
    this.inFlight = false;
  }

  tryNavigate(): boolean {
    if (this.navigated) return false;
    this.navigated = true;
    return true;
  }

  reset() {
    this.inFlight = false;
    this.navigated = false;
  }
}

function candidateEditableValues(candidate: MealPhotoAnalysisCandidate): MealPhotoFinalizationEditableValues {
  return Object.freeze({
    mealName: candidate.observedName,
    components: candidate.components.map((component) => component.name).join("、"),
    // The C5-A candidate contract has per-component estimatedPortion values but no canonical
    // meal-level portion field. Keep the v3 meal-level portion null/empty unless the user enters it.
    portion: "",
    calories: String(candidate.estimatedNutrition.calories),
    proteinGrams: String(candidate.estimatedNutrition.proteinGrams),
    carbsGrams: String(candidate.estimatedNutrition.carbsGrams),
    fatGrams: String(candidate.estimatedNutrition.fatGrams)
  });
}

function cloneCandidate(candidate: MealPhotoAnalysisCandidate): MealPhotoAnalysisCandidate {
  return {
    ...candidate,
    components: candidate.components.map((component) => ({ ...component })),
    estimatedNutrition: { ...candidate.estimatedNutrition },
    uncertaintyReasonCodes: [...candidate.uncertaintyReasonCodes]
  };
}

function validateEditable(
  editable: MealPhotoFinalizationEditableValues,
  mode: MealPhotoFinalizationMode
): MealPhotoFinalizationDraftState["validation"] {
  const errors: Partial<Record<MealPhotoFinalizationField, "required" | "invalid" | "negative" | "too_large">> = {};
  const name = editable.mealName.trim();
  if (!name) errors.mealName = "required";
  else if (name.length > 160) errors.mealName = "too_large";
  if (splitComponents(editable.components).length > 12) errors.components = "too_large";
  if (editable.portion.trim().length > 200) errors.portion = "too_large";
  for (const field of ["calories", "proteinGrams", "carbsGrams", "fatGrams"] as const) {
    const value = editable[field].trim();
    if (!value) continue;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) errors[field] = "invalid";
    else if (parsed < 0) errors[field] = "negative";
    else if (parsed > (field === "calories" ? 20000 : 2000)) errors[field] = "too_large";
  }
  if (mode === "manual" && !name) errors.mealName = "required";
  return Object.freeze(errors);
}

function toMealWrite(editable: MealPhotoFinalizationEditableValues): MealIdentificationFinalizationV3MealWriteInput {
  const nutrition: Record<string, number> = {};
  for (const field of ["calories", "proteinGrams", "carbsGrams", "fatGrams"] as const) {
    const value = editable[field].trim();
    if (value) nutrition[field] = Number(value);
  }
  return Object.freeze({
    mealName: editable.mealName,
    components: Object.freeze(splitComponents(editable.components)),
    portion: editable.portion.trim() || null,
    nutrition: Object.freeze(nutrition)
  });
}

function splitComponents(value: string): string[] {
  return value
    .split(/[、,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isDirty(
  mode: MealPhotoFinalizationMode,
  original: MealPhotoAnalysisCandidate | null,
  editable: MealPhotoFinalizationEditableValues
): boolean {
  if (mode === "manual") return Object.values(editable).some((value) => value.trim().length > 0);
  if (!original) return true;
  return JSON.stringify(toMealWrite(editable)) !== JSON.stringify({
    mealName: original.observedName,
    components: original.components.map((component) => component.name),
    portion: null,
    nutrition: original.estimatedNutrition
  });
}

// Every field compared here is fingerprint-bearing, so this is also the definition of "the payload
// changed". MI-E-C5-R7-B1 adds the restaurant ids: without them a venue change would compare equal,
// updateMealPhotoFinalizationContext would return the same state, and the draft would keep both the
// previous restaurant AND the previous clientRequestId — a different meal submitted under an
// already-used idempotency token.
function sameContext(left: MealPhotoFinalizationContext, right: MealPhotoFinalizationContext) {
  return (
    left.captureMethod === right.captureMethod &&
    left.sourceContext === right.sourceContext &&
    left.recordTiming === right.recordTiming &&
    left.occurredAt === right.occurredAt &&
    left.selectedMealPeriod === right.selectedMealPeriod &&
    left.restaurantId === right.restaurantId &&
    left.branchId === right.branchId
  );
}

function mapMealPeriod(value: string): ConsumerMealIdentificationFinalizationDraft["mealType"] | null {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("早餐") || normalized === "breakfast") return "breakfast";
  if (normalized.includes("午餐") || normalized === "lunch") return "lunch";
  if (normalized.includes("晚餐") || normalized === "dinner") return "dinner";
  if (normalized.includes("點心") || normalized === "snack") return "snack";
  if (normalized === "late_night") return "late_night";
  if (normalized === "other") return "other";
  return null;
}

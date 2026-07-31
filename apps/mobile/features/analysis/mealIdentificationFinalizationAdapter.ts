import type { ConsumerMealIdentificationFinalizationDraft } from "../consumer-runtime/consumerMealIdentificationFinalizationRuntime";
import {
  buildMealIdentificationFinalization,
  MEAL_IDENTIFICATION_FINALIZATION_VERSION,
  type MealIdentificationCandidate,
  type MealIdentificationFinalizationError,
  type MealOccurrenceTimestamp,
  type MealRecordTiming,
  type MealSourceContext
} from "../meal-identification";
import type { NutritionSummary } from "./types";

export type AnalysisFinalizationAvailability = "available" | "unavailable";

export type AnalysisMealIdentificationFinalizationAdapterInput = Readonly<{
  selectedMealPeriod: string;
  restaurantName: string;
  mealName: string;
  sourceContext: MealSourceContext;
  recordTiming: MealRecordTiming;
  occurredAt: MealOccurrenceTimestamp;
  selectedCandidate: MealIdentificationCandidate | null;
  catalogConfirmed: boolean;
  isSelfCooked: boolean;
  nutritionSummary: NutritionSummary;
  nutritionRefreshed: boolean;
  correctionCompleted: boolean;
  correctedRows: Readonly<Record<string, boolean>>;
  preMealPhotoIds: readonly string[];
  analysisAvailability: AnalysisFinalizationAvailability;
  observedAt: string;
}>;

export type AnalysisMealIdentificationFinalizationAdapterResult =
  | Readonly<{ ok: true; value: ConsumerMealIdentificationFinalizationDraft }>
  | Readonly<{ ok: false; error: MealIdentificationFinalizationError }>;

export type MealIdentificationFinalizationUiErrorKind =
  | "authentication"
  | "invalid"
  | "catalog"
  | "invariant"
  | "conflict"
  | "authorization"
  | "analysis"
  | "candidate"
  | "manual"
  | "alreadyFinalized"
  | "persistence"
  | "client"
  | "generic";

export function buildAnalysisMealIdentificationFinalizationDraft(
  input: AnalysisMealIdentificationFinalizationAdapterInput
): AnalysisMealIdentificationFinalizationAdapterResult {
  const result = buildMealIdentificationFinalization({
    version: MEAL_IDENTIFICATION_FINALIZATION_VERSION,
    recordTiming: input.recordTiming,
    occurredAt: input.occurredAt,
    originalAnalysis:
      input.analysisAvailability === "available"
        ? {
            status: "available",
            detectedItemNames: [input.mealName],
            model: null,
            photoReferences: [...input.preMealPhotoIds],
            estimatedNutrition: nutritionSnapshot(input.nutritionSummary),
            confidence: null,
            analyzedAt: input.observedAt
          }
        : {
            status: "unavailable",
            detectedItemNames: [],
            model: null,
            photoReferences: [],
            estimatedNutrition: null,
            confidence: null,
            analyzedAt: null
          },
    selection:
      input.selectedCandidate?.kind === "catalog_item"
        ? {
            kind: "catalog_selection",
            confirmationStatus: input.catalogConfirmed ? "confirmed" : "pending",
            sourceContext: input.sourceContext,
            candidate: input.selectedCandidate
          }
        : {
            kind: "personal_unresolved_selection",
            sourceContext: input.sourceContext,
            candidate: input.selectedCandidate
          },
    corrections: Object.keys(input.correctedRows)
      .filter((rowKey) => input.correctedRows[rowKey])
      .map((rowKey) => ({
        correctedAt: input.observedAt,
        correctionReason: null,
        detail: {
          correctionType: "unknown",
          rawCorrectionType: rowKey.endsWith("-added")
            ? "ui_section_addition"
            : "ui_row_confirmation",
          after: { rowKey }
        }
      })),
    mealWrite: {
      selectedMealPeriod: input.selectedMealPeriod,
      mealName: input.mealName,
      portion: input.nutritionSummary.portion,
      nutrition: nutritionSnapshot(input.nutritionSummary),
      isSelfCooked: input.isSelfCooked,
      wasUserCorrected:
        input.nutritionRefreshed ||
        input.correctionCompleted ||
        Object.values(input.correctedRows).some(Boolean) ||
        input.selectedCandidate?.kind === "personal_unresolved"
    }
  });

  if (!result.ok) return result;
  const mealType = mapMealPeriod(input.selectedMealPeriod);
  if (!mealType) {
    return {
      ok: false,
      error: {
        code: "invalid_meal_write_projection",
        message: "Selected meal period is unsupported."
      }
    };
  }
  return {
    ok: true,
    value: Object.freeze({
      mealType,
      finalization: result.value
    })
  };
}

export function mapMealIdentificationFinalizationUiError(
  errorCode: string | null
): MealIdentificationFinalizationUiErrorKind {
  if (
    errorCode === "finalization_authentication_required" ||
    errorCode === "finalization_authentication_failed"
  ) {
    return "authentication";
  }
  if (errorCode === "finalization_catalog_identity_rejected") return "catalog";
  if (errorCode === "finalization_idempotency_conflict") return "conflict";
  if (
    errorCode === "finalization_analysis_not_found" ||
    errorCode === "finalization_analysis_access_denied" ||
    errorCode === "finalization_analysis_not_ready"
  ) {
    return "analysis";
  }
  if (errorCode === "finalization_analysis_already_finalized") return "alreadyFinalized";
  if (errorCode === "finalization_client_error") return "client";
  if (errorCode === "finalization_invalid_candidate") return "candidate";
  if (errorCode === "finalization_invalid_manual_draft") return "manual";
  if (errorCode === "finalization_correction_validation_failed") return "invalid";
  if (errorCode === "finalization_ownership_or_authorization_rejected") {
    return "authorization";
  }
  if (
    errorCode === "finalization_invalid_input" ||
    errorCode === "finalization_forbidden_field" ||
    errorCode === "finalization_unsupported_contract_version"
  ) {
    return "invalid";
  }
  if (
    errorCode === "finalization_identity_invariant_violation" ||
    errorCode === "finalization_analysis_invariant_violation" ||
    errorCode === "finalization_correction_invariant_violation" ||
    errorCode === "finalization_durable_state_inconsistency"
  ) {
    return errorCode === "finalization_durable_state_inconsistency" ? "persistence" : "invariant";
  }
  return "generic";
}

function nutritionSnapshot(value: NutritionSummary) {
  return {
    calories: value.calories,
    protein: value.protein,
    carbohydrates: value.carbohydrates,
    fat: value.fat
  };
}

function mapMealPeriod(
  value: string
): ConsumerMealIdentificationFinalizationDraft["mealType"] | null {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("早餐") || normalized === "breakfast") return "breakfast";
  if (normalized.includes("午餐") || normalized === "lunch") return "lunch";
  if (normalized.includes("晚餐") || normalized === "dinner") return "dinner";
  if (normalized.includes("點心") || normalized === "snack") return "snack";
  if (normalized === "late_night") return "late_night";
  if (normalized === "other") return "other";
  return null;
}

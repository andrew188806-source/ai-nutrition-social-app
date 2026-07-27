import {
  MEAL_PHOTO_ANALYSIS_MAX_CANDIDATES,
  MEAL_PHOTO_ANALYSIS_MAX_COMPONENTS_PER_CANDIDATE,
  MEAL_PHOTO_ANALYSIS_MAX_OBSERVED_NAME_LENGTH,
  MEAL_PHOTO_ANALYSIS_MAX_UNCERTAINTY_REASON_CODES,
  MEAL_PHOTO_ANALYSIS_MIN_CANDIDATES,
  MEAL_PHOTO_ANALYSIS_UNCERTAINTY_REASON_CODES,
  type MealPhotoAnalysisCandidateComponent,
  type MealPhotoAnalysisEstimatedNutrition,
  type MealPhotoAnalysisUncertaintyReasonCode
} from "./types";

// MI-E-C4: the shape a provider's raw model output must satisfy BEFORE the server ever assigns a
// candidateId or any other server-controlled metadata. Deliberately narrower than
// MealPhotoAnalysisCandidate: no candidateId field exists here at all — a provider (or a
// maliciously/incorrectly prompted model) supplying one is rejected by the exact-key-set check
// below, not silently ignored, since accepting a model-chosen ID would let the model control
// server-controlled identity.
export type RawMealPhotoAnalysisProviderCandidate = {
  observedName: string;
  components: MealPhotoAnalysisCandidateComponent[];
  estimatedNutrition: MealPhotoAnalysisEstimatedNutrition;
  confidence: number;
  uncertaintyReasonCodes: MealPhotoAnalysisUncertaintyReasonCode[];
};

export type RawMealPhotoAnalysisProviderOutput = {
  candidates: RawMealPhotoAnalysisProviderCandidate[];
};

export type ProviderOutputValidationOutcome =
  | { ok: true; value: RawMealPhotoAnalysisProviderOutput }
  | { ok: false; errorCode: "provider_invalid_response" };

const CANDIDATE_KEYS = ["observedName", "components", "estimatedNutrition", "confidence", "uncertaintyReasonCodes"] as const;
const COMPONENT_KEYS = ["name", "estimatedPortion"] as const;
const NUTRITION_KEYS = ["calories", "proteinGrams", "carbsGrams", "fatGrams"] as const;
const MAX_COMPONENT_FIELD_LENGTH = 100;
// Generous sanity ceilings — real meals never approach these; this only exists to reject a
// clearly broken/hallucinated response, not to model an actual nutritional upper bound.
const MAX_CALORIES = 5000;
const MAX_MACRO_GRAMS = 1000;

function fail(): ProviderOutputValidationOutcome {
  return { ok: false, errorCode: "provider_invalid_response" };
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.join(",") === [...expected].sort().join(",");
}

function isNonNegativeFiniteNumber(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max;
}

function validateComponent(value: unknown): value is MealPhotoAnalysisCandidateComponent {
  if (typeof value !== "object" || value === null) return false;
  if (!hasExactKeys(value, COMPONENT_KEYS)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.name === "string" &&
    record.name.length > 0 &&
    record.name.length <= MAX_COMPONENT_FIELD_LENGTH &&
    typeof record.estimatedPortion === "string" &&
    record.estimatedPortion.length > 0 &&
    record.estimatedPortion.length <= MAX_COMPONENT_FIELD_LENGTH
  );
}

function validateNutrition(value: unknown): value is MealPhotoAnalysisEstimatedNutrition {
  if (typeof value !== "object" || value === null) return false;
  if (!hasExactKeys(value, NUTRITION_KEYS)) return false;
  const record = value as Record<string, unknown>;
  return (
    isNonNegativeFiniteNumber(record.calories, MAX_CALORIES) &&
    isNonNegativeFiniteNumber(record.proteinGrams, MAX_MACRO_GRAMS) &&
    isNonNegativeFiniteNumber(record.carbsGrams, MAX_MACRO_GRAMS) &&
    isNonNegativeFiniteNumber(record.fatGrams, MAX_MACRO_GRAMS)
  );
}

function validateCandidate(value: unknown): value is RawMealPhotoAnalysisProviderCandidate {
  if (typeof value !== "object" || value === null) return false;
  if (!hasExactKeys(value, CANDIDATE_KEYS)) return false;
  const record = value as Record<string, unknown>;

  if (
    typeof record.observedName !== "string" ||
    record.observedName.length === 0 ||
    record.observedName.length > MEAL_PHOTO_ANALYSIS_MAX_OBSERVED_NAME_LENGTH
  ) {
    return false;
  }

  if (!Array.isArray(record.components) || record.components.length > MEAL_PHOTO_ANALYSIS_MAX_COMPONENTS_PER_CANDIDATE) {
    return false;
  }
  if (!record.components.every(validateComponent)) return false;

  if (!validateNutrition(record.estimatedNutrition)) return false;

  if (typeof record.confidence !== "number" || !Number.isFinite(record.confidence) || record.confidence < 0 || record.confidence > 1) {
    return false;
  }

  if (
    !Array.isArray(record.uncertaintyReasonCodes) ||
    record.uncertaintyReasonCodes.length > MEAL_PHOTO_ANALYSIS_MAX_UNCERTAINTY_REASON_CODES
  ) {
    return false;
  }
  if (
    !record.uncertaintyReasonCodes.every((code: unknown) =>
      typeof code === "string" && (MEAL_PHOTO_ANALYSIS_UNCERTAINTY_REASON_CODES as readonly string[]).includes(code)
    )
  ) {
    return false;
  }

  return true;
}

// The single runtime authority for "is this raw provider output legal". Called before the server
// ever assigns candidateId/metadata — a provider's Structured Outputs guarantee (if any) is never
// trusted as a substitute for this independent check.
export function validateRawProviderOutput(input: unknown): ProviderOutputValidationOutcome {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return fail();
  const record = input as Record<string, unknown>;
  if (!hasExactKeys(record, ["candidates"])) return fail();
  if (!Array.isArray(record.candidates)) return fail();
  if (record.candidates.length < MEAL_PHOTO_ANALYSIS_MIN_CANDIDATES || record.candidates.length > MEAL_PHOTO_ANALYSIS_MAX_CANDIDATES) {
    return fail();
  }
  if (!record.candidates.every(validateCandidate)) return fail();
  return { ok: true, value: { candidates: record.candidates as RawMealPhotoAnalysisProviderCandidate[] } };
}

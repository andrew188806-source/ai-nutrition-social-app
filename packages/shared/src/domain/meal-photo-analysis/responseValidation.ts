import type { RawMealPhotoAnalysisProviderOutput } from "./providerOutputSchema";
import {
  MEAL_PHOTO_ANALYSIS_MAX_CANDIDATES,
  MEAL_PHOTO_ANALYSIS_MIN_CANDIDATES,
  MEAL_PHOTO_ANALYSIS_RESPONSE_SCHEMA_VERSION,
  type MealPhotoAnalysisCandidate,
  type MealPhotoAnalysisProviderCategory,
  type MealPhotoAnalysisResponseV1,
  type MealPhotoAnalysisStatus
} from "./types";

// MI-E-C4: the single runtime authority validating a fully-assembled MealPhotoAnalysisResponseV1
// — used both to self-check buildMealPhotoAnalysisResponseV1's own output before it ever leaves
// the Edge Function, and as a general-purpose validator reusable by tests.
export type ResponseValidationOutcome =
  | { ok: true; value: MealPhotoAnalysisResponseV1 }
  | { ok: false; reason: string };

const RESPONSE_KEYS = [
  "schemaVersion",
  "providerCategory",
  "analysisEngineVersion",
  "promptVersion",
  "analysisStatus",
  "candidates",
  "requiresUserConfirmation",
  "safeUserFacingErrorCode",
  "safeUserFacingErrorMessage"
] as const;
const CANDIDATE_KEYS = ["candidateId", "observedName", "components", "estimatedNutrition", "confidence", "uncertaintyReasonCodes"] as const;
const PROVIDER_CATEGORIES: readonly MealPhotoAnalysisProviderCategory[] = ["external_multimodal", "tastkind_model", "hybrid"];
const ANALYSIS_STATUSES: readonly MealPhotoAnalysisStatus[] = ["completed", "low_confidence", "failed", "unavailable"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.join(",") === [...expected].sort().join(",");
}

function fail(reason: string): ResponseValidationOutcome {
  return { ok: false, reason };
}

export function validateMealPhotoAnalysisResponseV1(input: unknown): ResponseValidationOutcome {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return fail("not_an_object");
  const record = input as Record<string, unknown>;
  if (!hasExactKeys(record, RESPONSE_KEYS)) return fail("unexpected_keys");
  if (record.schemaVersion !== MEAL_PHOTO_ANALYSIS_RESPONSE_SCHEMA_VERSION) return fail("bad_schema_version");
  if (!PROVIDER_CATEGORIES.includes(record.providerCategory as MealPhotoAnalysisProviderCategory)) return fail("bad_provider_category");
  if (typeof record.analysisEngineVersion !== "string" || record.analysisEngineVersion.length === 0) return fail("bad_engine_version");
  if (typeof record.promptVersion !== "string" || record.promptVersion.length === 0) return fail("bad_prompt_version");
  if (!ANALYSIS_STATUSES.includes(record.analysisStatus as MealPhotoAnalysisStatus)) return fail("bad_analysis_status");
  if (record.requiresUserConfirmation !== true) return fail("requires_user_confirmation_not_true");

  const status = record.analysisStatus as MealPhotoAnalysisStatus;
  if (status === "failed" || status === "unavailable") {
    if (!Array.isArray(record.candidates) || record.candidates.length !== 0) return fail("candidates_must_be_empty_on_failure");
    if (typeof record.safeUserFacingErrorCode !== "string" || record.safeUserFacingErrorCode.length === 0) return fail("missing_error_code");
  } else {
    if (record.safeUserFacingErrorCode !== null) return fail("error_code_must_be_null_on_success");
    if (record.safeUserFacingErrorMessage !== null) return fail("error_message_must_be_null_on_success");
    if (!Array.isArray(record.candidates)) return fail("candidates_not_array");
    if (record.candidates.length < MEAL_PHOTO_ANALYSIS_MIN_CANDIDATES || record.candidates.length > MEAL_PHOTO_ANALYSIS_MAX_CANDIDATES) {
      return fail("candidate_count_out_of_range");
    }
    for (const candidate of record.candidates) {
      if (typeof candidate !== "object" || candidate === null) return fail("candidate_not_object");
      if (!hasExactKeys(candidate, CANDIDATE_KEYS)) return fail("candidate_unexpected_keys");
      const candidateRecord = candidate as Record<string, unknown>;
      if (typeof candidateRecord.candidateId !== "string" || !UUID_PATTERN.test(candidateRecord.candidateId)) {
        return fail("candidate_id_not_uuid");
      }
      if (typeof candidateRecord.confidence !== "number" || candidateRecord.confidence < 0 || candidateRecord.confidence > 1) {
        return fail("candidate_confidence_out_of_range");
      }
    }
  }

  return { ok: true, value: record as unknown as MealPhotoAnalysisResponseV1 };
}

export type BuildResponseInput = {
  providerCategory: MealPhotoAnalysisProviderCategory;
  analysisEngineVersion: string;
  promptVersion: string;
  analysisStatus: MealPhotoAnalysisStatus;
  rawOutput: RawMealPhotoAnalysisProviderOutput | null;
  safeUserFacingErrorCode: string | null;
  safeUserFacingErrorMessage: string | null;
  generateCandidateId: () => string;
};

// The single place candidateId (and every other server-controlled field) is assigned. A provider
// can never supply/influence a candidateId, the schema version, requiresUserConfirmation, or the
// provider category — all of those come only from here. Re-validates its own output before
// returning; throws if that self-check somehow fails, since that would mean this function itself
// has a bug, not that the caller's input was bad (the caller's input was already validated by
// validateRawProviderOutput before ever reaching here).
export function buildMealPhotoAnalysisResponseV1(input: BuildResponseInput): MealPhotoAnalysisResponseV1 {
  const candidates: MealPhotoAnalysisCandidate[] = (input.rawOutput?.candidates ?? []).map((candidate) => ({
    candidateId: input.generateCandidateId(),
    observedName: candidate.observedName,
    components: candidate.components,
    estimatedNutrition: candidate.estimatedNutrition,
    confidence: candidate.confidence,
    uncertaintyReasonCodes: candidate.uncertaintyReasonCodes
  }));

  const response: MealPhotoAnalysisResponseV1 = {
    schemaVersion: MEAL_PHOTO_ANALYSIS_RESPONSE_SCHEMA_VERSION,
    providerCategory: input.providerCategory,
    analysisEngineVersion: input.analysisEngineVersion,
    promptVersion: input.promptVersion,
    analysisStatus: input.analysisStatus,
    candidates,
    requiresUserConfirmation: true,
    safeUserFacingErrorCode: input.safeUserFacingErrorCode,
    safeUserFacingErrorMessage: input.safeUserFacingErrorMessage
  };

  const selfCheck = validateMealPhotoAnalysisResponseV1(response);
  if (!selfCheck.ok) {
    throw new Error(`buildMealPhotoAnalysisResponseV1 produced an invalid response: ${selfCheck.reason}`);
  }
  return response;
}

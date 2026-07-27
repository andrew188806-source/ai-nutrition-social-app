import {
  MEAL_PHOTO_ANALYSIS_FORBIDDEN_REQUEST_FIELDS,
  MEAL_PHOTO_ANALYSIS_REQUEST_CONTRACT_VERSION,
  type MealPhotoAnalysisRequestV1,
  type MealSourceContext
} from "./types";

// MI-E-C4: the ONLY runtime authority for whether a caller-supplied request body is a legal
// MealPhotoAnalysisRequestV1. TypeScript types alone are compile-time only and cannot validate a
// real HTTP request body — this is what the Edge Function calls before trusting anything in the
// parsed JSON. additionalProperties is enforced by exact-key-set comparison, not by any schema
// library (this repo has none), matching this repo's existing hand-written-validator convention.
export type RequestValidationOutcome =
  | { ok: true; value: MealPhotoAnalysisRequestV1 }
  | { ok: false; errorCode: "invalid_request" };

const REQUIRED_REQUEST_KEYS = [
  "contractVersion",
  "analysisRequestId",
  "imageObjectRef",
  "captureMethod",
  "capturedAt",
  "mealSourceContext",
  "locale"
] as const;

const MEAL_SOURCE_CONTEXTS: readonly MealSourceContext[] = ["dine_in", "takeout", "delivery", "self_cooked", "unknown"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_IMAGE_OBJECT_REF_LENGTH = 512;
const MAX_LOCALE_LENGTH = 35;

function fail(): RequestValidationOutcome {
  return { ok: false, errorCode: "invalid_request" };
}

export function validateMealPhotoAnalysisRequestV1(input: unknown): RequestValidationOutcome {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return fail();
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== REQUIRED_REQUEST_KEYS.length || keys.join(",") !== [...REQUIRED_REQUEST_KEYS].sort().join(",")) {
    return fail();
  }
  if (MEAL_PHOTO_ANALYSIS_FORBIDDEN_REQUEST_FIELDS.some((field) => field in record)) return fail();

  if (record.contractVersion !== MEAL_PHOTO_ANALYSIS_REQUEST_CONTRACT_VERSION) return fail();

  if (typeof record.analysisRequestId !== "string" || !UUID_PATTERN.test(record.analysisRequestId)) return fail();

  if (
    typeof record.imageObjectRef !== "string" ||
    record.imageObjectRef.length === 0 ||
    record.imageObjectRef.length > MAX_IMAGE_OBJECT_REF_LENGTH ||
    record.imageObjectRef.includes("..") ||
    record.imageObjectRef.startsWith("/") ||
    record.imageObjectRef.includes("://")
  ) {
    return fail();
  }

  if (record.captureMethod !== "camera" && record.captureMethod !== "photo_library") return fail();

  if (typeof record.capturedAt !== "string" || Number.isNaN(Date.parse(record.capturedAt))) return fail();

  if (typeof record.mealSourceContext !== "string" || !MEAL_SOURCE_CONTEXTS.includes(record.mealSourceContext as MealSourceContext)) {
    return fail();
  }

  if (typeof record.locale !== "string" || record.locale.length === 0 || record.locale.length > MAX_LOCALE_LENGTH) {
    return fail();
  }

  return {
    ok: true,
    value: {
      contractVersion: record.contractVersion,
      analysisRequestId: record.analysisRequestId,
      imageObjectRef: record.imageObjectRef,
      captureMethod: record.captureMethod,
      capturedAt: record.capturedAt,
      mealSourceContext: record.mealSourceContext as MealSourceContext,
      locale: record.locale
    }
  };
}

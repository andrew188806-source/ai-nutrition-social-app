import type { MealPhotoAnalysisErrorCode } from "../_shared/meal-photo-analysis/index.ts";

// MI-E-C4: stable, safe HTTP error envelope. Never includes a provider raw error body, API key,
// raw SQL error, raw model output, stack trace, full user UID, or base64 image — see
// buildErrorResponse's own restriction to (code, message) only.
export type MealPhotoAnalysisErrorEnvelope = {
  error: {
    code: MealPhotoAnalysisErrorCode;
    message: string;
  };
};

const HTTP_STATUS_BY_CODE: Record<MealPhotoAnalysisErrorCode, number> = {
  authentication_required: 401,
  invalid_request: 400,
  invalid_image_object_ref: 400,
  image_object_not_found: 404,
  image_object_access_denied: 403,
  unsupported_image_type: 422,
  image_too_large: 413,
  analysis_disabled: 503,
  provider_rate_limited: 429,
  provider_timeout: 504,
  provider_unavailable: 502,
  provider_invalid_response: 502,
  persistence_failed: 500,
  analysis_conflict: 409,
  internal_error: 500
};

const SAFE_MESSAGE_BY_CODE: Record<MealPhotoAnalysisErrorCode, string> = {
  authentication_required: "Authentication is required.",
  invalid_request: "The request body is invalid.",
  invalid_image_object_ref: "The image object reference is invalid.",
  image_object_not_found: "The referenced image could not be found.",
  image_object_access_denied: "Access to the referenced image was denied.",
  unsupported_image_type: "The image is not a supported format.",
  image_too_large: "The image exceeds the maximum allowed size.",
  analysis_disabled: "Meal photo analysis is not enabled.",
  provider_rate_limited: "The analysis provider is temporarily rate-limited. Please try again shortly.",
  provider_timeout: "The analysis provider did not respond in time.",
  provider_unavailable: "The analysis provider is temporarily unavailable.",
  provider_invalid_response: "The analysis provider returned an invalid response.",
  persistence_failed: "The analysis result could not be saved.",
  analysis_conflict: "This analysis request is already being processed or conflicts with an existing request.",
  internal_error: "An internal error occurred."
};

export function httpStatusForErrorCode(code: MealPhotoAnalysisErrorCode): number {
  return HTTP_STATUS_BY_CODE[code];
}

export function safeMessageForErrorCode(code: MealPhotoAnalysisErrorCode): string {
  return SAFE_MESSAGE_BY_CODE[code];
}

export function buildErrorResponse(code: MealPhotoAnalysisErrorCode): Response {
  const body: MealPhotoAnalysisErrorEnvelope = { error: { code, message: safeMessageForErrorCode(code) } };
  return new Response(JSON.stringify(body), {
    status: httpStatusForErrorCode(code),
    headers: { "content-type": "application/json" }
  });
}

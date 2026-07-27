import type {
  MealPhotoAnalysisErrorCode,
  MealPhotoAnalysisResponseV1,
  MealPhotoCaptureMethod,
  MealSourceContext
} from "@haocu/shared";

// MI-E-C5-A: Mobile-only client input for invoking the meal-photo-analysis Edge Function. This is
// deliberately narrower than the shared MealPhotoAnalysisRequestV1 — it never carries
// contractVersion (the adapter injects that from the shared constant, so Mobile never hand-writes
// a version string that could drift) and it can never carry userId, provider/model choice,
// training consent/eligibility, restaurant commercial permission, or a public URL, because those
// fields simply do not exist on this type.
export type MealPhotoAnalysisClientInput = {
  analysisRequestId: string;
  imageObjectRef: string;
  captureMethod: MealPhotoCaptureMethod;
  mealSourceContext: MealSourceContext;
  capturedAt: string;
  locale: string;
};

// The real shared response contract is reused directly (not copied) as the success value — see
// MI-E-C4's MealPhotoAnalysisResponseV1. Mobile never casts a raw invoke() response into this
// shape; only validateMealPhotoAnalysisResponseV1's own validated output is ever placed here (see
// adapters/supabaseMealPhotoAnalysisRepository.ts).
export type MealPhotoAnalysisClientResult = MealPhotoAnalysisResponseV1;

// Adds two Mobile-only codes to the shared server vocabulary: invalid_server_response (a
// successful HTTP response that still failed local shared-schema validation) and network_error
// (the request never reached the Function at all, or the Supabase relay could not reach it).
export type MealPhotoAnalysisClientErrorCode = MealPhotoAnalysisErrorCode | "invalid_server_response" | "network_error";

export class MealPhotoAnalysisClientError extends Error {
  readonly code: MealPhotoAnalysisClientErrorCode;

  constructor(code: MealPhotoAnalysisClientErrorCode, message: string) {
    super(message);
    this.name = "MealPhotoAnalysisClientError";
    this.code = code;
  }
}

export type MealPhotoAnalysisOutcome =
  | { ok: true; value: MealPhotoAnalysisClientResult }
  | { ok: false; error: MealPhotoAnalysisClientError };

export function okAnalysis(value: MealPhotoAnalysisClientResult): MealPhotoAnalysisOutcome {
  return { ok: true, value };
}

export function errAnalysis(error: MealPhotoAnalysisClientError): MealPhotoAnalysisOutcome {
  return { ok: false, error };
}

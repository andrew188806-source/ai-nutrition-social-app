import {
  MEAL_PHOTO_ANALYSIS_ERROR_CODES,
  MEAL_PHOTO_ANALYSIS_REQUEST_CONTRACT_VERSION,
  validateMealPhotoAnalysisRequestV1,
  validateMealPhotoAnalysisResponseV1,
  type MealPhotoAnalysisErrorCode
} from "@haocu/shared";
import type { ConsumerAuthPort } from "../../consumer-auth/ports";
import { errAnalysis, okAnalysis, MealPhotoAnalysisClientError, type MealPhotoAnalysisClientInput } from "../types";
import type { MealPhotoAnalysisRepository } from "../ports";
import {
  MEAL_PHOTO_ANALYSIS_FUNCTION_NAME,
  type SupabaseFunctionsInvokeErrorLike,
  type SupabaseMealPhotoAnalysisClientLike
} from "../supabaseMealPhotoAnalysisContracts";

export type SupabaseMealPhotoAnalysisRepositoryOptions = {
  authPort: ConsumerAuthPort;
  analysisClient: SupabaseMealPhotoAnalysisClientLike;
  analysisEnabled: boolean;
};

const KNOWN_SERVER_ERROR_CODES = new Set<string>(MEAL_PHOTO_ANALYSIS_ERROR_CODES);

function extractSafeErrorCode(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const errorField = (body as Record<string, unknown>).error;
  if (typeof errorField !== "object" || errorField === null) return null;
  const code = (errorField as Record<string, unknown>).code;
  return typeof code === "string" ? code : null;
}

// Maps a supabase-js functions.invoke() failure to a stable, safe Mobile error code. Never
// surfaces the raw error message/body — only a code from the shared closed vocabulary (or the two
// Mobile-only fallback codes) ever reaches the caller. See supabaseMealPhotoAnalysisContracts.ts
// for the verified-against-source invoke() error shape this relies on.
async function mapInvokeErrorToClientError(error: SupabaseFunctionsInvokeErrorLike): Promise<MealPhotoAnalysisClientError> {
  if (error.name === "FunctionsFetchError" || error.name === "FunctionsRelayError") {
    return new MealPhotoAnalysisClientError("network_error", "Could not reach the meal photo analysis service.");
  }
  if (error.name === "FunctionsHttpError" && error.context) {
    try {
      const body = await error.context.json();
      const code = extractSafeErrorCode(body);
      if (code && KNOWN_SERVER_ERROR_CODES.has(code)) {
        return new MealPhotoAnalysisClientError(code as MealPhotoAnalysisErrorCode, "The meal photo analysis service returned an error.");
      }
    } catch {
      // Fall through to internal_error below — never surface a raw parse failure.
    }
  }
  return new MealPhotoAnalysisClientError("internal_error", "The meal photo analysis service returned an unexpected error.");
}

// Reuses the caller's already-authenticated Supabase client — this adapter never builds a second
// (admin/service-role) client and never accepts a caller-supplied trusted user ID. JWT propagation
// is handled entirely by the Supabase SDK itself (see supabaseMealPhotoAnalysisContracts.ts).
export class SupabaseMealPhotoAnalysisRepository implements MealPhotoAnalysisRepository {
  readonly source = "supabase-live" as const;

  constructor(private readonly options: SupabaseMealPhotoAnalysisRepositoryOptions) {}

  async analyzeMealPhoto(input: MealPhotoAnalysisClientInput) {
    if (!this.options.analysisEnabled) {
      return errAnalysis(new MealPhotoAnalysisClientError("analysis_disabled", "Meal photo analysis is disabled in this runtime."));
    }

    const session = await this.options.authPort.getCurrentSession();
    if (!session.ok || !session.value) {
      return errAnalysis(new MealPhotoAnalysisClientError("authentication_required", "Meal photo analysis requires an authenticated session."));
    }

    // Single runtime authority: the exact same validator the Edge Function itself uses (imported
    // from @haocu/shared, never a second hand-copied version). A request that fails this check is
    // never sent — the Function is not called, no new analysisRequestId is generated, and the
    // local photo preview is left untouched by this repository (analysis.tsx/the hook own that).
    const requestValidation = validateMealPhotoAnalysisRequestV1({
      contractVersion: MEAL_PHOTO_ANALYSIS_REQUEST_CONTRACT_VERSION,
      analysisRequestId: input.analysisRequestId,
      imageObjectRef: input.imageObjectRef,
      captureMethod: input.captureMethod,
      capturedAt: input.capturedAt,
      mealSourceContext: input.mealSourceContext,
      locale: input.locale
    });
    if (!requestValidation.ok) {
      return errAnalysis(new MealPhotoAnalysisClientError("invalid_request", "Meal photo analysis request failed local validation."));
    }

    let invokeResult;
    try {
      invokeResult = await this.options.analysisClient.functions.invoke(MEAL_PHOTO_ANALYSIS_FUNCTION_NAME, {
        body: requestValidation.value
      });
    } catch {
      return errAnalysis(new MealPhotoAnalysisClientError("network_error", "Could not reach the meal photo analysis service."));
    }

    if (invokeResult.error) {
      return errAnalysis(await mapInvokeErrorToClientError(invokeResult.error));
    }

    // Never cast the raw response — only the shared validator's own output is ever trusted or
    // stored. A response that passes HTTP-level success but fails this check (wrong shape,
    // requiresUserConfirmation not literal true, candidate count out of range, etc.) is reported
    // as invalid_server_response, never silently accepted.
    const responseValidation = validateMealPhotoAnalysisResponseV1(invokeResult.data);
    if (!responseValidation.ok) {
      return errAnalysis(new MealPhotoAnalysisClientError("invalid_server_response", "Meal photo analysis response failed local validation."));
    }

    return okAnalysis(responseValidation.value);
  }
}

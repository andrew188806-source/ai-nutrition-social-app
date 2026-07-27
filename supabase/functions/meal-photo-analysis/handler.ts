import {
  MEAL_PHOTO_ANALYSIS_REQUEST_CONTRACT_VERSION,
  MEAL_PHOTO_ANALYSIS_RESPONSE_SCHEMA_VERSION,
  buildMealPhotoAnalysisResponseV1,
  validateMealPhotoAnalysisRequestV1,
  validateMealPhotoAnalysisResponseV1,
  type MealPhotoAnalysisErrorCode,
  type MealPhotoAnalysisResponseV1
} from "../_shared/meal-photo-analysis/index.ts";
import { authenticateCaller, type AuthOutcome } from "./auth.ts";
import { loadServerConfig, type MealPhotoAnalysisServerConfig } from "./config.ts";
import { buildErrorResponse } from "./errors.ts";
import { downloadAndValidateImage, type ImageDownloadOutcome } from "./imageValidation.ts";
import { validateCanonicalImageObjectRef } from "./objectValidation.ts";
import {
  claimAnalysisRequest,
  createAdminClient,
  markAnalysisCompleted,
  markAnalysisFailed,
  type MealAnalysisRow
} from "./persistence.ts";
import { MEAL_PHOTO_ANALYSIS_PROMPT_VERSION } from "./prompt.ts";
import {
  DisabledMealPhotoAnalysisProvider,
  type MealPhotoAnalysisProvider,
  type MealPhotoAnalysisProviderOutcome
} from "./provider.ts";
import { OpenAiMealPhotoAnalysisProvider } from "./openaiProvider.ts";

// MI-E-C4: orchestration only. Auth verification lives in auth.ts, path/UUID validation in
// objectValidation.ts, Storage download+binary/SHA-256 revalidation in imageValidation.ts,
// claim/persist in persistence.ts, prompt/schema in prompt.ts, the actual model call in
// openaiProvider.ts — this file wires them together and decides which HTTP response shape each
// outcome gets, so no individual piece has to know about the others' internals.
const LOW_CONFIDENCE_THRESHOLD = 0.5;
const PROVIDER_CATEGORY = "external_multimodal" as const;

export type HandlerDependencies = {
  loadServerConfig: typeof loadServerConfig;
  authenticateCaller: (request: Request, url: string, anonKey: string) => Promise<AuthOutcome>;
  downloadAndValidateImage: typeof downloadAndValidateImage;
  createAdminClient: typeof createAdminClient;
  createProvider: (config: MealPhotoAnalysisServerConfig) => MealPhotoAnalysisProvider;
  generateCandidateId: () => string;
};

export function createDefaultDependencies(): HandlerDependencies {
  return {
    loadServerConfig,
    authenticateCaller,
    downloadAndValidateImage,
    createAdminClient,
    createProvider: (config) => {
      if (config.provider === "openai" && config.openaiApiKey && config.openaiModel) {
        return new OpenAiMealPhotoAnalysisProvider({
          apiKey: config.openaiApiKey,
          model: config.openaiModel,
          timeoutMs: config.openaiTimeoutMs
        });
      }
      return new DisabledMealPhotoAnalysisProvider();
    },
    generateCandidateId: () => crypto.randomUUID()
  };
}

function rowToResponse(row: MealAnalysisRow): MealPhotoAnalysisResponseV1 | null {
  const candidate = {
    schemaVersion: MEAL_PHOTO_ANALYSIS_RESPONSE_SCHEMA_VERSION,
    providerCategory: PROVIDER_CATEGORY,
    analysisEngineVersion: row.model_version ?? "",
    promptVersion: row.prompt_version ?? "",
    analysisStatus: row.analysis_status,
    candidates: row.detected_items ?? [],
    requiresUserConfirmation: true,
    safeUserFacingErrorCode: null,
    safeUserFacingErrorMessage: null
  };
  const validated = validateMealPhotoAnalysisResponseV1(candidate);
  return validated.ok ? validated.value : null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export async function processMealPhotoAnalysisRequest(request: Request, deps: HandlerDependencies): Promise<Response> {
  if (request.method !== "POST") return buildErrorResponse("invalid_request");

  const configResult = deps.loadServerConfig();
  if (!configResult.ok) return buildErrorResponse("analysis_disabled");
  const config = configResult.value;

  const authResult = await deps.authenticateCaller(request, config.supabaseUrl, config.supabaseAnonKey);
  if (!authResult.ok) return buildErrorResponse("authentication_required");
  const { userId: actorUid, userScopedClient } = authResult.value;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return buildErrorResponse("invalid_request");
  }

  const requestValidation = validateMealPhotoAnalysisRequestV1(rawBody);
  if (!requestValidation.ok) return buildErrorResponse("invalid_request");
  const analysisRequest = requestValidation.value;

  const pathValidation = validateCanonicalImageObjectRef(actorUid, analysisRequest.analysisRequestId, analysisRequest.imageObjectRef);
  if (!pathValidation.ok) return buildErrorResponse("invalid_image_object_ref");

  const imageResult: ImageDownloadOutcome = await deps.downloadAndValidateImage(
    userScopedClient,
    pathValidation.value.path,
    pathValidation.value.extension
  );
  if (!imageResult.ok) return buildErrorResponse(imageResult.errorCode);

  const admin = deps.createAdminClient(config.supabaseUrl, config.adminPersistenceKey);
  const claim = await claimAnalysisRequest(admin, {
    actorUid,
    analysisRequestId: analysisRequest.analysisRequestId,
    imageObjectRef: pathValidation.value.path,
    imageSha256: imageResult.value.sha256,
    provider: config.provider,
    promptVersion: MEAL_PHOTO_ANALYSIS_PROMPT_VERSION,
    analysisContractVersion: MEAL_PHOTO_ANALYSIS_REQUEST_CONTRACT_VERSION
  });

  if (claim.kind === "conflict") return buildErrorResponse("analysis_conflict");
  if (claim.kind === "existing_processing") return buildErrorResponse("analysis_conflict");
  if (claim.kind === "persistence_failed") return buildErrorResponse("persistence_failed");
  if (claim.kind === "existing_completed") {
    const response = rowToResponse(claim.row);
    if (!response) return buildErrorResponse("internal_error");
    return jsonResponse(response);
  }

  // claim.kind === "claimed" from here on — a provider call is genuinely about to happen.
  const provider = deps.createProvider(config);
  const providerOutcome: MealPhotoAnalysisProviderOutcome = await provider.analyze({
    imageBytes: imageResult.value.bytes,
    mimeType: imageResult.value.mimeType,
    locale: analysisRequest.locale,
    mealSourceContext: analysisRequest.mealSourceContext,
    capturedAt: analysisRequest.capturedAt
  });

  if (!providerOutcome.ok) {
    await markAnalysisFailed(admin, claim.analysisId, actorUid, providerOutcome.errorCode);
    const failedResponse: MealPhotoAnalysisResponseV1 = {
      schemaVersion: MEAL_PHOTO_ANALYSIS_RESPONSE_SCHEMA_VERSION,
      providerCategory: PROVIDER_CATEGORY,
      analysisEngineVersion: "",
      promptVersion: MEAL_PHOTO_ANALYSIS_PROMPT_VERSION,
      analysisStatus: "failed",
      candidates: [],
      requiresUserConfirmation: true,
      safeUserFacingErrorCode: providerOutcome.errorCode,
      safeUserFacingErrorMessage: safeMessageFor(providerOutcome.errorCode)
    };
    return jsonResponse(failedResponse);
  }

  const topConfidence = providerOutcome.value.rawOutput.candidates.reduce((max, c) => Math.max(max, c.confidence), 0);
  const analysisStatus = topConfidence < LOW_CONFIDENCE_THRESHOLD ? ("low_confidence" as const) : ("completed" as const);

  const response = buildMealPhotoAnalysisResponseV1({
    providerCategory: PROVIDER_CATEGORY,
    analysisEngineVersion: providerOutcome.value.engineVersion,
    promptVersion: MEAL_PHOTO_ANALYSIS_PROMPT_VERSION,
    analysisStatus,
    rawOutput: providerOutcome.value.rawOutput,
    safeUserFacingErrorCode: null,
    safeUserFacingErrorMessage: null,
    generateCandidateId: deps.generateCandidateId
  });

  const topCandidate = response.candidates.reduce((best, current) => (current.confidence > (best?.confidence ?? -1) ? current : best), response.candidates[0]);

  const persisted = await markAnalysisCompleted(admin, {
    analysisId: claim.analysisId,
    actorUid,
    modelName: config.provider,
    modelVersion: providerOutcome.value.engineVersion,
    analysisStatus,
    detectedItems: response.candidates,
    estimatedNutrition: topCandidate.estimatedNutrition,
    confidenceScore: topCandidate.confidence
  });
  if (!persisted) return buildErrorResponse("persistence_failed");

  return jsonResponse(response);
}

function safeMessageFor(code: MealPhotoAnalysisErrorCode): string {
  // Kept deliberately short/generic — see errors.ts's own table for the canonical safe messages;
  // duplicated minimally here since this branch returns a 200-shaped analysis response, not the
  // error envelope buildErrorResponse produces.
  switch (code) {
    case "provider_rate_limited":
      return "The analysis provider is temporarily rate-limited. Please try again shortly.";
    case "provider_timeout":
      return "The analysis provider did not respond in time.";
    case "provider_invalid_response":
      return "The analysis provider returned an invalid response.";
    default:
      return "The analysis provider is temporarily unavailable.";
  }
}

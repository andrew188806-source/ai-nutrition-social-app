// MI-E-C1: provider-neutral request/response contract for real (non-placeholder) meal-photo AI
// analysis. No provider call exists yet anywhere in this repository — this file only defines the
// shape a future server-side integration (a Supabase Edge Function) will accept and return.
//
// This is the canonical, shared location for this contract precisely because it must eventually
// be consumed by both the Mobile app and a future server-side Edge Function — a Mobile-only
// feature folder cannot serve that role. Nothing in this file imports or references any specific
// provider SDK, vendor name, or vendor model ID (see MealPhotoAnalysisProviderCategory below).

// ---- MealSourceContext: canonical source ----
//
// This is the single canonical definition of the frozen MI-E-B1 meal-source enum. Its values and
// meaning are frozen and MUST NOT change: apps/mobile/features/meal-identification/types.ts
// re-exports this exact type rather than defining a second copy, so every existing Mobile import
// path and every existing runtime value keeps working unchanged.
export type MealSourceContext =
  | "dine_in"
  | "takeout"
  | "delivery"
  | "self_cooked"
  | "unknown";

// ---- MealPhotoCaptureMethod: canonical source ----
//
// Single canonical definition, re-exported (not redefined) from
// apps/mobile/features/analysis/types.ts for the same reason as MealSourceContext above.
export type MealPhotoCaptureMethod = "camera" | "photo_library";

export const MEAL_PHOTO_ANALYSIS_REQUEST_CONTRACT_VERSION = "meal-photo-analysis-request-v1" as const;
export type MealPhotoAnalysisRequestContractVersion = typeof MEAL_PHOTO_ANALYSIS_REQUEST_CONTRACT_VERSION;

export const MEAL_PHOTO_ANALYSIS_RESPONSE_SCHEMA_VERSION = "meal-photo-analysis-response-v1" as const;
export type MealPhotoAnalysisResponseSchemaVersion = typeof MEAL_PHOTO_ANALYSIS_RESPONSE_SCHEMA_VERSION;

// Deliberately excluded from this request shape (see MEAL_PHOTO_ANALYSIS_FORBIDDEN_REQUEST_FIELDS
// below): a user ID, any training-eligibility/consent boolean, any restaurant-commercial-
// permission field, any client-chosen provider/model, and any public image URL. The authenticated
// actor is established server-side from the verified JWT; training eligibility is a
// server/offline-dataset-pipeline decision derived from consent records, not a per-request client
// assertion.
export type MealPhotoAnalysisRequestV1 = {
  contractVersion: MealPhotoAnalysisRequestContractVersion;
  analysisRequestId: string; // client-generated UUID; also the idempotency key
  imageObjectRef: string; // private Storage object path — see buildMealPhotoAnalysisObjectPath below; never a public URL
  captureMethod: MealPhotoCaptureMethod;
  capturedAt: string; // ISO instant, MI-E-B1/B4 convention
  mealSourceContext: MealSourceContext;
  locale: string;
};

// Fields that must never appear on a client-supplied request. Enumerated so a guard can assert
// their absence mechanically instead of relying on someone remembering the rule by eye.
export const MEAL_PHOTO_ANALYSIS_FORBIDDEN_REQUEST_FIELDS = [
  "userId",
  "trainingEligible",
  "trainingConsent",
  "allowTraining",
  "canTrain",
  "restaurantCommercialPermission",
  "providerModel",
  "imageUrl",
  "publicImageUrl"
] as const;

// Provider-neutral. Deliberately contains no vendor name (not "openai") — a specific vendor must
// never become a Mobile branch/control-flow value. "external_multimodal" covers any third-party
// hosted multimodal provider (OpenAI or otherwise); "tastkind_model" covers TastKind's own
// continually-trained model; "hybrid" covers a routed combination of the two.
export type MealPhotoAnalysisProviderCategory = "external_multimodal" | "tastkind_model" | "hybrid";

export type MealPhotoAnalysisStatus = "completed" | "low_confidence" | "failed" | "unavailable";

export type MealPhotoAnalysisCandidateComponent = {
  name: string;
  estimatedPortion: string;
};

export type MealPhotoAnalysisEstimatedNutrition = {
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
};

// AI visual observation only. This is never a verified dish identity, never a verified restaurant
// menu item, and never verified nutrition — see the MI-E-C1 report's "Contract separation"
// section for the full four-stage split (observation / catalog resolution / nutrition
// calculation / confirmed result), none of which this file collapses into the others.
export type MealPhotoAnalysisCandidate = {
  candidateId: string;
  observedName: string;
  components: MealPhotoAnalysisCandidateComponent[];
  estimatedNutrition: MealPhotoAnalysisEstimatedNutrition;
  confidence: number; // 0-1, matches meal_analyses.confidence_score's existing check constraint
  uncertaintyReasonCodes: string[];
};

export type MealPhotoAnalysisResponseV1 = {
  schemaVersion: MealPhotoAnalysisResponseSchemaVersion;
  providerCategory: MealPhotoAnalysisProviderCategory;
  // Opaque diagnostic label only — e.g. "engine-2026-07-a". Mobile must never branch UI, logic, or
  // fallback behavior on this value. It carries no vendor name, no vendor model ID, and no
  // provider-specific meaning to Mobile. The exact provider/model identity is recorded only in
  // meal_analyses' existing server-side audit columns (model_name/model_version), never in this
  // Mobile-facing contract.
  analysisEngineVersion: string;
  promptVersion: string;
  analysisStatus: MealPhotoAnalysisStatus;
  candidates: MealPhotoAnalysisCandidate[]; // 1-3 candidates
  requiresUserConfirmation: true; // always true in v1 — there is no auto-accept path
  safeUserFacingErrorCode: string | null;
  safeUserFacingErrorMessage: string | null;
  // Latency, token counts, and cost are computed and logged server-side only. This contract has no
  // field for them, and none may be added without removing this comment and re-justifying it —
  // they must never reach Mobile.
};

// Three independent purposes a photo (or data derived from it) can serve. A grant of one never
// implies a grant of another. This is a purpose label, not a lifecycle/storage state — see
// buildMealPhotoAnalysisObjectPath and the staging-retention design in the MI-E-C1 report for why
// lifecycle state was deliberately kept out of this enum and out of the meal_analyses migration.
// Restaurant commercial licensing itself is out of scope this round; this label is the only
// surface this round introduces for it, so future work has a place to hang a real grant record
// without colliding with diary/training semantics.
export type MealPhotoAssetPurpose = "diary_storage" | "ai_training_and_improvement" | "restaurant_commercial_use";

// ---- Storage object path contract ----
//
// Canonical shape: {auth.uid()}/{analysisRequestId}/original.{extension}
//   - segment 1 MUST be the authenticated caller's auth.uid() (enforced by the Storage RLS
//     policies in the companion migration; a client can never override this by supplying a
//     different value, since the policy compares against the server-verified JWT, not the path
//     itself)
//   - segment 2 MUST be present and non-empty (the analysisRequestId) — enforced in SQL by the
//     companion Storage migration's INSERT/SELECT/DELETE policies as of MI-E-C1-R2
//   - analysisRequestId MUST be a well-formed UUID (matching MealPhotoAnalysisRequestV1's own
//     analysisRequestId field); this is NOT enforced at the PostgreSQL policy layer (a regex cast
//     in an RLS policy is fragile and easy to get subtly wrong) — it MUST be enforced as a
//     required request-validation step in the future Edge Function once one exists
//   - the filename MUST be the canonical, immutable "original.{extension}" shown below — never a
//     client-chosen or user-editable filename
//   - the object is immutable once written; a re-analysis gets a new analysisRequestId and
//     therefore a new path, never an overwrite (no UPDATE policy exists on this bucket)
//   - the extension MUST be one of the bucket's allowed_mime_types (enforced by the bucket
//     configuration, not by this path string)
//
// Trust boundary: this helper only builds a syntactically-correct path from already-known-good
// inputs — it performs no validation and grants no access by itself. The imageObjectRef a Mobile
// client sends in a MealPhotoAnalysisRequestV1 must NEVER be trusted by the server as-is: the
// future Edge Function MUST re-derive/re-check the path against the caller's own
// server-verified auth.uid() (not the client-supplied one) before doing anything with it. No
// Edge Function is created this round.
export function buildMealPhotoAnalysisObjectPath(
  authenticatedUserId: string,
  analysisRequestId: string,
  extension: "jpg" | "jpeg" | "png" | "heic" | "webp"
): string {
  return `${authenticatedUserId}/${analysisRequestId}/original.${extension}`;
}

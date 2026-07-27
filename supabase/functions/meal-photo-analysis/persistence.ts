import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { MealPhotoAnalysisCandidate, MealPhotoAnalysisEstimatedNutrition, MealPhotoAnalysisStatus } from "../_shared/meal-photo-analysis/index.ts";

// MI-E-C4 §6.2/§11: this file is the ONLY place that uses the admin/persistence client, and only
// ever for meal_analyses persistence — never to read Storage on the caller's behalf (see
// auth.ts/imageValidation.ts, which always use the user-scoped client so Storage RLS keeps
// enforcing ownership). Even though this client bypasses RLS, every query here still filters by
// user_id explicitly, so a bug here can never silently cross an ownership boundary by omission.
//
// MI-E-C4-R2: this client is built from the dedicated MEAL_PHOTO_ANALYSIS_ADMIN_KEY secret (a
// scoped sb_secret_... key), never the legacy SUPABASE_SERVICE_ROLE_KEY JWT — see config.ts.
export function createAdminClient(supabaseUrl: string, adminKey: string): SupabaseClient {
  return createClient(supabaseUrl, adminKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type MealAnalysisRow = {
  id: string;
  user_id: string;
  analysis_request_id: string;
  image_object_ref: string;
  image_sha256: string | null;
  analysis_status: string;
  provider: string | null;
  model_name: string | null;
  model_version: string | null;
  prompt_version: string | null;
  analysis_contract_version: string | null;
  estimated_nutrition: MealPhotoAnalysisEstimatedNutrition | null;
  detected_items: MealPhotoAnalysisCandidate[] | null;
  confidence_score: number | null;
  error_code: string | null;
  analyzed_at: string | null;
};

export type ClaimInput = {
  actorUid: string;
  analysisRequestId: string;
  imageObjectRef: string;
  imageSha256: string;
  provider: string;
  promptVersion: string;
  analysisContractVersion: string;
};

export type ClaimOutcome =
  | { kind: "claimed"; analysisId: string }
  | { kind: "existing_completed"; row: MealAnalysisRow }
  | { kind: "existing_processing" }
  | { kind: "conflict" }
  | { kind: "persistence_failed" };

// MI-E-C4 §11.3 claim-before-call. The partial unique index on analysis_request_id
// (meal_analyses_analysis_request_id_key, added in MI-E-C1) is what actually makes this
// concurrency-safe — a concurrent duplicate INSERT gets a real Postgres unique_violation, not a
// race this function has to detect itself. This function never calls the provider; it only ever
// decides whether the caller should call it (kind:"claimed"), or should use an already-known
// outcome instead (existing_completed/existing_processing/conflict).
export async function claimAnalysisRequest(admin: SupabaseClient, input: ClaimInput): Promise<ClaimOutcome> {
  const insertResult = await admin
    .from("meal_analyses")
    .insert({
      user_id: input.actorUid,
      meal_record_id: null,
      source_photo_ids: [],
      model_name: null,
      model_version: null,
      estimated_nutrition: null,
      detected_items: [],
      confidence_score: null,
      analysis_status: "processing",
      analyzed_at: null,
      provider: input.provider,
      prompt_version: input.promptVersion,
      analysis_contract_version: input.analysisContractVersion,
      analysis_request_id: input.analysisRequestId,
      image_object_ref: input.imageObjectRef,
      image_sha256: input.imageSha256,
      error_code: null
    })
    .select("id")
    .single();

  if (!insertResult.error && insertResult.data) {
    return { kind: "claimed", analysisId: insertResult.data.id as string };
  }

  // 23505 = unique_violation. Anything else here is a genuine persistence failure, not a
  // legitimate idempotency conflict.
  if (insertResult.error?.code !== "23505") {
    return { kind: "persistence_failed" };
  }

  const existingResult = await admin
    .from("meal_analyses")
    .select(
      "id, user_id, analysis_request_id, image_object_ref, image_sha256, analysis_status, provider, model_name, model_version, prompt_version, analysis_contract_version, estimated_nutrition, detected_items, confidence_score, error_code, analyzed_at"
    )
    .eq("analysis_request_id", input.analysisRequestId)
    .maybeSingle();

  if (existingResult.error || !existingResult.data) return { kind: "persistence_failed" };
  const row = existingResult.data as MealAnalysisRow;

  // Same request ID but a different actor, a different object ref, or a different image hash:
  // fail closed rather than ever revealing or reusing another request's result (MI-E-C4 §11.3
  // rule 6). This deliberately does not distinguish "wrong actor" from "wrong object/hash" in its
  // return value — both map to the same analysis_conflict code, so no information about the
  // conflicting row ever leaks to the caller.
  if (row.user_id !== input.actorUid || row.image_object_ref !== input.imageObjectRef || row.image_sha256 !== input.imageSha256) {
    return { kind: "conflict" };
  }

  if (row.analysis_status === "processing") return { kind: "existing_processing" };

  if (row.analysis_status === "failed") {
    // Bounded retry: only ever the SAME row/request ID is reused — never a new analysis_request_id
    // and never a second meal_analyses row. There is no separate attempt-count ceiling (no schema
    // change was justified for one during this round's audit — see MI-E-C4 report §3); "bounded"
    // here means bounded to this one claimed row, not bounded by a numeric attempt cap.
    const retryResult = await admin
      .from("meal_analyses")
      .update({ analysis_status: "processing", error_code: null })
      .eq("id", row.id)
      .eq("analysis_request_id", input.analysisRequestId)
      .select("id")
      .single();
    if (retryResult.error || !retryResult.data) return { kind: "persistence_failed" };
    return { kind: "claimed", analysisId: retryResult.data.id as string };
  }

  return { kind: "existing_completed", row };
}

export type CompletionInput = {
  analysisId: string;
  actorUid: string;
  modelName: string;
  modelVersion: string;
  analysisStatus: Extract<MealPhotoAnalysisStatus, "completed" | "low_confidence">;
  detectedItems: MealPhotoAnalysisCandidate[];
  estimatedNutrition: MealPhotoAnalysisEstimatedNutrition;
  confidenceScore: number;
};

export async function markAnalysisCompleted(admin: SupabaseClient, input: CompletionInput): Promise<boolean> {
  const result = await admin
    .from("meal_analyses")
    .update({
      model_name: input.modelName,
      model_version: input.modelVersion,
      analysis_status: input.analysisStatus,
      detected_items: input.detectedItems,
      estimated_nutrition: input.estimatedNutrition,
      confidence_score: input.confidenceScore,
      analyzed_at: new Date().toISOString(),
      error_code: null
    })
    .eq("id", input.analysisId)
    .eq("user_id", input.actorUid);
  return !result.error;
}

export async function markAnalysisFailed(admin: SupabaseClient, analysisId: string, actorUid: string, errorCode: string): Promise<boolean> {
  const result = await admin
    .from("meal_analyses")
    .update({ analysis_status: "failed", error_code: errorCode })
    .eq("id", analysisId)
    .eq("user_id", actorUid);
  return !result.error;
}

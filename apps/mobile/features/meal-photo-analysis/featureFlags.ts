import type { ConsumerAuthSourceLike, MealPhotoUploadSource } from "../meal-photo-upload/featureFlags";

export type MealPhotoAnalysisSource = "disabled" | "mock" | "supabase-live";

export type MealPhotoAnalysisRuntimeFlags = {
  analysisSource: MealPhotoAnalysisSource;
  issues: string[];
};

type RuntimeEnv = Record<string, string | undefined>;
declare const process: { env: RuntimeEnv };

function readEnv(): RuntimeEnv {
  return {
    EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_PHOTO_ANALYSIS_SOURCE: process.env.EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_PHOTO_ANALYSIS_SOURCE,
    EXPO_PUBLIC_TASTKIND_ENVIRONMENT: process.env.EXPO_PUBLIC_TASTKIND_ENVIRONMENT,
    TASTKIND_ENVIRONMENT: typeof process === "undefined" ? undefined : process.env.TASTKIND_ENVIRONMENT
  };
}

const analysisSources = new Set<MealPhotoAnalysisSource>(["disabled", "mock", "supabase-live"]);

function parseAnalysisSource(value: string | undefined, issues: string[]): MealPhotoAnalysisSource {
  if (!value) return "disabled";
  if (analysisSources.has(value as MealPhotoAnalysisSource)) return value as MealPhotoAnalysisSource;
  issues.push(`Unknown EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_PHOTO_ANALYSIS_SOURCE: ${value}`);
  return "disabled";
}

// Mirrors meal-photo-upload/featureFlags.ts's getMealPhotoUploadRuntimeFlags exactly (same gate
// shape, same "development-only for now" rule) plus one additional requirement specific to
// analysis: the private photo must already have a live Storage upload path available
// (uploadSource === "supabase-live") — meal-photo-analysis invocation is never reachable on its
// own without a real, already-uploaded private object to reference. A live analysis source never
// becomes active just because the Edge Function happens to exist or be reachable.
export function getMealPhotoAnalysisRuntimeFlags(
  authSource: ConsumerAuthSourceLike,
  supabaseAuthEnabled: boolean,
  supabaseWritesEnabled: boolean,
  uploadSource: MealPhotoUploadSource,
  env: RuntimeEnv = readEnv()
): MealPhotoAnalysisRuntimeFlags {
  const issues: string[] = [];
  const analysisSource = parseAnalysisSource(env.EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_PHOTO_ANALYSIS_SOURCE, issues);
  const runtimeEnvironment = env.EXPO_PUBLIC_TASTKIND_ENVIRONMENT ?? env.TASTKIND_ENVIRONMENT ?? "development";

  if (analysisSource === "supabase-live" && authSource !== "supabase-live") {
    issues.push("Supabase live meal photo analysis requires EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE=supabase-live.");
  }
  if (analysisSource === "supabase-live" && !supabaseAuthEnabled) {
    issues.push("Supabase live meal photo analysis requires EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED=true.");
  }
  if (analysisSource === "supabase-live" && !supabaseWritesEnabled) {
    issues.push("Supabase live meal photo analysis requires EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED=true.");
  }
  if (analysisSource === "supabase-live" && uploadSource !== "supabase-live") {
    issues.push("Supabase live meal photo analysis requires the meal photo upload source to also be supabase-live.");
  }
  if (analysisSource === "supabase-live" && runtimeEnvironment !== "development") {
    issues.push("Supabase live meal photo analysis is development-only in Consumer Runtime MI-E-C5-A.");
  }

  return { analysisSource, issues };
}

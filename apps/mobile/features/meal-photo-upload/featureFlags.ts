export type MealPhotoUploadSource = "disabled" | "mock" | "supabase-live";

export type MealPhotoUploadRuntimeFlags = {
  uploadSource: MealPhotoUploadSource;
  issues: string[];
};

type RuntimeEnv = Record<string, string | undefined>;
declare const process: { env: RuntimeEnv };

function readEnv(): RuntimeEnv {
  return {
    EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_PHOTO_UPLOAD_SOURCE: process.env.EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_PHOTO_UPLOAD_SOURCE,
    EXPO_PUBLIC_TASTKIND_ENVIRONMENT: process.env.EXPO_PUBLIC_TASTKIND_ENVIRONMENT,
    TASTKIND_ENVIRONMENT: typeof process === "undefined" ? undefined : process.env.TASTKIND_ENVIRONMENT
  };
}

const uploadSources = new Set<MealPhotoUploadSource>(["disabled", "mock", "supabase-live"]);

function parseUploadSource(value: string | undefined, issues: string[]): MealPhotoUploadSource {
  if (!value) return "disabled";
  if (uploadSources.has(value as MealPhotoUploadSource)) return value as MealPhotoUploadSource;
  issues.push(`Unknown EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_PHOTO_UPLOAD_SOURCE: ${value}`);
  return "disabled";
}

export type ConsumerAuthSourceLike = "mock" | "supabase-disabled" | "supabase-live";

// Mirrors the gating convention used by every other Supabase-live write source in this repo
// (e.g. consumer-meals' mealRecordWritesEnabled / dailyNutritionWriteSource): a live upload
// source additionally requires live Auth, Auth enabled, global Supabase writes enabled, and
// (for now) a development-only environment — never silently active just because the Supabase
// client happens to be configured.
export function getMealPhotoUploadRuntimeFlags(
  authSource: ConsumerAuthSourceLike,
  supabaseAuthEnabled: boolean,
  supabaseWritesEnabled: boolean,
  env: RuntimeEnv = readEnv()
): MealPhotoUploadRuntimeFlags {
  const issues: string[] = [];
  const uploadSource = parseUploadSource(env.EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_PHOTO_UPLOAD_SOURCE, issues);
  const runtimeEnvironment = env.EXPO_PUBLIC_TASTKIND_ENVIRONMENT ?? env.TASTKIND_ENVIRONMENT ?? "development";

  if (uploadSource === "supabase-live" && authSource !== "supabase-live") {
    issues.push("Supabase live meal photo upload requires EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE=supabase-live.");
  }
  if (uploadSource === "supabase-live" && !supabaseAuthEnabled) {
    issues.push("Supabase live meal photo upload requires EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED=true.");
  }
  if (uploadSource === "supabase-live" && !supabaseWritesEnabled) {
    issues.push("Supabase live meal photo upload requires EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED=true.");
  }
  if (uploadSource === "supabase-live" && runtimeEnvironment !== "development") {
    issues.push("Supabase live meal photo upload is development-only in Consumer Runtime MI-E-C3.");
  }

  return { uploadSource, issues };
}

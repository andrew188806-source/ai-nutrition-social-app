import type { ConsumerDailyNutritionSource, ConsumerDailyNutritionWriteSource, ConsumerMealRecordsSource, ConsumerMealRuntimeFlags } from "./types";

const authSources = new Set<ConsumerMealRuntimeFlags["authSource"]>(["mock", "supabase-disabled", "supabase-live"]);
const mealSources = new Set<ConsumerMealRecordsSource>(["mock", "supabase-disabled", "supabase-live"]);
const dailyNutritionSources = new Set<ConsumerDailyNutritionSource>(["mock", "supabase-disabled", "supabase-live"]);
const dailyNutritionWriteSources = new Set<ConsumerDailyNutritionWriteSource>(["disabled", "mock", "supabase_prepared"]);

type RuntimeEnv = Record<string, string | undefined>;

function readEnv(): RuntimeEnv {
  const maybeProcess = globalThis as typeof globalThis & { process?: { env?: RuntimeEnv } };
  return maybeProcess.process?.env ?? {};
}

function parseAuthSource(value: string | undefined, issues: string[]): ConsumerMealRuntimeFlags["authSource"] {
  if (!value) return "mock";
  if (authSources.has(value as ConsumerMealRuntimeFlags["authSource"])) return value as ConsumerMealRuntimeFlags["authSource"];
  issues.push(`Unknown EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: ${value}`);
  return "supabase-disabled";
}

function parseMealSource(value: string | undefined, issues: string[]): ConsumerMealRecordsSource {
  if (!value) return "mock";
  if (mealSources.has(value as ConsumerMealRecordsSource)) return value as ConsumerMealRecordsSource;
  issues.push(`Unknown EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORDS_SOURCE: ${value}`);
  return "supabase-disabled";
}

function parseDailyNutritionSource(value: string | undefined, issues: string[]): ConsumerDailyNutritionSource {
  if (!value) return "mock";
  if (dailyNutritionSources.has(value as ConsumerDailyNutritionSource)) return value as ConsumerDailyNutritionSource;
  issues.push(`Unknown EXPO_PUBLIC_TASTKIND_CONSUMER_DAILY_NUTRITION_SOURCE: ${value}`);
  return "supabase-disabled";
}

function parseDailyNutritionWriteSource(value: string | undefined, issues: string[]): ConsumerDailyNutritionWriteSource {
  if (!value) return "disabled";
  if (dailyNutritionWriteSources.has(value as ConsumerDailyNutritionWriteSource)) return value as ConsumerDailyNutritionWriteSource;
  issues.push(`Unknown EXPO_PUBLIC_TASTKIND_CONSUMER_DAILY_NUTRITION_WRITE_SOURCE: ${value}`);
  return "disabled";
}

function parseBooleanFlag(name: string, value: string | undefined, issues: string[]): boolean {
  if (!value) return false;
  if (value === "true") return true;
  if (value === "false") return false;
  issues.push(`Unknown ${name}: ${value}`);
  return false;
}

export function getConsumerMealRuntimeFlags(env: RuntimeEnv = readEnv()): ConsumerMealRuntimeFlags {
  const issues: string[] = [];
  const authSource = parseAuthSource(env.EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE, issues);
  const mealRecordsSource = parseMealSource(
    env.EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORDS_SOURCE ?? env.EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_SOURCE,
    issues
  );
  const dailyNutritionSource = parseDailyNutritionSource(env.EXPO_PUBLIC_TASTKIND_CONSUMER_DAILY_NUTRITION_SOURCE, issues);
  const dailyNutritionWriteSource = parseDailyNutritionWriteSource(env.EXPO_PUBLIC_TASTKIND_CONSUMER_DAILY_NUTRITION_WRITE_SOURCE, issues);
  const supabaseAuthEnabled = parseBooleanFlag("EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED", env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED, issues);
  const supabaseWritesEnabled = parseBooleanFlag(
    "EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED",
    env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED ?? env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES,
    issues
  );
  const mealRecordWritesEnabled = parseBooleanFlag(
    "EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_WRITES_ENABLED",
    env.EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_WRITES_ENABLED,
    issues
  );
  const mealRecordLiveWriteOptIn = parseBooleanFlag(
    "EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_LIVE_WRITE_OPT_IN",
    env.EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_LIVE_WRITE_OPT_IN,
    issues
  );
  const dailyNutritionLiveReadOptIn = parseBooleanFlag(
    "EXPO_PUBLIC_TASTKIND_CONSUMER_DAILY_NUTRITION_LIVE_READ_OPT_IN",
    env.EXPO_PUBLIC_TASTKIND_CONSUMER_DAILY_NUTRITION_LIVE_READ_OPT_IN,
    issues
  );
  const runtimeEnvironment = env.EXPO_PUBLIC_TASTKIND_ENVIRONMENT ?? env.TASTKIND_ENVIRONMENT ?? "development";

  if (authSource === "supabase-live" && !supabaseAuthEnabled) {
    issues.push("Supabase live auth source requires EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED=true.");
  }
  if (authSource !== "supabase-live" && supabaseAuthEnabled) {
    issues.push("Consumer Supabase Auth can only be enabled when EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE=supabase-live.");
  }
  if (mealRecordsSource === "supabase-live" && authSource !== "supabase-live") {
    issues.push("Supabase live meal reads require EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE=supabase-live.");
  }
  if (mealRecordsSource === "supabase-live" && !supabaseAuthEnabled) {
    issues.push("Supabase live meal reads require EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED=true.");
  }
  if (dailyNutritionSource === "supabase-live" && authSource !== "supabase-live") {
    issues.push("Supabase live daily nutrition summary reads require EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE=supabase-live.");
  }
  if (dailyNutritionSource === "supabase-live" && !supabaseAuthEnabled) {
    issues.push("Supabase live daily nutrition summary reads require EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED=true.");
  }
  if (dailyNutritionSource === "supabase-live" && !dailyNutritionLiveReadOptIn) {
    issues.push("Supabase live daily nutrition summary reads require EXPO_PUBLIC_TASTKIND_CONSUMER_DAILY_NUTRITION_LIVE_READ_OPT_IN=true in Consumer Runtime Phase 2F.");
  }
  if (dailyNutritionSource !== "supabase-live" && dailyNutritionLiveReadOptIn) {
    issues.push("Consumer daily nutrition summary live read opt-in requires EXPO_PUBLIC_TASTKIND_CONSUMER_DAILY_NUTRITION_SOURCE=supabase-live.");
  }
  if (dailyNutritionWriteSource === "supabase_prepared" && supabaseWritesEnabled) {
    issues.push("Consumer daily nutrition summary prepared persistence must not enable live writes in Consumer Runtime Phase 2J.");
  }
  if (dailyNutritionWriteSource === "supabase_prepared" && runtimeEnvironment !== "development") {
    issues.push("Consumer daily nutrition summary prepared persistence is development-only until Consumer Runtime Phase 2K.");
  }
  if (dailyNutritionSource === "supabase-live" && supabaseWritesEnabled) {
    issues.push("Supabase live daily nutrition summary reads require Consumer Supabase writes to remain disabled.");
  }
  if (dailyNutritionSource === "supabase-live" && mealRecordWritesEnabled) {
    issues.push("Supabase live daily nutrition summary reads require Consumer meal record writes to remain disabled.");
  }
  if (dailyNutritionSource === "supabase-live" && runtimeEnvironment !== "development") {
    issues.push("Supabase live daily nutrition summary reads are development-only in Consumer Runtime Phase 2F.");
  }
  if (mealRecordWritesEnabled && !supabaseWritesEnabled) {
    issues.push("Consumer meal record writes require EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED=true.");
  }
  if (supabaseWritesEnabled && !mealRecordWritesEnabled) {
    issues.push("Consumer Supabase writes require EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_WRITES_ENABLED=true for meal write preparation.");
  }
  if (mealRecordLiveWriteOptIn && (!supabaseWritesEnabled || !mealRecordWritesEnabled)) {
    issues.push("Consumer meal record live write opt-in requires global writes and meal record writes to be enabled.");
  }
  if (supabaseWritesEnabled && mealRecordsSource === "supabase-live" && !mealRecordLiveWriteOptIn) {
    issues.push("Supabase live meal writes require EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_LIVE_WRITE_OPT_IN=true in Consumer Runtime Phase 2D.");
  }
  if (supabaseWritesEnabled && mealRecordsSource === "supabase-live" && runtimeEnvironment !== "development") {
    issues.push("Supabase live meal writes are development-only in Consumer Runtime Phase 2D.");
  }

  return {
    authSource,
    mealRecordsSource,
    dailyNutritionSource,
    supabaseAuthEnabled,
    supabaseWritesEnabled,
    mealRecordWritesEnabled,
    mealRecordLiveWriteOptIn,
    dailyNutritionLiveReadOptIn,
    dailyNutritionWriteSource,
    issues
  };
}

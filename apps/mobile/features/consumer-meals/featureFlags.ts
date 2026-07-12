import type { ConsumerMealRecordsSource, ConsumerMealRuntimeFlags } from "./types";

const authSources = new Set<ConsumerMealRuntimeFlags["authSource"]>(["mock", "supabase-disabled", "supabase-live"]);
const mealSources = new Set<ConsumerMealRecordsSource>(["mock", "supabase-disabled", "supabase-live"]);

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
  const supabaseAuthEnabled = parseBooleanFlag("EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED", env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED, issues);
  const supabaseWritesEnabled = parseBooleanFlag(
    "EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED",
    env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED ?? env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES,
    issues
  );

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
  if (supabaseWritesEnabled) {
    issues.push("Consumer Supabase writes are not enabled in Consumer Runtime Phase 2A.");
  }

  return { authSource, mealRecordsSource, supabaseAuthEnabled, supabaseWritesEnabled, issues };
}

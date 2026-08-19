import type { ConsumerAuthSourceLike } from "../meal-photo-upload/featureFlags";

// Mirrors getSocialCandidateRuntimeFlags exactly. There is deliberately NO "mock" source: the frozen
// SR-2G-E contract forbids demo candidates from ever supplying the real Meal Buddy list, so a mock
// value is not representable here rather than merely discouraged. An unset or unknown source is
// `disabled`, which fails closed with a typed error instead of an empty list.
export type MealBuddyCandidateSource = "disabled" | "supabase-live";

export type MealBuddyCandidateRuntimeFlags = {
  candidateSource: MealBuddyCandidateSource;
  issues: string[];
};

type RuntimeEnv = Record<string, string | undefined>;

function readEnv(): RuntimeEnv {
  const maybeProcess = globalThis as typeof globalThis & { process?: { env?: RuntimeEnv } };
  return maybeProcess.process?.env ?? {};
}

const candidateSources = new Set<MealBuddyCandidateSource>(["disabled", "supabase-live"]);

function parseCandidateSource(value: string | undefined, issues: string[]): MealBuddyCandidateSource {
  if (!value) return "disabled";
  if (candidateSources.has(value as MealBuddyCandidateSource)) return value as MealBuddyCandidateSource;
  issues.push(`Unknown EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_BUDDY_CANDIDATE_SOURCE: ${value}`);
  return "disabled";
}

export function getMealBuddyCandidateRuntimeFlags(
  authSource: ConsumerAuthSourceLike,
  supabaseAuthEnabled: boolean,
  env: RuntimeEnv = readEnv()
): MealBuddyCandidateRuntimeFlags {
  const issues: string[] = [];
  const candidateSource = parseCandidateSource(env.EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_BUDDY_CANDIDATE_SOURCE, issues);
  const runtimeEnvironment = env.EXPO_PUBLIC_TASTKIND_ENVIRONMENT ?? env.TASTKIND_ENVIRONMENT ?? "development";

  if (candidateSource === "supabase-live" && authSource !== "supabase-live") {
    issues.push("Supabase live Meal Buddy candidates require EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE=supabase-live.");
  }
  if (candidateSource === "supabase-live" && !supabaseAuthEnabled) {
    issues.push("Supabase live Meal Buddy candidates require EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED=true.");
  }
  if (candidateSource === "supabase-live" && runtimeEnvironment !== "development") {
    issues.push("Supabase live Meal Buddy candidates are development-only in SR-2G-E.");
  }

  return { candidateSource, issues };
}

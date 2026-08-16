import type { ConsumerAuthSourceLike } from "../meal-photo-upload/featureFlags";

export type SocialCandidateSource = "disabled" | "mock" | "supabase-live";

export type SocialCandidateRuntimeFlags = {
  candidateSource: SocialCandidateSource;
  issues: string[];
};

type RuntimeEnv = Record<string, string | undefined>;

function readEnv(): RuntimeEnv {
  const maybeProcess = globalThis as typeof globalThis & { process?: { env?: RuntimeEnv } };
  return maybeProcess.process?.env ?? {};
}

const candidateSources = new Set<SocialCandidateSource>(["disabled", "mock", "supabase-live"]);

function parseCandidateSource(value: string | undefined, issues: string[]): SocialCandidateSource {
  if (!value) return "disabled";
  if (candidateSources.has(value as SocialCandidateSource)) return value as SocialCandidateSource;
  issues.push(`Unknown EXPO_PUBLIC_TASTKIND_CONSUMER_SOCIAL_CANDIDATE_SOURCE: ${value}`);
  return "disabled";
}

// Mirrors getMealPhotoAnalysisRuntimeFlags: an unset or unknown source is `disabled`, and a live
// source additionally requires live Supabase auth in a development environment. SR-2E reads only —
// it never writes — so no write-enable gate applies here.
export function getSocialCandidateRuntimeFlags(
  authSource: ConsumerAuthSourceLike,
  supabaseAuthEnabled: boolean,
  env: RuntimeEnv = readEnv()
): SocialCandidateRuntimeFlags {
  const issues: string[] = [];
  const candidateSource = parseCandidateSource(env.EXPO_PUBLIC_TASTKIND_CONSUMER_SOCIAL_CANDIDATE_SOURCE, issues);
  const runtimeEnvironment = env.EXPO_PUBLIC_TASTKIND_ENVIRONMENT ?? env.TASTKIND_ENVIRONMENT ?? "development";

  if (candidateSource === "supabase-live" && authSource !== "supabase-live") {
    issues.push("Supabase live Social candidates require EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE=supabase-live.");
  }
  if (candidateSource === "supabase-live" && !supabaseAuthEnabled) {
    issues.push("Supabase live Social candidates require EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED=true.");
  }
  if (candidateSource === "supabase-live" && runtimeEnvironment !== "development") {
    issues.push("Supabase live Social candidates are development-only in SR-2E.");
  }

  return { candidateSource, issues };
}

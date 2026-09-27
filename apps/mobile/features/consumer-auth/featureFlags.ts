import type { ConsumerAuthSource, ConsumerProfileSource, ConsumerRuntimeFlags } from "./types";

const authSources = new Set<ConsumerAuthSource>(["mock", "supabase-disabled", "supabase-live"]);
const profileSources = new Set<ConsumerProfileSource>(["mock", "supabase-disabled", "supabase-live"]);

type RuntimeEnv = Record<string, string | undefined>;
declare const process: { env: RuntimeEnv };

// Literal members only, so the web export inlines every value (see consumer-runtime-config).
function readEnv(): RuntimeEnv {
  return {
    EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: process.env.EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE,
    EXPO_PUBLIC_TASTKIND_CONSUMER_PROFILE_SOURCE: process.env.EXPO_PUBLIC_TASTKIND_CONSUMER_PROFILE_SOURCE,
    EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED: process.env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED,
    EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED: process.env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED,
    EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES: process.env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES
  };
}

function parseAuthSource(value: string | undefined, issues: string[]): ConsumerAuthSource {
  if (!value) return "mock";
  if (authSources.has(value as ConsumerAuthSource)) return value as ConsumerAuthSource;
  issues.push(`Unknown EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: ${value}`);
  return "supabase-disabled";
}

function parseProfileSource(value: string | undefined, issues: string[], implicitMockAllowed: boolean): ConsumerProfileSource {
  // A live identity never silently reads a mock profile (GQA-6R C-1B).
  if (!value) return implicitMockAllowed ? "mock" : "supabase-disabled";
  if (profileSources.has(value as ConsumerProfileSource)) return value as ConsumerProfileSource;
  issues.push(`Unknown EXPO_PUBLIC_TASTKIND_CONSUMER_PROFILE_SOURCE: ${value}`);
  return "supabase-disabled";
}

function parseBooleanFlag(name: string, value: string | undefined, issues: string[]): boolean {
  if (!value) return false;
  if (value === "true") return true;
  if (value === "false") return false;
  issues.push(`Unknown ${name}: ${value}`);
  return false;
}

export function getConsumerRuntimeFlags(env: RuntimeEnv = readEnv()): ConsumerRuntimeFlags {
  const issues: string[] = [];
  const authSource = parseAuthSource(env.EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE, issues);
  // GQA-6R C-1B: a live identity (auth source supabase-live) never silently falls back to a mock profile.
  const implicitMockAllowed = env.EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE !== "supabase-live";
  const profileSource = parseProfileSource(env.EXPO_PUBLIC_TASTKIND_CONSUMER_PROFILE_SOURCE, issues, implicitMockAllowed);
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
  if (profileSource === "supabase-live" && authSource !== "supabase-live") {
    issues.push("Supabase live profile reads require EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE=supabase-live.");
  }
  if (profileSource === "supabase-live" && !supabaseAuthEnabled) {
    issues.push("Supabase live profile reads require EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED=true.");
  }
  if (supabaseWritesEnabled) {
    issues.push("Consumer Supabase writes are not enabled in Consumer Runtime Phase 1D.");
  }

  return { authSource, profileSource, supabaseAuthEnabled, supabaseWritesEnabled, issues };
}

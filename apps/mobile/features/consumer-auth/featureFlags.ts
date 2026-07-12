import type { ConsumerAuthSource, ConsumerProfileSource, ConsumerRuntimeFlags } from "./types";

const authSources = new Set<ConsumerAuthSource>(["mock", "supabase-disabled", "supabase-live"]);
const profileSources = new Set<ConsumerProfileSource>(["mock", "supabase-disabled", "supabase-live"]);

type RuntimeEnv = Record<string, string | undefined>;

function readEnv(): RuntimeEnv {
  const maybeProcess = globalThis as typeof globalThis & { process?: { env?: RuntimeEnv } };
  return maybeProcess.process?.env ?? {};
}

function parseAuthSource(value: string | undefined, issues: string[]): ConsumerAuthSource {
  if (!value) return "mock";
  if (authSources.has(value as ConsumerAuthSource)) return value as ConsumerAuthSource;
  issues.push(`Unknown EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: ${value}`);
  return "supabase-disabled";
}

function parseProfileSource(value: string | undefined, issues: string[]): ConsumerProfileSource {
  if (!value) return "mock";
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
  const profileSource = parseProfileSource(env.EXPO_PUBLIC_TASTKIND_CONSUMER_PROFILE_SOURCE, issues);
  const supabaseAuthEnabled = parseBooleanFlag("EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED", env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED, issues);
  const supabaseWritesEnabled = parseBooleanFlag(
    "EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED",
    env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED ?? env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES,
    issues
  );

  if (authSource === "supabase-live" && !supabaseAuthEnabled) {
    issues.push("Supabase live auth source requires EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED=true in Consumer Phase 1C.");
  }
  if (authSource !== "supabase-live" && supabaseAuthEnabled) {
    issues.push("Consumer Supabase Auth can only be enabled when EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE=supabase-live.");
  }
  if (profileSource === "supabase-live") {
    issues.push("Supabase live profile reads/writes are not enabled in Consumer Phase 1C.");
  }
  if (supabaseWritesEnabled) {
    issues.push("Consumer Supabase writes are not enabled in Consumer Phase 1C.");
  }

  return { authSource, profileSource, supabaseAuthEnabled, supabaseWritesEnabled, issues };
}

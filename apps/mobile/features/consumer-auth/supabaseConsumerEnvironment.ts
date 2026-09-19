import type { SupabaseConsumerEnvironment } from "./supabaseConsumerClientFactory";

type RuntimeEnv = Record<string, string | undefined>;
declare const process: { env: RuntimeEnv };

function readEnv(): RuntimeEnv {
  return {
    EXPO_PUBLIC_TASTKIND_ENVIRONMENT: process.env.EXPO_PUBLIC_TASTKIND_ENVIRONMENT,
    EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL: process.env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL,
    EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY,
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  };
}

// A Supabase project URL is an origin: https, no credentials, no path/query/fragment. Plain http is
// accepted only for a loopback host (a locally running Supabase stack). The value is returned exactly
// as configured; nothing here names a project. Pattern-based on purpose: the platform URL parser is
// unreliable in React Native without a polyfill and absent in some harness contexts.
const HTTPS_ORIGIN = /^https:\/\/[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::\d{1,5})?\/?$/;
const LOOPBACK_HTTP_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?\/?$/;

function acceptedProjectUrl(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  return HTTPS_ORIGIN.test(value) || LOOPBACK_HTTP_ORIGIN.test(value) ? value : null;
}

// The Supabase project (URL + publishable key) comes ONLY from configuration; no project identity is
// compiled into the app. Anything missing or malformed yields an empty environment, and the client
// factory then refuses to construct a client ("URL and publishable key are required") -- it never
// redirects or falls back to another project.
//
// EXPO_PUBLIC_TASTKIND_ENVIRONMENT is a separate, deliberate release gate (live Consumer runtime is
// still enabled only in an explicit "development" runtime; the per-feature flag modules apply the
// same stance). It selects a runtime MODE and does not identify a project.
export function getSupabaseConsumerEnvironment(env: RuntimeEnv = readEnv()): SupabaseConsumerEnvironment {
  const url = acceptedProjectUrl(env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL ?? env.EXPO_PUBLIC_SUPABASE_URL);
  const publishableKey = (env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY ?? env.EXPO_PUBLIC_SUPABASE_ANON_KEY)?.trim();
  if (env.EXPO_PUBLIC_TASTKIND_ENVIRONMENT !== "development" || !url || !publishableKey) return {};
  return { url, publishableKey };
}

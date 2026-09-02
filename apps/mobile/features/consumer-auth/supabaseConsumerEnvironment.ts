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

export function getSupabaseConsumerEnvironment(env: RuntimeEnv = readEnv()): SupabaseConsumerEnvironment {
  const url = env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL ?? env.EXPO_PUBLIC_SUPABASE_URL;
  const publishableKey = env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY ?? env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  // Explicit live requests fail before SDK construction; never redirect or fall back.
  // The project identity is public; the browser credential comes only from configuration.
  if (env.EXPO_PUBLIC_TASTKIND_ENVIRONMENT !== "development"
    || (url !== "https://msbgnnoorsoefuiwluye.supabase.co" && url !== "https://msbgnnoorsoefuiwluye.supabase.co/")
    || !publishableKey?.trim()) return {};
  return { url, publishableKey };
}

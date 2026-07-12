import type { SupabaseConsumerEnvironment } from "./supabaseConsumerClientFactory";

type RuntimeEnv = Record<string, string | undefined>;

function readEnv(): RuntimeEnv {
  const maybeProcess = globalThis as typeof globalThis & { process?: { env?: RuntimeEnv } };
  return maybeProcess.process?.env ?? {};
}

export function getSupabaseConsumerEnvironment(env: RuntimeEnv = readEnv()): SupabaseConsumerEnvironment {
  return {
    url: env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL ?? env.EXPO_PUBLIC_SUPABASE_URL,
    publishableKey: env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY ?? env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  };
}

export interface SupabaseConfig {
  url?: string;
  anonKey?: string;
}

export function hasSupabaseCredentials(config: SupabaseConfig): boolean {
  return Boolean(config.url && config.anonKey);
}

export function createSupabaseClientPlaceholder(config: SupabaseConfig) {
  if (!hasSupabaseCredentials(config)) {
    return {
      mode: "mock" as const,
      note: "Missing Supabase credentials. Phase 1 uses mock data."
    };
  }

  // TODO: Replace with createClient from @supabase/supabase-js in a future phase.
  return {
    mode: "configured_placeholder" as const,
    note: "Supabase credentials detected, but the real client is not wired in Phase 1."
  };
}

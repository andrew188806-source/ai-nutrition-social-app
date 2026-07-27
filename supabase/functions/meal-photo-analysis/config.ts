// MI-E-C4: server-only feature gate. Every value here comes from Deno.env (Supabase Function
// secrets/config) — never EXPO_PUBLIC_*, never a request body field, never a Repository-tracked
// value. Missing/invalid configuration fails closed (disabled), it never silently falls back to a
// default provider or model.
//
// MI-E-C4-R2: the admin/persistence client key comes ONLY from the dedicated
// MEAL_PHOTO_ANALYSIS_ADMIN_KEY secret (a scoped sb_secret_... key created for this Function),
// never from SUPABASE_SERVICE_ROLE_KEY (the legacy service-role JWT, which was accidentally
// printed to an operator terminal during MI-E-C4-R1 and must be treated as compromised — see the
// R2 report §5 for the full legacy-key consumer inventory). There is deliberately no fallback: if
// MEAL_PHOTO_ANALYSIS_ADMIN_KEY is absent, config load fails closed exactly like any other missing
// required secret — it never silently reaches for the legacy key instead.
export type MealPhotoAnalysisProviderName = "disabled" | "openai" | "mock";

export type MealPhotoAnalysisServerConfig = {
  enabled: boolean;
  provider: MealPhotoAnalysisProviderName;
  openaiApiKey: string | null;
  openaiModel: string | null;
  openaiTimeoutMs: number;
  supabaseUrl: string;
  supabaseAnonKey: string;
  adminPersistenceKey: string;
};

export type ConfigLoadOutcome =
  | { ok: true; value: MealPhotoAnalysisServerConfig }
  | { ok: false; reason: string };

const DEFAULT_TIMEOUT_MS = 30_000;

function readEnv(name: string): string | null {
  const value = Deno.env.get(name);
  return value && value.trim().length > 0 ? value.trim() : null;
}

// Loads and validates server config once per invocation. Deliberately does not cache across
// invocations at module scope beyond what the Deno runtime itself already keeps warm — env values
// are re-read every call so a secret rotation takes effect on the next request without a redeploy.
export function loadServerConfig(): ConfigLoadOutcome {
  const supabaseUrl = readEnv("SUPABASE_URL");
  const supabaseAnonKey = readEnv("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false, reason: "missing_supabase_runtime_config" };
  }

  // Dedicated admin/persistence secret — fails closed if absent, never falls back to the legacy
  // SUPABASE_SERVICE_ROLE_KEY (deliberately not read anywhere in this file or this Function).
  const adminPersistenceKey = readEnv("MEAL_PHOTO_ANALYSIS_ADMIN_KEY");
  if (!adminPersistenceKey) {
    return { ok: false, reason: "missing_admin_persistence_key" };
  }

  const enabledRaw = readEnv("MEAL_PHOTO_ANALYSIS_ENABLED");
  const enabled = enabledRaw === "true";
  if (!enabled) return { ok: false, reason: "analysis_disabled" };

  const providerRaw = readEnv("MEAL_PHOTO_ANALYSIS_PROVIDER");
  if (providerRaw !== "disabled" && providerRaw !== "openai" && providerRaw !== "mock") {
    return { ok: false, reason: "missing_or_invalid_provider" };
  }
  if (providerRaw === "disabled") return { ok: false, reason: "analysis_disabled" };

  const openaiApiKey = readEnv("OPENAI_API_KEY");
  const openaiModel = readEnv("OPENAI_MEAL_ANALYSIS_MODEL");
  if (providerRaw === "openai" && (!openaiApiKey || !openaiModel)) {
    return { ok: false, reason: "missing_openai_configuration" };
  }

  const timeoutRaw = readEnv("OPENAI_MEAL_ANALYSIS_TIMEOUT_MS");
  const parsedTimeout = timeoutRaw ? Number.parseInt(timeoutRaw, 10) : DEFAULT_TIMEOUT_MS;
  const openaiTimeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : DEFAULT_TIMEOUT_MS;

  return {
    ok: true,
    value: {
      enabled: true,
      provider: providerRaw,
      openaiApiKey,
      openaiModel,
      openaiTimeoutMs,
      supabaseUrl,
      supabaseAnonKey,
      adminPersistenceKey
    }
  };
}

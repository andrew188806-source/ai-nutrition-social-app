import "server-only";

export type AdminAuthConfig =
  | Readonly<{ state: "ready"; supabaseUrl: string; supabasePublishableKey: string; isProduction: boolean }>
  | Readonly<{ state: "unavailable"; isProduction: boolean }>;

export function getAdminAuthConfig(env: NodeJS.ProcessEnv = process.env): AdminAuthConfig {
  const isProduction = env.NODE_ENV === "production";
  const publishableKey = env.TASTKIND_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";

  try {
    const url = new URL(env.TASTKIND_SUPABASE_URL ?? "");
    if (
      url.protocol !== "https:"
      || url.username
      || url.password
      || url.search
      || url.hash
      || url.pathname !== "/"
      || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)
    ) {
      return { state: "unavailable", isProduction };
    }
    return {
      state: "ready",
      supabaseUrl: url.origin,
      supabasePublishableKey: publishableKey,
      isProduction
    };
  } catch {
    return { state: "unavailable", isProduction };
  }
}

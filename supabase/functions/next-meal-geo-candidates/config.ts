export type NextMealGeoConfigOutcome =
  | { ok: true; value: Readonly<{ supabaseUrl: string; supabaseAnonKey: string }> }
  | { ok: false };

export function loadNextMealGeoConfig(): NextMealGeoConfigOutcome {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim();
  return supabaseUrl && supabaseAnonKey
    ? { ok: true, value: Object.freeze({ supabaseUrl, supabaseAnonKey }) }
    : { ok: false };
}

export type MealBuddyPushDeviceConfig = Readonly<{
  supabaseUrl: string;
  supabaseAnonKey: string;
}>;
export type MealBuddyPushDeviceConfigOutcome =
  | { ok: true; value: MealBuddyPushDeviceConfig }
  | { ok: false; errorCode: "server_unavailable" };

function env(name: string): string | null {
  const value = Deno.env.get(name)?.trim();
  return value || null;
}

// Registration needs no ref key and no provider credential: it never mints an opaque reference and
// never talks to the provider. Only the dispatcher holds provider access.
export function loadMealBuddyPushDeviceConfig(): MealBuddyPushDeviceConfigOutcome {
  const supabaseUrl = env("SUPABASE_URL");
  const supabaseAnonKey = env("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) return { ok: false, errorCode: "server_unavailable" };
  return { ok: true, value: Object.freeze({ supabaseUrl, supabaseAnonKey }) };
}

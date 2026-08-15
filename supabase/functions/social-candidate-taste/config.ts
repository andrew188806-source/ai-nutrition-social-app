export type SocialCandidateTasteConfig = Readonly<{
  supabaseUrl: string;
  supabaseAnonKey: string;
}>;

export type SocialCandidateTasteConfigOutcome =
  | { ok: true; value: SocialCandidateTasteConfig }
  | { ok: false; errorCode: "server_unavailable" };

function readEnvironment(name: string): string | null {
  const value = Deno.env.get(name)?.trim();
  return value ? value : null;
}

export function loadSocialCandidateTasteConfig(): SocialCandidateTasteConfigOutcome {
  const supabaseUrl = readEnvironment("SUPABASE_URL");
  const supabaseAnonKey = readEnvironment("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) return { ok: false, errorCode: "server_unavailable" };
  return { ok: true, value: Object.freeze({ supabaseUrl, supabaseAnonKey }) };
}

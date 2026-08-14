export type SocialCandidateProvenanceConfig = Readonly<{
  supabaseUrl: string;
  supabaseAnonKey: string;
}>;

export type SocialCandidateProvenanceConfigOutcome =
  | { ok: true; value: SocialCandidateProvenanceConfig }
  | { ok: false; errorCode: "server_unavailable" };

function readEnvironment(name: string): string | null {
  const value = Deno.env.get(name)?.trim();
  return value ? value : null;
}

export function loadSocialCandidateProvenanceConfig(): SocialCandidateProvenanceConfigOutcome {
  const supabaseUrl = readEnvironment("SUPABASE_URL");
  const supabaseAnonKey = readEnvironment("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) return { ok: false, errorCode: "server_unavailable" };
  return { ok: true, value: Object.freeze({ supabaseUrl, supabaseAnonKey }) };
}

import {
  decodeSocialCandidateRefKey,
  SOCIAL_CANDIDATE_REF_KEY_ENV
} from "../_shared/social-candidate-ref/index.ts";

export type SocialCandidateListConfig = Readonly<{
  supabaseUrl: string;
  supabaseAnonKey: string;
  candidateRefKey: Uint8Array;
}>;

export type SocialCandidateListConfigOutcome =
  | { ok: true; value: SocialCandidateListConfig }
  | { ok: false; errorCode: "server_unavailable" };

function readEnvironment(name: string): string | null {
  const value = Deno.env.get(name)?.trim();
  return value ? value : null;
}

// Fails closed on an absent or malformed candidate-reference key. The key is a dedicated secret:
// it is never the anon key, the service role key, a JWT signing secret or the database password,
// and it is never logged, echoed or returned.
export function loadSocialCandidateListConfig(): SocialCandidateListConfigOutcome {
  const supabaseUrl = readEnvironment("SUPABASE_URL");
  const supabaseAnonKey = readEnvironment("SUPABASE_ANON_KEY");
  const encodedCandidateRefKey = readEnvironment(SOCIAL_CANDIDATE_REF_KEY_ENV);
  if (!supabaseUrl || !supabaseAnonKey || !encodedCandidateRefKey) {
    return { ok: false, errorCode: "server_unavailable" };
  }
  let candidateRefKey: Uint8Array;
  try {
    candidateRefKey = decodeSocialCandidateRefKey(encodedCandidateRefKey);
  } catch {
    return { ok: false, errorCode: "server_unavailable" };
  }
  return { ok: true, value: Object.freeze({ supabaseUrl, supabaseAnonKey, candidateRefKey }) };
}

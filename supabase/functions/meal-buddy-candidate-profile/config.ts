import {
  decodeSocialCandidateRefKey,
  SOCIAL_CANDIDATE_REF_KEY_ENV
} from "../_shared/social-candidate-ref/index.ts";

export type MealBuddyCandidateProfileConfig = Readonly<{
  supabaseUrl: string;
  supabaseAnonKey: string;
  candidateRefKey: Uint8Array;
}>;

export type MealBuddyCandidateProfileConfigOutcome =
  | { ok: true; value: MealBuddyCandidateProfileConfig }
  | { ok: false; errorCode: "server_unavailable" };

function readEnvironment(name: string): string | null {
  const value = Deno.env.get(name)?.trim();
  return value ? value : null;
}

export function loadMealBuddyCandidateProfileConfig(): MealBuddyCandidateProfileConfigOutcome {
  const supabaseUrl = readEnvironment("SUPABASE_URL");
  const supabaseAnonKey = readEnvironment("SUPABASE_ANON_KEY");
  const encodedCandidateRefKey = readEnvironment(SOCIAL_CANDIDATE_REF_KEY_ENV);
  if (!supabaseUrl || !supabaseAnonKey || !encodedCandidateRefKey) {
    return { ok: false, errorCode: "server_unavailable" };
  }
  try {
    return {
      ok: true,
      value: Object.freeze({
        supabaseUrl,
        supabaseAnonKey,
        candidateRefKey: decodeSocialCandidateRefKey(encodedCandidateRefKey)
      })
    };
  } catch {
    return { ok: false, errorCode: "server_unavailable" };
  }
}

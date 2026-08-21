import {
  decodeMealBuddyRelationshipRefKey,
  MEAL_BUDDY_RELATIONSHIP_REF_KEY_ENV
} from "../_shared/meal-buddy-relationship-ref/index.ts";
import { decodeSocialCandidateRefKey, SOCIAL_CANDIDATE_REF_KEY_ENV } from "../_shared/social-candidate-ref/index.ts";

export type MealBuddyRelationshipConfig = Readonly<{
  supabaseUrl: string;
  supabaseAnonKey: string;
  candidateRefKey: Uint8Array;
  relationshipRefKey: Uint8Array;
}>;
export type MealBuddyRelationshipConfigOutcome =
  | { ok: true; value: MealBuddyRelationshipConfig }
  | { ok: false; errorCode: "server_unavailable" };

function env(name: string): string | null {
  const value = Deno.env.get(name)?.trim();
  return value || null;
}
export function loadMealBuddyRelationshipConfig(): MealBuddyRelationshipConfigOutcome {
  const supabaseUrl = env("SUPABASE_URL");
  const supabaseAnonKey = env("SUPABASE_ANON_KEY");
  const candidate = env(SOCIAL_CANDIDATE_REF_KEY_ENV);
  const relationship = env(MEAL_BUDDY_RELATIONSHIP_REF_KEY_ENV);
  if (!supabaseUrl || !supabaseAnonKey || !candidate || !relationship) {
    return { ok: false, errorCode: "server_unavailable" };
  }
  try {
    return {
      ok: true,
      value: Object.freeze({
        supabaseUrl,
        supabaseAnonKey,
        candidateRefKey: decodeSocialCandidateRefKey(candidate),
        relationshipRefKey: decodeMealBuddyRelationshipRefKey(relationship)
      })
    };
  } catch {
    return { ok: false, errorCode: "server_unavailable" };
  }
}

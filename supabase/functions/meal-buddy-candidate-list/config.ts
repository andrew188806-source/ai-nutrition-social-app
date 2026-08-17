import {
  decodeSocialCandidateRefKey,
  SOCIAL_CANDIDATE_REF_KEY_ENV
} from "../_shared/social-candidate-ref/index.ts";
import {
  decodeMealBuddyCardRefKey,
  MEAL_BUDDY_CARD_REF_KEY_ENV
} from "../_shared/meal-buddy-card-ref/index.ts";

// SR-2G-D needs BOTH frozen reference families: a person reference under the SR-2D authority and a
// card reference under the SR-2G-A authority. They keep separate dedicated secrets on purpose —
// sharing one key would mean a token minted by either family could be opened by the other, which is
// exactly the separation the two primitives exist to create.
export type MealBuddyCandidateListConfig = Readonly<{
  supabaseUrl: string;
  supabaseAnonKey: string;
  candidateRefKey: Uint8Array;
  cardRefKey: Uint8Array;
}>;

export type MealBuddyCandidateListConfigOutcome =
  | { ok: true; value: MealBuddyCandidateListConfig }
  | { ok: false; errorCode: "server_unavailable" };

function readEnvironment(name: string): string | null {
  const value = Deno.env.get(name)?.trim();
  return value ? value : null;
}

// Fails closed on an absent or malformed key. Neither secret is ever the anon key, the service role
// key, a JWT signing secret or the database password, and neither is logged, echoed or returned.
export function loadMealBuddyCandidateListConfig(): MealBuddyCandidateListConfigOutcome {
  const supabaseUrl = readEnvironment("SUPABASE_URL");
  const supabaseAnonKey = readEnvironment("SUPABASE_ANON_KEY");
  const encodedCandidateRefKey = readEnvironment(SOCIAL_CANDIDATE_REF_KEY_ENV);
  const encodedCardRefKey = readEnvironment(MEAL_BUDDY_CARD_REF_KEY_ENV);
  if (!supabaseUrl || !supabaseAnonKey || !encodedCandidateRefKey || !encodedCardRefKey) {
    return { ok: false, errorCode: "server_unavailable" };
  }
  let candidateRefKey: Uint8Array;
  let cardRefKey: Uint8Array;
  try {
    candidateRefKey = decodeSocialCandidateRefKey(encodedCandidateRefKey);
    cardRefKey = decodeMealBuddyCardRefKey(encodedCardRefKey);
  } catch {
    return { ok: false, errorCode: "server_unavailable" };
  }
  return {
    ok: true,
    value: Object.freeze({ supabaseUrl, supabaseAnonKey, candidateRefKey, cardRefKey })
  };
}

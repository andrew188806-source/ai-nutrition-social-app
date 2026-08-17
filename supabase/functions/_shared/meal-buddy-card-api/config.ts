import {
  decodeMealBuddyCardRefKey,
  MEAL_BUDDY_CARD_REF_KEY_ENV
} from "../meal-buddy-card-ref/index.ts";

export type MealBuddyCardConfig = Readonly<{
  supabaseUrl: string;
  supabaseAnonKey: string;
  cardRefKey: Uint8Array;
}>;

export type MealBuddyCardConfigOutcome =
  | { ok: true; value: MealBuddyCardConfig }
  | { ok: false; errorCode: "server_unavailable" };

function readEnvironment(name: string): string | null {
  const value = Deno.env.get(name)?.trim();
  return value ? value : null;
}

// Fails closed on an absent or malformed card-reference key. The key is a dedicated secret: it is
// never the anon key, the service role key, a JWT signing secret, the database password or the
// frozen SR-2D candidate-reference key, and it is never logged, echoed or returned.
export function loadMealBuddyCardConfig(): MealBuddyCardConfigOutcome {
  const supabaseUrl = readEnvironment("SUPABASE_URL");
  const supabaseAnonKey = readEnvironment("SUPABASE_ANON_KEY");
  const encodedCardRefKey = readEnvironment(MEAL_BUDDY_CARD_REF_KEY_ENV);
  if (!supabaseUrl || !supabaseAnonKey || !encodedCardRefKey) {
    return { ok: false, errorCode: "server_unavailable" };
  }
  let cardRefKey: Uint8Array;
  try {
    cardRefKey = decodeMealBuddyCardRefKey(encodedCardRefKey);
  } catch {
    return { ok: false, errorCode: "server_unavailable" };
  }
  return { ok: true, value: Object.freeze({ supabaseUrl, supabaseAnonKey, cardRefKey }) };
}

import { decodeMealBuddyChatRefKey, MEAL_BUDDY_CHAT_REF_KEY_ENV } from "../_shared/meal-buddy-chat-ref/index.ts";
import { decodeMealBuddyRelationshipRefKey, MEAL_BUDDY_RELATIONSHIP_REF_KEY_ENV } from "../_shared/meal-buddy-relationship-ref/index.ts";
export type MealBuddyChatConfig = Readonly<{ supabaseUrl: string; supabaseAnonKey: string; relationshipRefKey: Uint8Array; chatRefKey: Uint8Array }>;
export type MealBuddyChatConfigOutcome = { ok: true; value: MealBuddyChatConfig } | { ok: false; errorCode: "server_unavailable" };
function env(name: string): string | null { const value = Deno.env.get(name)?.trim(); return value || null; }
export function loadMealBuddyChatConfig(): MealBuddyChatConfigOutcome {
  const supabaseUrl = env("SUPABASE_URL"); const supabaseAnonKey = env("SUPABASE_ANON_KEY"); const relationship = env(MEAL_BUDDY_RELATIONSHIP_REF_KEY_ENV); const chat = env(MEAL_BUDDY_CHAT_REF_KEY_ENV);
  if (!supabaseUrl || !supabaseAnonKey || !relationship || !chat) return { ok: false, errorCode: "server_unavailable" };
  try { return { ok: true, value: Object.freeze({ supabaseUrl, supabaseAnonKey, relationshipRefKey: decodeMealBuddyRelationshipRefKey(relationship), chatRefKey: decodeMealBuddyChatRefKey(chat) }) }; }
  catch { return { ok: false, errorCode: "server_unavailable" }; }
}

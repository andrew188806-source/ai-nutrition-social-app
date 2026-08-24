// SR-2K-A — the Meal Buddy opaque-reference boundary.
//
// Five server-issued reference families cross the public boundary of this app. Each one is minted,
// interpreted and revoked by the server alone, and they are SEMANTICALLY DISTINCT:
//
//   mbc1.     one of the actor's own Meal Buddy cards, the source a candidate search runs from
//   scr1.     one candidate person inside one card's pool
//   mbr1.     one relationship between the actor and one counterpart
//   mbchat1.  the one canonical thread of one accepted relationship
//   mbmsg1.   one entry inside that thread
//
// Mobile never decodes a reference, never derives one family from another, never substitutes a
// display name for an identity and never falls back to a raw database identifier. This module is
// the single place that says what a well-formed reference of each family looks like, so a dynamic
// route can fail closed on malformed input BEFORE any transport call is made. It deliberately holds
// no state, performs no I/O and imports nothing: possessing a reference is never authorization, and
// the server re-checks every reference it is handed.

export const MEAL_BUDDY_REF_MAX_LENGTH = 512 as const;

export const MEAL_BUDDY_REF_PREFIXES = Object.freeze({
  card: "mbc1.",
  candidate: "scr1.",
  relationship: "mbr1.",
  thread: "mbchat1.",
  entry: "mbmsg1."
} as const);

export type MealBuddyRefFamily = keyof typeof MEAL_BUDDY_REF_PREFIXES;

const FAMILIES = Object.freeze(Object.keys(MEAL_BUDDY_REF_PREFIXES) as readonly MealBuddyRefFamily[]);

// Distinct brands stop one family from being passed where another is required. The brands exist only
// in the type system; nothing at runtime is attached to the string.
declare const cardRefBrand: unique symbol;
declare const candidateRefBrand: unique symbol;
declare const relationshipRefBrand: unique symbol;
declare const threadRefBrand: unique symbol;
declare const entryRefBrand: unique symbol;
export type MealBuddyCardRefValue = string & { readonly [cardRefBrand]: true };
export type MealBuddyCandidateRefValue = string & { readonly [candidateRefBrand]: true };
export type MealBuddyRelationshipRefValue = string & { readonly [relationshipRefBrand]: true };
export type MealBuddyThreadRefValue = string & { readonly [threadRefBrand]: true };
export type MealBuddyEntryRefValue = string & { readonly [entryRefBrand]: true };

// A reference must resolve to EXACTLY ONE family. Ambiguity is a rejection, not a preference order:
// if a value could be read as two families, no route may pick one of them on the user's behalf.
function matchedFamilies(value: string): readonly MealBuddyRefFamily[] {
  return FAMILIES.filter((family) => value.startsWith(MEAL_BUDDY_REF_PREFIXES[family]));
}

export function isMealBuddyRefOfFamily(value: unknown, family: MealBuddyRefFamily): boolean {
  if (typeof value !== "string") return false;
  const prefix = MEAL_BUDDY_REF_PREFIXES[family];
  // A bare prefix carries no body, and an unbounded value is never a server-issued reference.
  if (value.length <= prefix.length || value.length > MEAL_BUDDY_REF_MAX_LENGTH) return false;
  const matched = matchedFamilies(value);
  return matched.length === 1 && matched[0] === family;
}

export function isMealBuddyCardRef(value: unknown): value is MealBuddyCardRefValue {
  return isMealBuddyRefOfFamily(value, "card");
}
export function isMealBuddyCandidateRef(value: unknown): value is MealBuddyCandidateRefValue {
  return isMealBuddyRefOfFamily(value, "candidate");
}
export function isMealBuddyRelationshipRef(value: unknown): value is MealBuddyRelationshipRefValue {
  return isMealBuddyRefOfFamily(value, "relationship");
}
export function isMealBuddyThreadRef(value: unknown): value is MealBuddyThreadRefValue {
  return isMealBuddyRefOfFamily(value, "thread");
}
export function isMealBuddyEntryRef(value: unknown): value is MealBuddyEntryRefValue {
  return isMealBuddyRefOfFamily(value, "entry");
}

// Normalizes one Expo Router dynamic segment — which may arrive as an array, undefined, or an
// arbitrary user-supplied string — to a single well-formed reference of ONE named family, or to
// null. A route that receives null must fail closed. It may not guess a family, retry with another
// one, or substitute a raw identifier.
export function readMealBuddyRouteRef(
  value: string | readonly string[] | undefined,
  family: MealBuddyRefFamily
): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return isMealBuddyRefOfFamily(raw, family) ? (raw as string) : null;
}

import {
  MEAL_BUDDY_CANDIDATE_API_POLICY_VERSION,
  MEAL_BUDDY_CANDIDATE_CARD_FIELDS,
  MEAL_BUDDY_CANDIDATE_CARD_REF_PREFIX,
  MEAL_BUDDY_CANDIDATE_COMPACT_VISIBLE,
  MEAL_BUDDY_CANDIDATE_FIELDS,
  MEAL_BUDDY_CANDIDATE_INTENTION_TYPES,
  MEAL_BUDDY_CANDIDATE_INTEREST_FIELDS,
  MEAL_BUDDY_CANDIDATE_MAXIMUM,
  MEAL_BUDDY_CANDIDATE_MEAL_PERIODS,
  MEAL_BUDDY_CANDIDATE_PERSON_REF_PREFIX,
  MEAL_BUDDY_CANDIDATE_RESPONSE_FIELDS,
  MEAL_BUDDY_CANDIDATE_RESTAURANT_FIELDS,
  type MealBuddyCandidateApiResponse,
  type MealBuddyCandidateCardDto,
  type MealBuddyCandidateDto,
  type MealBuddyCandidateInterestsDto,
  type MealBuddyCandidateIntentionType,
  type MealBuddyCandidateMealPeriod,
  type MealBuddyCandidateRestaurantDto
} from "./types";

// SR-2G-E1: the single runtime authority validating a meal-buddy-candidate-list response before any
// client trusts it. A response that passes HTTP-level success but fails this check is never rendered.
//
// Validation is exact rather than permissive: an unexpected key is a rejection, not a field to
// ignore. That is what makes a future server-side field addition — a leaked identifier, ranking
// state, score or entitlement flag — fail loudly at the client boundary instead of flowing silently
// into the UI. The two compact interest lines are additionally bounded here, so a server that ever
// returned four categories or a fine-grained tag could not reach a card renderer.
export type MealBuddyCandidateValidationOutcome =
  | { ok: true; value: MealBuddyCandidateApiResponse }
  | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  const expected = [...allowed].sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

// A top-level catalog key is `namespace.category`. A fine-grained selection carries a third segment,
// so this is also the check that stops a candidate's individual interests reaching a compact card.
function isTopLevelCategoryKey(value: unknown, namespace: string): boolean {
  if (typeof value !== "string" || value.length === 0) return false;
  const segments = value.split(".");
  return segments.length === 2 && segments[0] === namespace && segments[1].length > 0;
}

function validateInterestLine(
  value: Record<string, unknown>,
  namespace: "general" | "food",
  index: number
): string | null {
  const keysField = value[`${namespace}CategoryKeys`];
  const overflowField = value[`${namespace}OverflowCount`];
  if (!Array.isArray(keysField)) return `candidates[${index}].interests.${namespace}CategoryKeys is not an array`;
  if (keysField.length > MEAL_BUDDY_CANDIDATE_COMPACT_VISIBLE) {
    return `candidates[${index}].interests.${namespace}CategoryKeys exceeds the compact visible limit`;
  }
  if (!keysField.every((entry) => isTopLevelCategoryKey(entry, namespace))) {
    return `candidates[${index}].interests.${namespace}CategoryKeys carries a non top-level catalog key`;
  }
  if (new Set(keysField).size !== keysField.length) {
    return `candidates[${index}].interests.${namespace}CategoryKeys repeats a category`;
  }
  if (typeof overflowField !== "number" || !Number.isInteger(overflowField) || overflowField < 0) {
    return `candidates[${index}].interests.${namespace}OverflowCount is not a non-negative integer`;
  }
  // Overflow only exists once the visible line is full; a short line with a remainder would mean the
  // server had hidden a category it had room to show.
  if (overflowField > 0 && keysField.length !== MEAL_BUDDY_CANDIDATE_COMPACT_VISIBLE) {
    return `candidates[${index}].interests.${namespace} overflow is set on an unfilled line`;
  }
  return null;
}

function validateInterests(value: unknown, index: number): MealBuddyCandidateInterestsDto | string {
  if (!isRecord(value)) return `candidates[${index}].interests is not an object`;
  if (!exactKeys(value, MEAL_BUDDY_CANDIDATE_INTEREST_FIELDS)) {
    return `candidates[${index}].interests does not carry exactly the four compact fields`;
  }
  for (const namespace of ["general", "food"] as const) {
    const failure = validateInterestLine(value, namespace, index);
    if (failure) return failure;
  }
  return Object.freeze({
    generalCategoryKeys: Object.freeze([...(value.generalCategoryKeys as readonly string[])]),
    generalOverflowCount: value.generalOverflowCount as number,
    foodCategoryKeys: Object.freeze([...(value.foodCategoryKeys as readonly string[])]),
    foodOverflowCount: value.foodOverflowCount as number
  });
}

function validateRestaurant(value: unknown, index: number): MealBuddyCandidateRestaurantDto | null | string {
  // A general card genuinely has no restaurant. That is null, never an empty object.
  if (value === null) return null;
  if (!isRecord(value)) return `candidates[${index}].card.restaurant is neither an object nor null`;
  if (!exactKeys(value, MEAL_BUDDY_CANDIDATE_RESTAURANT_FIELDS)) {
    return `candidates[${index}].card.restaurant does not carry exactly restaurantId and name`;
  }
  if (typeof value.restaurantId !== "string" || value.restaurantId.length === 0) {
    return `candidates[${index}].card.restaurant.restaurantId is not a non-empty string`;
  }
  if (value.name !== null && typeof value.name !== "string") {
    return `candidates[${index}].card.restaurant.name is neither a string nor null`;
  }
  return Object.freeze({ restaurantId: value.restaurantId, name: value.name });
}

function validateCard(value: unknown, index: number): MealBuddyCandidateCardDto | string {
  if (!isRecord(value)) return `candidates[${index}].card is not an object`;
  if (!exactKeys(value, MEAL_BUDDY_CANDIDATE_CARD_FIELDS)) {
    return `candidates[${index}].card does not carry exactly the four public card fields`;
  }
  // A dining date is a local calendar fact and stays the exact YYYY-MM-DD the server sent. It is
  // never parsed into a Date here: converting it would reintroduce the UTC drift the server's `date`
  // column exists to avoid.
  if (typeof value.diningDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.diningDate)) {
    return `candidates[${index}].card.diningDate is not a YYYY-MM-DD calendar date`;
  }
  if (!MEAL_BUDDY_CANDIDATE_MEAL_PERIODS.includes(value.mealPeriod as MealBuddyCandidateMealPeriod)) {
    return `candidates[${index}].card.mealPeriod is not a canonical meal period`;
  }
  if (!MEAL_BUDDY_CANDIDATE_INTENTION_TYPES.includes(value.intentionType as MealBuddyCandidateIntentionType)) {
    return `candidates[${index}].card.intentionType is not a canonical intention`;
  }
  const restaurant = validateRestaurant(value.restaurant, index);
  if (typeof restaurant === "string") return restaurant;
  return Object.freeze({
    diningDate: value.diningDate,
    mealPeriod: value.mealPeriod as MealBuddyCandidateMealPeriod,
    intentionType: value.intentionType as MealBuddyCandidateIntentionType,
    restaurant
  });
}

function validateCandidate(value: unknown, index: number): MealBuddyCandidateDto | string {
  if (!isRecord(value)) return `candidates[${index}] is not an object`;
  if (!exactKeys(value, MEAL_BUDDY_CANDIDATE_FIELDS)) {
    return `candidates[${index}] does not carry exactly the eight public fields`;
  }
  // The prefix is asserted, never parsed past. It proves the reference belongs to the expected
  // family; everything beyond it stays opaque ciphertext to this client.
  if (typeof value.candidateRef !== "string" || !value.candidateRef.startsWith(MEAL_BUDDY_CANDIDATE_PERSON_REF_PREFIX)) {
    return `candidates[${index}].candidateRef is not an opaque person reference`;
  }
  if (typeof value.candidateCardRef !== "string" || !value.candidateCardRef.startsWith(MEAL_BUDDY_CANDIDATE_CARD_REF_PREFIX)) {
    return `candidates[${index}].candidateCardRef is not an opaque card reference`;
  }
  if (typeof value.displayName !== "string" || value.displayName.length === 0) {
    return `candidates[${index}].displayName is not a non-empty string`;
  }
  if (typeof value.mascotAvatarKey !== "string" || value.mascotAvatarKey.length === 0) {
    return `candidates[${index}].mascotAvatarKey is not a non-empty string`;
  }
  // A missing public bio is a real, expected state and stays null; it is never coerced to "".
  if (value.publicBio !== null && typeof value.publicBio !== "string") {
    return `candidates[${index}].publicBio is neither a string nor null`;
  }
  // Presentation only. A candidate unwilling to chat is still rendered; this is never a filter.
  if (typeof value.willingToChat !== "boolean") {
    return `candidates[${index}].willingToChat is not a boolean`;
  }
  const interests = validateInterests(value.interests, index);
  if (typeof interests === "string") return interests;
  const card = validateCard(value.card, index);
  if (typeof card === "string") return card;
  return Object.freeze({
    candidateRef: value.candidateRef,
    candidateCardRef: value.candidateCardRef,
    displayName: value.displayName,
    mascotAvatarKey: value.mascotAvatarKey,
    publicBio: value.publicBio,
    willingToChat: value.willingToChat,
    interests,
    card
  });
}

export function validateMealBuddyCandidateApiResponseV1(value: unknown): MealBuddyCandidateValidationOutcome {
  if (!isRecord(value)) return { ok: false, reason: "response is not an object" };
  if (!exactKeys(value, MEAL_BUDDY_CANDIDATE_RESPONSE_FIELDS)) {
    return { ok: false, reason: "response does not carry exactly policyVersion and candidates" };
  }
  if (value.policyVersion !== MEAL_BUDDY_CANDIDATE_API_POLICY_VERSION) {
    return { ok: false, reason: "unexpected policyVersion" };
  }
  if (!Array.isArray(value.candidates)) return { ok: false, reason: "candidates is not an array" };
  // Longer than the frozen Premium cap is a server contract breach. It is reported, never trimmed:
  // trimming here would move the exposure decision onto the device.
  if (value.candidates.length > MEAL_BUDDY_CANDIDATE_MAXIMUM) {
    return { ok: false, reason: "candidates exceeds the frozen exposure cap" };
  }

  const candidates: MealBuddyCandidateDto[] = [];
  const seenPersonRefs = new Set<string>();
  for (let index = 0; index < value.candidates.length; index += 1) {
    const candidate = validateCandidate(value.candidates[index], index);
    if (typeof candidate === "string") return { ok: false, reason: candidate };
    // One owner appears at most once; a repeat would mean the frozen one-card-per-owner reduction
    // had been violated upstream.
    if (seenPersonRefs.has(candidate.candidateRef)) {
      return { ok: false, reason: `candidates[${index}].candidateRef is repeated` };
    }
    seenPersonRefs.add(candidate.candidateRef);
    candidates.push(candidate);
  }
  // An empty list is a valid, successful response, never a failure.
  return {
    ok: true,
    value: Object.freeze({
      policyVersion: MEAL_BUDDY_CANDIDATE_API_POLICY_VERSION,
      candidates: Object.freeze(candidates)
    })
  };
}

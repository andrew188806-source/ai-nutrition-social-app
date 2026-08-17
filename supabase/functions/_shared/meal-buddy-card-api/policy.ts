// SR-2G-B Meal Buddy card write policy. The whole configurable surface of the write boundary:
// there is no caller-tunable cap, period, ordering or lifetime anywhere below.

export const MEAL_BUDDY_CARD_WRITE_POLICY_VERSION = "meal-buddy-card-write-api-v1" as const;

export const MEAL_BUDDY_CARD_TYPES = Object.freeze(["general", "restaurant"] as const);
export const MEAL_BUDDY_INTENTION_TYPES = Object.freeze(["chat_first", "eat_together"] as const);
export const MEAL_BUDDY_MEAL_PERIODS = Object.freeze(["breakfast", "lunch", "dinner", "late_night"] as const);

// The frozen product quota. Free may hold one card of each kind; Premium may hold three general and
// two restaurant cards. Only effectively active cards count — a cancelled or expired card consumes
// nothing. These numbers are server authority: no request field, header or token can reach them.
export const MEAL_BUDDY_CARD_QUOTA = Object.freeze({
  free: Object.freeze({ general: 1, restaurant: 1 }),
  premium: Object.freeze({ general: 3, restaurant: 2 })
});

// The canonical product timezone. A dining date is a local calendar fact, so "is this date in the
// past" must be answered in Taipei, never in UTC — between 00:00 and 08:00 local the two disagree
// and a UTC answer would reject a card the user may legitimately create.
export const MEAL_BUDDY_CARD_TIMEZONE = "Asia/Taipei" as const;

export const MEAL_BUDDY_CARD_CONTRACT_ERROR = "meal_buddy_card_contract_violated" as const;

export function mealBuddyCardContractViolation(): never {
  throw new Error(MEAL_BUDDY_CARD_CONTRACT_ERROR);
}

// Resolves the caps for an already-resolved entitlement class. The class itself is produced only by
// the frozen SR-2B resolver reading subscription_entitlements through the authenticated client.
export function resolveMealBuddyCardCaps(entitlementClass: "free" | "premium") {
  const caps = MEAL_BUDDY_CARD_QUOTA[entitlementClass];
  if (!caps) return mealBuddyCardContractViolation();
  return caps;
}

// Today's date in Asia/Taipei as YYYY-MM-DD. Uses the Intl calendar rather than an offset constant
// so the answer stays correct if the zone's rules ever change.
export function taipeiCalendarDate(instant: Date): string {
  if (!(instant instanceof Date) || !Number.isFinite(instant.getTime())) {
    return mealBuddyCardContractViolation();
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MEAL_BUDDY_CARD_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(instant);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parts)) return mealBuddyCardContractViolation();
  return parts;
}

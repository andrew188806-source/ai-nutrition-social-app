import {
  MEAL_BUDDY_CARD_TYPES,
  MEAL_BUDDY_INTENTION_TYPES,
  MEAL_BUDDY_MEAL_PERIODS,
  taipeiCalendarDate
} from "./policy.ts";
import type { MealBuddyCardCreateRequest } from "./types.ts";

// The create body has exactly these seven keys. An unknown key is a rejection rather than something
// quietly ignored: a request that tried to name an owner, a cap or a lifetime must fail loudly.
const CREATE_KEYS = Object.freeze([
  "cardType", "intentionType", "restaurantId", "area", "diningDate", "mealPeriod", "preferredTime"
]);

const CARD_TYPES = new Set<string>(MEAL_BUDDY_CARD_TYPES);
const INTENTION_TYPES = new Set<string>(MEAL_BUDDY_INTENTION_TYPES);
const MEAL_PERIODS = new Set<string>(MEAL_BUDDY_MEAL_PERIODS);

const MAX_TEXT = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown): { ok: true; value: string | null } | { ok: false } {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false };
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_TEXT) return { ok: false };
  return { ok: true, value: trimmed };
}

// A real calendar date, not merely a well-shaped string: 2026-02-30 matches the pattern and is not
// a date. Round-tripping through UTC midnight is safe here because only the calendar fields are
// compared, never an instant.
function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year
    && probe.getUTCMonth() === month - 1
    && probe.getUTCDate() === day;
}

function isClockTime(value: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [hours, minutes] = value.split(":").map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

export type MealBuddyCardCreateValidation =
  | { ok: true; value: MealBuddyCardCreateRequest }
  | { ok: false };

// `requestInstant` decides only what "today" means, and it is decided in Asia/Taipei. A caller
// cannot supply it.
export function validateMealBuddyCardCreateRequest(
  body: unknown,
  requestInstant: Date
): MealBuddyCardCreateValidation {
  if (!isRecord(body)) return { ok: false };

  const keys = Object.keys(body).sort();
  const expected = [...CREATE_KEYS].sort();
  if (keys.length !== expected.length || !keys.every((key, index) => key === expected[index])) {
    return { ok: false };
  }

  const { cardType, intentionType, mealPeriod, diningDate } = body;
  if (typeof cardType !== "string" || !CARD_TYPES.has(cardType)) return { ok: false };
  if (typeof intentionType !== "string" || !INTENTION_TYPES.has(intentionType)) return { ok: false };
  if (typeof mealPeriod !== "string" || !MEAL_PERIODS.has(mealPeriod)) return { ok: false };
  if (typeof diningDate !== "string" || !isCalendarDate(diningDate)) return { ok: false };

  // The date comparison is lexicographic on YYYY-MM-DD, which is exactly chronological, and both
  // sides are Taipei calendar dates.
  if (diningDate < taipeiCalendarDate(requestInstant)) return { ok: false };

  const restaurantId = optionalText(body.restaurantId);
  if (!restaurantId.ok) return { ok: false };
  const area = optionalText(body.area);
  if (!area.ok) return { ok: false };

  // A restaurant card without a restaurant is a contradiction, not a weaker card. The database
  // enforces this too; rejecting here keeps the failure a 400 rather than a 503.
  if (cardType === "restaurant" && restaurantId.value === null) return { ok: false };

  let preferredTime: string | null = null;
  if (body.preferredTime !== null) {
    if (typeof body.preferredTime !== "string" || !isClockTime(body.preferredTime)) return { ok: false };
    preferredTime = body.preferredTime;
  }

  return {
    ok: true,
    value: Object.freeze({
      cardType: cardType as MealBuddyCardCreateRequest["cardType"],
      intentionType: intentionType as MealBuddyCardCreateRequest["intentionType"],
      restaurantId: restaurantId.value,
      area: area.value,
      diningDate,
      mealPeriod: mealPeriod as MealBuddyCardCreateRequest["mealPeriod"],
      preferredTime
    })
  };
}

// The cancel body is exactly one key.
export type MealBuddyCardCancelValidation =
  | { ok: true; value: Readonly<{ sourceCardRef: string }> }
  | { ok: false };

export function validateMealBuddyCardCancelRequest(body: unknown): MealBuddyCardCancelValidation {
  if (!isRecord(body)) return { ok: false };
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== "sourceCardRef") return { ok: false };
  const ref = body.sourceCardRef;
  if (typeof ref !== "string" || ref.trim().length === 0 || ref.length > 4096) return { ok: false };
  return { ok: true, value: Object.freeze({ sourceCardRef: ref }) };
}

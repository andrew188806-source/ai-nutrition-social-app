import type { U1NextMealBuddyPrefillViewModel } from "../next-meal-prototype";

export type MealBuddyCardCreateMealPeriod = "breakfast" | "lunch" | "dinner" | "late_night";

export type RecommendationMealBuddyCardCreateRequest = Readonly<{
  cardType: "restaurant";
  intentionType: "chat_first";
  restaurantId: string;
  area: string | null;
  diningDate: string;
  mealPeriod: MealBuddyCardCreateMealPeriod;
  preferredTime: string | null;
  selectedRecommendation: NonNullable<U1NextMealBuddyPrefillViewModel["selectedRecommendation"]>;
}>;

export type CreatedMealBuddyCard = Readonly<{
  sourceCardRef: string;
  restaurantId: string | null;
  foodContextTagKey: string | null;
}>;

export type RecommendationMealBuddyCardCreateResult =
  | { ok: true; card: CreatedMealBuddyCard }
  | {
      ok: false;
      errorCode:
        | "authentication_required"
        | "configuration_error"
        | "invalid_request"
        | "card_quota_exceeded"
        | "network_error"
        | "invalid_server_response";
    };

export function buildRecommendationMealBuddyCardCreateRequest(
  prefill: U1NextMealBuddyPrefillViewModel,
  instant = new Date()
): RecommendationMealBuddyCardCreateRequest | null {
  const selected = prefill.selectedRecommendation;
  if (!selected || !Number.isFinite(instant.getTime())) return null;
  const taipeiParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(instant);
  const values = new Map(taipeiParts.map((part) => [part.type, part.value]));
  const hour = Number(values.get("hour"));
  const diningDate = `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(diningDate) || !Number.isInteger(hour)) return null;
  const mealPeriod: MealBuddyCardCreateMealPeriod = hour < 9
    ? "breakfast"
    : hour < 14
      ? "lunch"
      : hour < 21
        ? "dinner"
        : "late_night";
  return Object.freeze({
    cardType: "restaurant",
    intentionType: "chat_first",
    restaurantId: selected.restaurantId,
    area: prefill.area.trim() || null,
    diningDate,
    mealPeriod,
    preferredTime: null,
    selectedRecommendation: Object.freeze({ ...selected })
  });
}

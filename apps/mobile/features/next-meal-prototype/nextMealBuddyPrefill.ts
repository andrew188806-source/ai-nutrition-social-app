import type { U1NextMealBuddyPrefillViewModel, U1NextMealCandidateViewModel } from "./types";

type PendingU1NextMealBuddyPrefill = {
  token: string;
  value: U1NextMealBuddyPrefillViewModel;
};

let pendingPrefill: PendingU1NextMealBuddyPrefill | null = null;
let nextHandoffSequence = 0;

export function buildU1NextMealBuddyPrefill(recommendation: U1NextMealCandidateViewModel): U1NextMealBuddyPrefillViewModel {
  return {
    handoffId: `u1-next-meal-${recommendation.prototypeId}`,
    source: "u1_next_meal_prototype",
    foodName: recommendation.mealName,
    foodCategory: recommendation.tags.slice(0, 2).join("、"),
    restaurantName: recommendation.restaurantName ?? "",
    area: recommendation.areaLabel ?? "",
    preferredTime: "下一餐",
    note: recommendation.reasonSummary
  };
}

export function stageU1NextMealBuddyPrefill(value: U1NextMealBuddyPrefillViewModel): string | null {
  if (!isValidU1NextMealBuddyPrefill(value)) {
    pendingPrefill = null;
    return null;
  }

  nextHandoffSequence += 1;
  const token = `u1-next-meal-prefill-${nextHandoffSequence}`;
  pendingPrefill = { token, value: { ...value, handoffId: token } };
  return token;
}

export function consumeU1NextMealBuddyPrefill(token: unknown): U1NextMealBuddyPrefillViewModel | null {
  if (!pendingPrefill) {
    return null;
  }

  if (typeof token !== "string" || !token) {
    pendingPrefill = null;
    return null;
  }

  if (pendingPrefill.token !== token) {
    pendingPrefill = null;
    return null;
  }

  const value = pendingPrefill.value;
  pendingPrefill = null;
  return isValidU1NextMealBuddyPrefill(value) ? { ...value } : null;
}

export function clearU1NextMealBuddyPrefill() {
  pendingPrefill = null;
}

export function hasPendingU1NextMealBuddyPrefill() {
  return pendingPrefill !== null;
}

function isValidU1NextMealBuddyPrefill(value: unknown): value is U1NextMealBuddyPrefillViewModel {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<U1NextMealBuddyPrefillViewModel>;
  return (
    candidate.source === "u1_next_meal_prototype" &&
    typeof candidate.handoffId === "string" &&
    candidate.handoffId.startsWith("u1-next-meal-") &&
    typeof candidate.foodName === "string" &&
    candidate.foodName.trim().length > 0 &&
    typeof candidate.foodCategory === "string" &&
    typeof candidate.restaurantName === "string" &&
    typeof candidate.area === "string" &&
    typeof candidate.preferredTime === "string" &&
    typeof candidate.note === "string"
  );
}

import type { U1NextMealBuddyPrefillViewModel, U1NextMealCandidateViewModel } from "./types";

type PendingU1NextMealBuddyPrefill = {
  token: string;
  value: U1NextMealBuddyPrefillViewModel;
};

let pendingPrefill: PendingU1NextMealBuddyPrefill | null = null;
let nextHandoffSequence = 0;

export function buildU1NextMealBuddyPrefill(recommendation: U1NextMealCandidateViewModel): U1NextMealBuddyPrefillViewModel {
  const selectedRecommendation = !recommendation.isSampleData
    && recommendation.branchMenuItemId
    && recommendation.menuItemId
    && recommendation.restaurantId
    && recommendation.branchId
    ? {
        source: "canonical_next_meal" as const,
        branchMenuItemId: recommendation.branchMenuItemId,
        menuItemId: recommendation.menuItemId,
        restaurantId: recommendation.restaurantId,
        branchId: recommendation.branchId
      }
    : null;
  return {
    handoffId: `u1-next-meal-${recommendation.prototypeId}`,
    source: "u1_next_meal_prototype",
    foodName: recommendation.mealName,
    restaurantName: recommendation.restaurantName ?? "",
    area: recommendation.areaLabel ?? "",
    preferredTime: "下一餐",
    note: recommendation.reasonSummary,
    selectedRecommendation
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
    typeof candidate.restaurantName === "string" &&
    typeof candidate.area === "string" &&
    typeof candidate.preferredTime === "string" &&
    typeof candidate.note === "string" &&
    isValidSelectedRecommendation(candidate.selectedRecommendation)
  );
}

function isValidSelectedRecommendation(value: unknown): boolean {
  if (value === null) return true;
  if (!value || typeof value !== "object") return false;
  const identity = value as Record<string, unknown>;
  const keys = Object.keys(identity).sort();
  const expected = ["branchId", "branchMenuItemId", "menuItemId", "restaurantId", "source"].sort();
  return keys.length === expected.length
    && keys.every((key, index) => key === expected[index])
    && identity.source === "canonical_next_meal"
    && [identity.branchMenuItemId, identity.menuItemId, identity.restaurantId, identity.branchId]
      .every((entry) => typeof entry === "string" && entry.trim().length > 0);
}

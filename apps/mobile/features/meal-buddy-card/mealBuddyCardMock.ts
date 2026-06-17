import { zhTW } from "../../../../lib/i18n/zh-TW";
import { getCommunityCardSettings } from "../community-card-settings/communityCardSettingsStore";
import { getEffectiveCurrentDate, getEffectiveDateKey } from "../demo-time";
import type { MealBuddyCard, MealBuddyCardSourceType, MealBuddyCandidate, MealBuddyIntentionType } from "./types";

const now = "2026-06-01T12:00:00+08:00";
const expires = "2026-06-01T21:00:00+08:00";
let cardSequence = 0;

export function createMealBuddyCard(input: Partial<MealBuddyCard> & { sourceType: MealBuddyCardSourceType; intentionType: MealBuddyIntentionType }): MealBuddyCard {
  cardSequence += 1;
  return {
    userId: input.userId ?? "demo-user",
    cardType: input.cardType ?? (input.sourceType === "restaurant_page" ? "restaurant" : "general"),
    sourceType: input.sourceType,
    intentionType: input.intentionType,
    preferredFoodName: input.preferredFoodName ?? "",
    restaurantId: input.restaurantId ?? "",
    restaurantName: input.restaurantName ?? "",
    foodCategory: input.foodCategory ?? "",
    area: input.area ?? "",
    preferredTime: input.preferredTime ?? "",
    nutritionGoal: input.nutritionGoal ?? "",
    maxParticipants: input.maxParticipants ?? 4,
    currentParticipants: input.currentParticipants ?? 1,
    isLargeTableEnabled: input.isLargeTableEnabled ?? false,
    visibilityStatus: input.visibilityStatus ?? "active",
    diningDate: input.diningDate ?? getEffectiveDateKey(),
    createdAt: input.createdAt ?? `${now}#${cardSequence}`,
    expiresAt: input.expiresAt ?? expires
  };
}

export function getCommunityMealTime(mealPeriod: string) {
  const settings = getCommunityCardSettings();
  if (mealPeriod === zhTW.mobile.refinedLogic.mealBuddyCard.mealPeriods[0]) {
    return settings.breakfastTime;
  }
  if (mealPeriod === zhTW.mobile.refinedLogic.mealBuddyCard.mealPeriods[1]) {
    return settings.lunchTime;
  }
  if (mealPeriod === zhTW.mobile.refinedLogic.mealBuddyCard.mealPeriods[2]) {
    return settings.dinnerTime;
  }
  return settings.lateNightTime;
}

export function getDefaultInteractionPreference(): MealBuddyIntentionType {
  const settings = getCommunityCardSettings();
  return settings.gatheringStyle.includes("聊") ? "chat_first" : "eat_together";
}

export function getAiRecommendationMealBuddyCard(mealPeriod: string = zhTW.mobile.refinedLogic.mealBuddyCard.mealPeriods[2]) {
  // Backend integration entry: AI Analysis -> Meal Buddy Card.
  const copy = zhTW.mobile.refinedLogic.mealBuddyCard.prefill.aiRecommendation;
  return createMealBuddyCard({
    cardType: "general",
    sourceType: "ai_recommendation",
    intentionType: getDefaultInteractionPreference(),
    preferredFoodName: copy.preferredFoodName,
    restaurantName: copy.restaurantName,
    foodCategory: copy.foodCategory,
    area: copy.area,
    preferredTime: getCommunityMealTime(mealPeriod),
    nutritionGoal: copy.nutritionGoal,
    // AI analysis recommendations are always for today; no future date selection.
    diningDate: getEffectiveDateKey()
  });
}

export function getRestaurantMealBuddyCard(restaurantName: string, restaurantId: string, foodCategory: string, area: string, preferredTime: string, diningDate: string) {
  // Backend integration entry: Restaurant -> Meal Buddy Card.
  return createMealBuddyCard({
    cardType: "restaurant",
    sourceType: "restaurant_page",
    intentionType: getDefaultInteractionPreference(),
    restaurantId,
    restaurantName,
    foodCategory,
    area,
    preferredFoodName: foodCategory,
    preferredTime,
    nutritionGoal: "想在這間餐廳找飯友",
    diningDate
  });
}

export function describeDiningDate(diningDate: string) {
  const options = zhTW.mobile.refinedLogic.mealBuddyCard.diningDateOptions;
  const todayKey = getEffectiveDateKey();
  if (diningDate === todayKey) {
    return options[0];
  }
  const tomorrowKey = new Date(getEffectiveCurrentDate().getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (diningDate === tomorrowKey) {
    return options[1];
  }
  return diningDate;
}

export function getManualMealBuddyCard(mealPeriod: string, preferredFoodName?: string, foodCategory?: string) {
  const copy = zhTW.mobile.refinedLogic.mealBuddyCard.prefill.manual;
  return createMealBuddyCard({
    cardType: "general",
    sourceType: "manual",
    intentionType: getDefaultInteractionPreference(),
    preferredFoodName: preferredFoodName || copy.preferredFoodName,
    restaurantName: copy.restaurantName,
    foodCategory: foodCategory || copy.foodCategory,
    area: copy.area,
    preferredTime: getCommunityMealTime(mealPeriod),
    nutritionGoal: copy.nutritionGoal
  });
}

export function getMealBuddyCandidates(): MealBuddyCandidate[] {
  return zhTW.mobile.refinedLogic.mealBuddyCard.candidates.map((candidate) => ({
    ...candidate,
    intentionType: candidate.intentionType as MealBuddyIntentionType
  }));
}

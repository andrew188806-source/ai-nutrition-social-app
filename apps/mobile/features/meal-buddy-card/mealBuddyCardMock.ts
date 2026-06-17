import { zhTW } from "../../../../lib/i18n/zh-TW";
import { getCommunityCardSettings } from "../community-card-settings/communityCardSettingsStore";
import { getEffectiveCurrentDate, getEffectiveDateKey } from "../demo-time";
import { getCanonicalMenuItemById, getCanonicalRestaurantById, getCanonicalRestaurantByName, getPrimaryMenuItemForRestaurant } from "../restaurants";
import { getMockMealBuddyCandidates, getMockProfile } from "./mealBuddyFlowMock";
import type { MealBuddyCard, MealBuddyCardSourceType, MealBuddyCandidate, MealBuddyIntentionType } from "./types";

const now = "2026-06-01T12:00:00+08:00";
const expires = "2026-06-01T21:00:00+08:00";
let cardSequence = 0;

export function createMealBuddyCard(input: Partial<MealBuddyCard> & { sourceType: MealBuddyCardSourceType; intentionType: MealBuddyIntentionType }): MealBuddyCard {
  cardSequence += 1;
  const restaurant = input.restaurantId ? getCanonicalRestaurantById(input.restaurantId) : getCanonicalRestaurantByName(input.restaurantName);
  const menuItem = input.menuItemId ? getCanonicalMenuItemById(input.menuItemId) : restaurant ? getPrimaryMenuItemForRestaurant(restaurant.restaurantId) : null;
  const diningDate = input.diningDate ?? input.mealDate ?? getEffectiveDateKey();
  const preferredTime = input.preferredTime ?? input.mealTime ?? "";
  return {
    userId: input.userId ?? "current-user",
    profileId: input.profileId ?? input.userId ?? "current-user",
    cardType: input.cardType ?? (input.sourceType === "restaurant_page" ? "restaurant" : "general"),
    sourceType: input.sourceType,
    intentionType: input.intentionType,
    diningMode: input.diningMode ?? (input.intentionType === "chat_first" ? "chatFirst" : "eatTogether"),
    preferredFoodName: input.preferredFoodName ?? menuItem?.name ?? "",
    restaurantId: restaurant?.restaurantId ?? input.restaurantId ?? "",
    menuItemId: menuItem?.menuItemId ?? input.menuItemId,
    restaurantName: restaurant?.name ?? input.restaurantName ?? "",
    foodCategory: input.foodCategory ?? restaurant?.category ?? "",
    area: input.area ?? "",
    preferredTime,
    mealTime: input.mealTime ?? preferredTime,
    mealDate: input.mealDate ?? diningDate,
    nutritionGoal: input.nutritionGoal ?? "",
    paymentPreference: input.paymentPreference ?? "AA 制",
    note: input.note ?? input.nutritionGoal ?? "",
    status: input.status ?? (input.visibilityStatus === "matched" ? "matched" : "active"),
    maxParticipants: input.maxParticipants ?? 4,
    currentParticipants: input.currentParticipants ?? 1,
    isLargeTableEnabled: input.isLargeTableEnabled ?? false,
    visibilityStatus: input.visibilityStatus ?? "active",
    diningDate,
    createdAt: input.createdAt ?? `${now}#${cardSequence}`,
    expiresAt: input.expiresAt ?? expires
  };
}

export function buildMealBuddyCardFromProfile(
  profileId: string,
  restaurantId: string,
  menuItemId: string | undefined,
  options: Partial<MealBuddyCard> = {}
): MealBuddyCard {
  const profile = getMockProfile(profileId);
  const restaurant = getCanonicalRestaurantById(restaurantId);
  const menuItem = getCanonicalMenuItemById(menuItemId) ?? getPrimaryMenuItemForRestaurant(restaurant?.restaurantId ?? restaurantId);
  const intentionType = options.intentionType ?? (options.diningMode === "eatTogether" ? "eat_together" : "chat_first");
  const mealTime = options.mealTime ?? options.preferredTime ?? profile?.preferredMealTypes[0] ?? "晚餐";
  const mealDate = options.mealDate ?? options.diningDate ?? getEffectiveDateKey();

  return createMealBuddyCard({
    ...options,
    userId: profileId,
    profileId,
    cardType: options.cardType ?? "general",
    sourceType: options.sourceType ?? "manual",
    intentionType,
    diningMode: options.diningMode ?? (intentionType === "chat_first" ? "chatFirst" : "eatTogether"),
    restaurantId: restaurant?.restaurantId ?? restaurantId,
    menuItemId: menuItem?.menuItemId ?? menuItemId,
    restaurantName: restaurant?.name ?? options.restaurantName ?? "",
    preferredFoodName: menuItem?.name ?? options.preferredFoodName ?? "",
    foodCategory: restaurant?.category ?? options.foodCategory ?? "",
    area: profile?.area ?? options.area ?? restaurant?.location ?? "",
    preferredTime: mealTime,
    mealTime,
    diningDate: mealDate,
    mealDate,
    nutritionGoal: options.nutritionGoal ?? profile?.nutritionGoalSummary ?? "",
    paymentPreference: options.paymentPreference ?? "AA 制",
    note: options.note ?? profile?.intro ?? "",
    status: options.status ?? "active"
  });
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
  return settings.gatheringStyle.includes("聊天") ? "chat_first" : "eat_together";
}

export function getAiRecommendationMealBuddyCard(mealPeriod: string = zhTW.mobile.refinedLogic.mealBuddyCard.mealPeriods[2]) {
  const copy = zhTW.mobile.refinedLogic.mealBuddyCard.prefill.aiRecommendation;
  return buildMealBuddyCardFromProfile("current-user", "restaurant-mori-veggie", "dish-mori-1", {
    cardType: "general",
    sourceType: "ai_recommendation",
    intentionType: getDefaultInteractionPreference(),
    preferredFoodName: copy.preferredFoodName,
    foodCategory: copy.foodCategory,
    area: copy.area,
    preferredTime: getCommunityMealTime(mealPeriod),
    mealTime: getCommunityMealTime(mealPeriod),
    nutritionGoal: copy.nutritionGoal,
    note: "依照今日營養分析建立，優先找餐點與時間接近的飯友。",
    diningDate: getEffectiveDateKey(),
    mealDate: getEffectiveDateKey()
  });
}

export function getRestaurantMealBuddyCard(restaurantName: string, restaurantId: string, menuItemId: string | undefined, foodCategory: string, area: string, preferredTime: string, diningDate: string) {
  const restaurant = getCanonicalRestaurantById(restaurantId) ?? getCanonicalRestaurantByName(restaurantName);
  const menuItem = menuItemId ? getCanonicalMenuItemById(menuItemId) : restaurant ? getPrimaryMenuItemForRestaurant(restaurant.restaurantId) : null;
  return buildMealBuddyCardFromProfile("current-user", restaurant?.restaurantId ?? restaurantId, menuItem?.menuItemId ?? menuItemId, {
    cardType: "restaurant",
    sourceType: "restaurant_page",
    intentionType: getDefaultInteractionPreference(),
    restaurantName: restaurant?.name ?? restaurantName,
    foodCategory: restaurant?.category ?? foodCategory,
    area,
    preferredFoodName: menuItem?.name ?? foodCategory,
    preferredTime,
    mealTime: preferredTime,
    nutritionGoal: "依照餐廳菜單建立飯友卡，優先找時間與餐點接近的人。",
    paymentPreference: "AA 制",
    note: "從餐廳頁建立，餐廳與餐點以 canonical restaurant/menu id 為準。",
    diningDate,
    mealDate: diningDate
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
  return buildMealBuddyCardFromProfile("current-user", "restaurant-haochu-bowl", "dish-haochu-1", {
    cardType: "general",
    sourceType: "manual",
    intentionType: getDefaultInteractionPreference(),
    preferredFoodName: preferredFoodName || copy.preferredFoodName,
    foodCategory: foodCategory || copy.foodCategory,
    area: copy.area,
    preferredTime: getCommunityMealTime(mealPeriod),
    mealTime: getCommunityMealTime(mealPeriod),
    nutritionGoal: copy.nutritionGoal,
    note: "手動建立的飯友卡，仍保留 profileId 與 canonical 餐廳餐點參照。"
  });
}

export function getMealBuddyCandidates(): MealBuddyCandidate[] {
  return getMockMealBuddyCandidates();
}
